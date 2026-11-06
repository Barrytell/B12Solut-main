// Exact money for the browser, mirroring server/src/lib/money.js: amounts are
// BigInt cents, quantities BigInt thousandths, rounding half away from zero.
// Browser figures are for display and previews; the server's values are authoritative.

const CURRENCY = import.meta.env?.VITE_CURRENCY || 'USD'; // env is undefined outside Vite (parity tests)

function parse(value, scale) {
  if (value === null || value === undefined || value === '') return 0n;
  let text = typeof value === 'number' ? String(value) : String(value).trim();
  // Floats from older records (e.g. 12.340000000001) are rounded to the scale once, here.
  if (/e/i.test(text) || (text.split('.')[1]?.length ?? 0) > scale) text = Number(text).toFixed(scale);
  const m = /^(-)?(\d+)(?:\.(\d+))?$/.exec(text);
  if (!m) return 0n;
  const units = BigInt(m[2] + (m[3] || '').padEnd(scale, '0').slice(0, scale));
  return m[1] ? -units : units;
}

export const toCents = (v) => parse(v, 2);
export const toMilli = (v) => parse(v, 3);

export function divRound(n, d) {
  const q = n / d;
  const r = n % d;
  if (2n * (r < 0n ? -r : r) >= (d < 0n ? -d : d)) return q + ((n < 0n) === (d < 0n) ? 1n : -1n);
  return q;
}

const step = (() => {
  try {
    return new Intl.NumberFormat('en', { style: 'currency', currency: CURRENCY }).resolvedOptions().maximumFractionDigits === 0 ? 100n : 1n;
  } catch { return 1n; }
})();
const round = (n, d) => divRound(n, d * step) * step;

/** cents -> JS number for display / existing UI code (exact 2-dp value). */
export const fromCents = (c) => {
  const neg = c < 0n;
  const s = (neg ? -c : c).toString().padStart(3, '0');
  return Number(`${neg ? '-' : ''}${s.slice(0, -2)}.${s.slice(-2)}`);
};

/** unit price x quantity, rounded once (same as the server). */
export const lineAmount = (unit, qty) => round(toCents(unit) * toMilli(qty), 1000n);
/** unit x qty x rate%, rounded once (same as the server). */
export const lineTax = (unit, qty, rate) => round(toCents(unit) * toMilli(qty) * toCents(rate), 1000n * 10000n);

const fromMilli = (q) => Number(q) / 1000; // quantities are display-only once summed exactly

/** a + b exactly -> number (use for running money totals). */
export const addMoney = (a, b) => fromCents(toCents(a) + toCents(b));
/** a + b quantities exactly (3 dp) -> number. */
export const addQty = (a, b) => fromMilli(toMilli(a) + toMilli(b));
/** amount / count, rounded once (averages) -> number. */
export const divMoney = (a, count) => (count ? fromCents(divRound(toCents(a), BigInt(count))) : 0);

/** Exact sum of money values -> number. */
export const sumMoney = (values) => fromCents(values.reduce((a, v) => a + toCents(v), 0n));
/** Exact sum of a money field over records -> number. */
export const sumBy = (records, pick) => sumMoney(records.map(pick));
/** a - b exactly -> number. */
export const subMoney = (a, b) => fromCents(toCents(a) - toCents(b));
/** unit x qty exactly (rounded once) -> number. */
export const mulMoney = (unit, qty) => fromCents(lineAmount(unit, qty));

/** Cart pricing identical to POST /api/sales, so the screen shows what the server will charge. */
export function priceCart(items, discount = 0) {
  let subtotal = 0n; let tax = 0n; let cost = 0n;
  const lines = items.map((it) => {
    const base = lineAmount(it.unit_price, it.quantity);
    const t = lineTax(it.unit_price, it.quantity, it.tax_rate || 0);
    subtotal += base; tax += t; cost += lineAmount(it.cost_price || 0, it.quantity);
    return { ...it, tax_amount: fromCents(t), line_total: fromCents(base + t) };
  });
  const grand = subtotal + tax - toCents(discount);
  return {
    lines,
    subtotal: fromCents(subtotal),
    taxTotal: fromCents(tax),
    grandTotal: fromCents(grand),
    totalCost: fromCents(cost),
  };
}

const formatter = (() => {
  try { return new Intl.NumberFormat('en-US', { style: 'currency', currency: CURRENCY }); } catch { return null; }
})();
/** Store-currency display, e.g. "$1,234.50". */
export const formatMoney = (v) => (formatter ? formatter.format(fromCents(toCents(v))) : String(v));
