// Exact money arithmetic. Amounts are BigInt "cents" (1/100 of the major unit,
// the storage scale of numeric(12,2)); quantities are BigInt thousandths
// (numeric(12,3)). Values enter as decimal text and leave as decimal text,
// so no amount ever passes through a JavaScript float.

const MONEY_SCALE = 2;
const QTY_SCALE = 3;

export class MoneyError extends Error {}

function parseDecimal(value, scale, what) {
  // JSON numbers are accepted only via their exact shortest decimal text.
  const text = typeof value === 'number' ? String(value) : value;
  if (typeof text !== 'string') throw new MoneyError(`${what} must be a decimal`);
  const m = /^(-)?(\d+)(?:\.(\d+))?$/.exec(text.trim());
  if (!m) throw new MoneyError(`${what} is not a valid decimal: ${text}`);
  const [, sign, int, frac = ''] = m;
  // Postgres numeric text may carry trailing zeros (e.g. "5.000"); only significant digits count.
  const significant = frac.replace(/0+$/, '');
  if (significant.length > scale) throw new MoneyError(`${what} has more than ${scale} decimals: ${text}`);
  const units = BigInt(int + significant.padEnd(scale, '0'));
  return sign ? -units : units;
}

function formatDecimal(units, scale) {
  const neg = units < 0n;
  const digits = (neg ? -units : units).toString().padStart(scale + 1, '0');
  const out = `${digits.slice(0, -scale)}.${digits.slice(-scale)}`;
  return neg ? `-${out}` : out;
}

/** n / d rounded half away from zero (matches Postgres ROUND(numeric)). */
export function divRound(n, d) {
  const q = n / d;
  const r = n % d;
  if (2n * (r < 0n ? -r : r) >= (d < 0n ? -d : d)) return q + ((n < 0n) === (d < 0n) ? 1n : -1n);
  return q;
}

export const toCents = (v) => parseDecimal(v, MONEY_SCALE, 'amount');
export const toMilli = (v) => parseDecimal(v, QTY_SCALE, 'quantity');
/** Exact decimal string, e.g. for SQL parameters. */
export const centsToString = (c) => formatDecimal(c, MONEY_SCALE);
export const milliToString = (q) => formatDecimal(q, QTY_SCALE);
/** JSON output: the nearest double of an exact 2-dp decimal round-trips to the same text. */
export const centsToNumber = (c) => Number(centsToString(c));
export const milliToNumber = (q) => Number(milliToString(q));

/** ISO 4217 minor digits; only 0 and 2 fit numeric(12,2) storage. */
export function minorDigits(currency) {
  let digits;
  try {
    digits = new Intl.NumberFormat('en', { style: 'currency', currency }).resolvedOptions().maximumFractionDigits;
  } catch {
    throw new MoneyError(`Unknown currency code: ${currency}`);
  }
  if (digits !== 0 && digits !== 2) {
    throw new MoneyError(`Currency ${currency} has ${digits} minor digits; only 0 or 2 are supported`);
  }
  return digits;
}

/** A money calculator bound to the store currency. */
export function createMoney(currency) {
  const step = minorDigits(currency) === 0 ? 100n : 1n; // cents per smallest currency unit
  const round = (n, d) => divRound(n, d * step) * step;

  return {
    currency,
    /** Parse an input amount and require it to be expressible in the currency. */
    parse(v) {
      const c = toCents(v);
      if (c % step !== 0n) throw new MoneyError(`${currency} amounts cannot have decimals: ${v}`);
      return c;
    },
    /** unit price (cents) x quantity (thousandths), rounded once. */
    lineAmount: (unitCents, qtyMilli) => round(unitCents * qtyMilli, 1000n),
    /** amount x rate% where rate is numeric(5,2), e.g. "7.50" -> 750 basis points. */
    percentOf: (cents, rate) => round(cents * toCents(rate), 10000n),
    sum: (list) => list.reduce((a, b) => a + b, 0n),
  };
}
