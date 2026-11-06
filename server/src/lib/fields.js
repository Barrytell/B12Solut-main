// zod field builders shared by all routes. Money and quantities are validated
// and normalised to exact decimal strings, ready to be SQL parameters.
import { z } from 'zod';
import { centsToString, milliToString, toCents, toMilli, MoneyError } from './money.js';

const MAX_12_2 = 999999999999n; // numeric(12,2) in cents
const MAX_12_3 = 999999999999n; // numeric(12,3) in thousandths

function decimalField(parse, format, { min, max }) {
  return z.union([z.number(), z.string()]).transform((v, ctx) => {
    let units;
    try {
      units = parse(v);
    } catch (e) {
      ctx.addIssue({ code: 'custom', message: e instanceof MoneyError ? e.message : 'Invalid number' });
      return z.NEVER;
    }
    if (units < min) { ctx.addIssue({ code: 'custom', message: 'Value is too small' }); return z.NEVER; }
    if (units > max) { ctx.addIssue({ code: 'custom', message: 'Value is too large' }); return z.NEVER; }
    return format(units);
  });
}

/** Non-negative store-currency amount -> "12.34". */
export const moneyField = (money) => decimalField((v) => money.parse(v), centsToString, { min: 0n, max: MAX_12_2 });
/** Non-negative quantity -> "1.500". */
export const qtyField = () => decimalField(toMilli, milliToString, { min: 0n, max: MAX_12_3 });
/** Strictly positive quantity -> "2.000". */
export const positiveQty = () => decimalField(toMilli, milliToString, { min: 1n, max: MAX_12_3 });
/** Tax rate percent, 0..100 with 2 dp -> "7.50". */
export const percentField = () => decimalField(toCents, centsToString, { min: 0n, max: 10000n });

/** Optional trimmed text; '' becomes null, absent stays absent. */
export const optText = (max) => z.union([z.string().trim().max(max), z.null()]).optional()
  .transform((v) => (v === '' ? null : v));
export const reqText = (max) => z.string().trim().min(1, 'Required').max(max);

/** Optional id reference; '' becomes null. */
export const ref = () => z.union([z.string().trim().max(100), z.null()]).optional()
  .transform((v) => (v === '' ? null : v));

/** http(s) URL or null ('' becomes null). */
export const urlField = () => z.union([z.string().trim().max(2000), z.null()]).optional()
  .transform((v) => (v === '' ? null : v))
  .refine((v) => v == null || /^https?:\/\/[^\s]+$/i.test(v), 'Must be an http(s) URL');

export const emailField = () => z.string().trim().toLowerCase().max(254).email();
export const optEmail = () => z.union([z.literal(''), z.null(), emailField()]).optional()
  .transform((v) => (v === '' ? null : v));
