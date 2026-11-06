// Display formatting only (PDF and email). Amounts are exact decimal strings;
// Intl formats them for display, nothing here feeds back into arithmetic.
import { divRound, toCents } from './money.js';

export function createFormat({ currency, timeZone }) {
  const cur = new Intl.NumberFormat('en-US', { style: 'currency', currency });
  const opts = (o) => ({ timeZone, ...o });
  const date = new Intl.DateTimeFormat('en-US', opts({ month: 'long', day: 'numeric', year: 'numeric' }));
  const shortDate = new Intl.DateTimeFormat('en-US', opts({ month: 'short', day: 'numeric', year: 'numeric' }));
  const time = new Intl.DateTimeFormat('en-US', opts({ hour: 'numeric', minute: '2-digit', hour12: true }));
  return {
    money: (decimal) => cur.format(Number(decimal ?? 0)),
    date: (d) => date.format(new Date(d)),
    time: (d) => time.format(new Date(d)),
    dateTime: (d) => `${shortDate.format(new Date(d))} ${time.format(new Date(d))}`,
  };
}

/** part / whole as a percent string with 1 dp, computed exactly ("12.5%"). */
export function percent(part, whole) {
  const w = toCents(whole);
  if (w === 0n) return '0.0%';
  const tenths = divRound(toCents(part) * 1000n, w);
  const neg = tenths < 0n;
  const abs = neg ? -tenths : tenths;
  return `${neg ? '-' : ''}${abs / 10n}.${abs % 10n}%`;
}

/** Same but returns the numeric tenths for comparisons (margin colour bands). */
export function percentTenths(part, whole) {
  const w = toCents(whole);
  return w === 0n ? 0n : divRound(toCents(part) * 1000n, w);
}

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
/** HTML-escapes every interpolated value in email templates. */
export const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ESC[c]);
