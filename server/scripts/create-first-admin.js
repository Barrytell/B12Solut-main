// One-time bootstrap: sign-ups are disabled and only admins create accounts,
// so the very first admin is created here. Refuses if any admin already exists.
// Creates a real account, so run it only with explicit approval.
//
//   node --env-file=.env.staging scripts/create-first-admin.js --target=staging --expect-ref=<project-id> \
//     --email=owner@example.com --name="Store Owner" [--commit]
//
// The initial password is typed at a hidden prompt (twice), never passed as an
// argument (it would end up in shell history). It is temporary: the first login
// forces a change. Credentials come from the environment, never from arguments.
import { createClient } from '@supabase/supabase-js';
import { guardOrExit, parseFlags } from './lib/target-guard.js';
import { connect } from './lib/db.js';
import { passwordField, PASSWORD_RULE } from '../src/lib/password.js';

/** Reads a line from the terminal without echoing it. */
function askHidden(question) {
  if (!process.stdin.isTTY) throw new Error('an interactive terminal is required to type the password');
  process.stdout.write(question);
  return new Promise((resolve) => {
    let value = '';
    const onData = (buf) => {
      for (const ch of buf.toString('utf8')) {
        if (ch === '\r' || ch === '\n') {
          process.stdin.setRawMode(false);
          process.stdin.pause();
          process.stdin.off('data', onData);
          process.stdout.write('\n');
          resolve(value);
          return;
        }
        if (ch === '\u0003') process.exit(130); // Ctrl+C
        if (ch === '\u007f' || ch === '\b') value = value.slice(0, -1);
        else value += ch;
      }
    };
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.on('data', onData);
  });
}

const { target, commit } = await guardOrExit();
const flags = parseFlags(process.argv.slice(2));
const email = String(flags.email ?? '').trim().toLowerCase();
const name = String(flags.name ?? '').trim();
if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { console.error('--email=<address> is required'); process.exit(1); }
if (!name) { console.error('--name="<full name>" is required'); process.exit(1); }

const db = await connect();
try {
  const admins = await db.query("SELECT count(*)::int AS n FROM public.app_users WHERE role = 'admin'");
  if (admins.rows[0].n > 0) {
    console.error(`Refused: ${target} already has ${admins.rows[0].n} admin(s). Create further accounts in Admin -> Users.`);
    process.exit(1);
  }
  if (!commit) {
    console.log(`[dry-run] would create ${email} (${name}) as the first admin of ${target}. Re-run with --commit.`);
    process.exit(0);
  }

  const password = await askHidden(`Initial password for ${email} (${PASSWORD_RULE}): `);
  if (!passwordField().safeParse(password).success) { console.error(`Refused: the password needs ${PASSWORD_RULE}.`); process.exit(1); }
  if ((await askHidden('Type it again: ')) !== password) { console.error('Refused: the passwords do not match.'); process.exit(1); }

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });
  const { data, error } = await supabase.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) { console.error(`Account creation failed: ${error.message}`); process.exit(1); }
  try {
    await db.query(
      `INSERT INTO public.app_users (email, full_name, display_name, role, auth_user_id, must_change_password)
       VALUES ($1, $2, $2, 'admin', $3, true)`,
      [email, name, data.user.id],
    );
  } catch (err) {
    await supabase.auth.admin.deleteUser(data.user.id).catch(() => {}); // leave no half-created account
    throw err;
  }
  console.log(`Created ${email} as the first admin of ${target}. The password is temporary: it must be changed at first login.`);
} finally {
  await db.end();
}
