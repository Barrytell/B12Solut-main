// One password policy, the same as the Supabase project setting (README):
// 10-72 characters (72 = bcrypt's limit), at least one letter and one digit.
import { z } from 'zod';

export const PASSWORD_RULE = 'at least 10 characters, with letters and digits';

export const passwordField = () => z.string()
  .min(10, `Password must have ${PASSWORD_RULE}`)
  .max(72, 'Password must be at most 72 characters')
  .refine((p) => /[A-Za-z]/.test(p) && /\d/.test(p), `Password must have ${PASSWORD_RULE}`);

/** Recognises Supabase's own weak-password / policy errors. */
export const isWeakPasswordError = (error) =>
  error?.code === 'weak_password' || /password/i.test(error?.message ?? '') && /weak|short|character|length/i.test(error?.message ?? '');
