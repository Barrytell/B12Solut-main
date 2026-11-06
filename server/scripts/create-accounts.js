// Creates sign-in accounts for imported users (app_users rows without one).
// Passwords cannot be exported from Base44, so each account gets a random
// password that is never shown or logged, plus must_change_password, and the
// person receives a password-reset email to choose their own.
// CREATES REAL ACCOUNTS AND SENDS REAL EMAILS: run only with explicit approval.
//
//   node --env-file=.env.staging scripts/create-accounts.js --target=staging --expect-ref=<id> \
//     [--only=a@x.com,b@y.com] [--delay-ms=2000] [--commit]
//
// Dry-run (default) lists who would get an account. Alternative: the admin
// creates each account in Admin -> Users with an initial password.
import { randomBytes } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { guardOrExit, parseFlags } from './lib/target-guard.js';
import { connect } from './lib/db.js';

const { target, commit } = await guardOrExit();
const flags = parseFlags(process.argv.slice(2));
const only = typeof flags.only === 'string' ? new Set(flags.only.split(',').map((e) => e.trim().toLowerCase())) : null;
const delay = Number(flags['delay-ms'] ?? 2000);
if (!process.env.APP_URL?.startsWith('https://')) { console.error('APP_URL must be the https frontend URL (reset links land there)'); process.exit(1); }

// letters + digits so it always satisfies the password policy; nobody ever sees it
const unusablePassword = () => `Aa1${randomBytes(30).toString('base64url')}`.slice(0, 40);

const db = await connect();
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });
const created = []; const failed = [];
try {
  const { rows } = await db.query('SELECT id, email FROM public.app_users WHERE auth_user_id IS NULL ORDER BY email');
  const todo = rows.filter((u) => !only || only.has(u.email));
  console.log(`[accounts] ${target} ${commit ? 'COMMIT (real accounts + reset emails)' : 'dry-run'}: ${todo.length} user(s) without a sign-in account`);
  for (const u of todo) {
    if (!commit) { console.log(`  - would create an account for ${u.email} and send a password-reset email`); continue; }
    const { data, error } = await supabase.auth.admin.createUser({ email: u.email, password: unusablePassword(), email_confirm: true });
    if (error) { failed.push(`${u.email}: ${error.message}`); continue; }
    try {
      await db.query('UPDATE public.app_users SET auth_user_id = $2, must_change_password = true WHERE id = $1 AND auth_user_id IS NULL', [u.id, data.user.id]);
    } catch (err) {
      await supabase.auth.admin.deleteUser(data.user.id).catch(() => {});
      failed.push(`${u.email}: ${err.message}`);
      continue;
    }
    const { error: mailError } = await supabase.auth.resetPasswordForEmail(u.email, { redirectTo: `${process.env.APP_URL}/reset-password` });
    if (mailError) failed.push(`${u.email}: account created, reset email failed (${mailError.message}); use "Forgot password" or set a password in Admin -> Users`);
    created.push(u.email);
    console.log(`  - created ${u.email}`);
    await new Promise((r) => setTimeout(r, delay));
  }
} finally {
  await db.end();
}
if (commit) console.log(`[accounts] ${created.length} created, ${failed.length} problem(s)`);
for (const f of failed) console.log(`  - ${f}`);
if (failed.length) process.exitCode = 1;
