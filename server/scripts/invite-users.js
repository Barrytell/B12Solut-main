// Invites imported users (app_users rows without a Supabase Auth account) and
// links auth_user_id. Passwords cannot be exported from Base44, so each person
// sets a new one from the email. SENDS REAL EMAILS: run only with explicit approval.
//
//   node scripts/invite-users.js --target=staging --expect-ref=<id> [--only=a@x.com,b@y.com] [--delay-ms=2000] [--commit]
//
// Dry-run (default) lists who would be invited. Users who already have an Auth
// account are skipped. Supabase/Resend rate limits apply: --delay-ms spaces the emails.
import { createClient } from '@supabase/supabase-js';
import { guardOrExit, parseFlags } from './lib/target-guard.js';
import { connect } from './lib/db.js';

const { target, commit } = await guardOrExit();
const flags = parseFlags(process.argv.slice(2));
const only = typeof flags.only === 'string' ? new Set(flags.only.split(',').map((e) => e.trim().toLowerCase())) : null;
const delay = Number(flags['delay-ms'] ?? 2000);
if (!process.env.APP_URL?.startsWith('https://')) { console.error('APP_URL must be the https frontend URL (invite links land there)'); process.exit(1); }

const db = await connect();
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });
const invited = []; const failed = [];
try {
  const { rows } = await db.query('SELECT id, email FROM public.app_users WHERE auth_user_id IS NULL ORDER BY email');
  const todo = rows.filter((u) => !only || only.has(u.email));
  console.log(`[invite] ${target} ${commit ? 'COMMIT (real emails)' : 'dry-run'}: ${todo.length} user(s) without a sign-in account`);
  for (const u of todo) {
    if (!commit) { console.log(`  - would invite ${u.email}`); continue; }
    const { data, error } = await supabase.auth.admin.inviteUserByEmail(u.email, { redirectTo: `${process.env.APP_URL}/reset-password?invite=1` });
    if (error) { failed.push(`${u.email}: ${error.message}`); continue; }
    await db.query('UPDATE public.app_users SET auth_user_id = $2 WHERE id = $1 AND auth_user_id IS NULL', [u.id, data.user.id]);
    invited.push(u.email);
    console.log(`  - invited ${u.email}`);
    await new Promise((r) => setTimeout(r, delay));
  }
} finally {
  await db.end();
}
if (commit) console.log(`[invite] ${invited.length} invited, ${failed.length} failed`);
for (const f of failed) console.log(`  - FAILED ${f}`);
if (failed.length) process.exitCode = 1;
