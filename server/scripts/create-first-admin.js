// One-time bootstrap: sign-ups are disabled and only admins can invite, so the
// very first admin is created here. Refuses if any admin already exists.
// Sends a real invitation email, so run it only with explicit approval.
//
//   node scripts/create-first-admin.js --target=staging --expect-ref=<project-id> \
//     --email=owner@example.com --name="Store Owner" [--commit]
//
// Reads SUPABASE_URL, SUPABASE_SECRET_KEY, DATABASE_URL, DATABASE_CA_CERT,
// SUPABASE_PROJECT_ID, APP_ENV, APP_URL from the environment (never from arguments).
import pg from 'pg';
import { createClient } from '@supabase/supabase-js';
import { guardOrExit, parseFlags } from './lib/target-guard.js';

const { target, commit } = await guardOrExit();
const flags = parseFlags(process.argv.slice(2));
const email = String(flags.email ?? '').trim().toLowerCase();
const name = String(flags.name ?? '').trim();
if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { console.error('--email=<address> is required'); process.exit(1); }
if (!process.env.APP_URL?.startsWith('https://')) { console.error('APP_URL must be the https frontend URL'); process.exit(1); }

const url = new URL(process.env.DATABASE_URL);
url.searchParams.delete('sslmode');
const db = new pg.Client({ connectionString: url.toString(), ssl: { ca: process.env.DATABASE_CA_CERT, rejectUnauthorized: true } });
await db.connect();
try {
  const admins = await db.query("SELECT count(*)::int AS n FROM public.app_users WHERE role = 'admin'");
  if (admins.rows[0].n > 0) {
    console.error(`Refused: ${target} already has ${admins.rows[0].n} admin(s). Invite further users from the Users page.`);
    process.exit(1);
  }
  if (!commit) {
    console.log(`[dry-run] would invite ${email} as the first admin of ${target}. Re-run with --commit to send the invitation.`);
    process.exit(0);
  }
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });
  const { data, error } = await supabase.auth.admin.inviteUserByEmail(email, { redirectTo: `${process.env.APP_URL}/reset-password?invite=1` });
  if (error) { console.error(`Invite failed: ${error.message}`); process.exit(1); }
  try {
    await db.query(
      `INSERT INTO public.app_users (email, full_name, display_name, role, auth_user_id) VALUES ($1, $2, $2, 'admin', $3)`,
      [email, name || null, data.user.id],
    );
  } catch (err) {
    await supabase.auth.admin.deleteUser(data.user.id).catch(() => {});
    throw err;
  }
  console.log(`Invitation sent to ${email}. They become the first admin of ${target} after setting a password.`);
} finally {
  await db.end();
}
