// Email-and-password authentication against real Supabase Auth (staging).
// T2, T11-T15, T27-T36. No email is sent: accounts come from the Auth Admin
// API and the reset link from generateLink.
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { cleanup, createProduct, createUser, setup, signIn } from './helpers.js';

const FIXTURES = join(import.meta.dirname, '../../supabase/test-fixtures');
let ctx; let admin; let cashier;
const TEMP = 'Temporary-2026x';

before(async () => {
  ctx = await setup('auth');
  admin = await createUser(ctx, 'admin');
  cashier = await createUser(ctx, 'user');
});
after(() => cleanup(ctx));

const createViaApi = (token, over = {}) => ctx.api('post', '/api/users', token)
  .send({ full_name: 'New Person', email: `${ctx.P}new${Date.now()}@example.com`, password: TEMP, role: 'user', ...over });
const appUser = async (email) => (await ctx.db.query('SELECT * FROM public.app_users WHERE email = $1', [email.toLowerCase()])).rows[0];

test('T2: real tokens, roles from app_users', async () => {
  assert.equal((await ctx.api('get', '/api/auth/me')).status, 401);
  assert.equal((await ctx.api('get', '/api/auth/me', 'not.a.jwt')).status, 401);
  const me = await ctx.api('get', '/api/auth/me', cashier.token);
  assert.equal(me.status, 200);
  assert.equal(me.body.user.role, 'user');
  assert.equal(me.body.user.must_change_password, false);
  const p = await createProduct(ctx, { name: 'authz' });
  assert.equal((await ctx.api('patch', `/api/entities/Product/${p.id}`, cashier.token).send({ selling_price: 0.01 })).status, 403);
  assert.equal((await ctx.api('get', '/api/entities/Supplier', cashier.token)).status, 403);
  const users = await ctx.api('get', '/api/entities/User', cashier.token);
  assert.deepEqual(users.body.map((u) => u.email), [cashier.email]);
  assert.ok(users.body.every((u) => !('auth_user_id' in u)));
});

test('T11: a sign-in account no admin created has no app access', async () => {
  const stranger = await createUser(ctx, 'user', { invited: false });
  const res = await ctx.api('get', '/api/auth/me', stranger.token);
  assert.equal(res.status, 403);
  assert.equal(res.body.error.code, 'USER_NOT_REGISTERED');
  assert.equal((await ctx.api('post', '/api/shifts/start', stranger.token).send({})).status, 403);
});

test('T27/T28: email-and-password login; wrong password and unknown email get the same refusal', async () => {
  assert.ok(await signIn(ctx, cashier.email, cashier.password));
  const wrong = await ctx.anon().auth.signInWithPassword({ email: cashier.email, password: 'Wrong-password-1' });
  const unknown = await ctx.anon().auth.signInWithPassword({ email: `${ctx.P}nobody@example.com`, password: 'Wrong-password-1' });
  assert.ok(wrong.error && !wrong.data.session);
  assert.ok(unknown.error && !unknown.data.session);
  assert.equal(wrong.error.message, unknown.error.message, 'messages differ: account enumeration');
});

for (const [label, role] of [['T12: Admin', 'admin'], ['T13: Cashier', 'user']]) {
  test(`${label} account created by an admin -> forced password change -> role permissions`, async () => {
    const email = `${ctx.P}${role}made@example.com`;
    const res = await createViaApi(admin.token, { email, role, full_name: `Made ${role}` });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    assert.ok(!JSON.stringify(res.body).includes(TEMP), 'password returned');
    const row = await appUser(email);
    assert.deepEqual([row.full_name, row.role, row.must_change_password], [`Made ${role}`, role, true]);
    assert.ok(row.auth_user_id);
    const { data } = await ctx.supabase.auth.admin.getUserById(row.auth_user_id);
    assert.ok(data.user.email_confirmed_at, 'admin-created account is not confirmed');
    const columns = Object.values(row).map(String).join(' ');
    assert.ok(!columns.includes(TEMP), 'password stored in app_users');

    // first login: only /me and the password change answer
    const token = await signIn(ctx, email, TEMP);
    assert.equal((await ctx.api('get', '/api/auth/me', token)).body.user.must_change_password, true);
    const blocked = await ctx.api('get', '/api/entities/Product', token);
    assert.equal(blocked.status, 403);
    assert.equal(blocked.body.error.code, 'PASSWORD_CHANGE_REQUIRED');
    assert.equal((await ctx.api('post', '/api/auth/change-password', token).send({ current_password: 'Wrong-pass-1', new_password: 'Chosen-pass-123' })).status, 401);
    assert.equal((await ctx.api('post', '/api/auth/change-password', token).send({ current_password: TEMP, new_password: 'weak' })).status, 400);
    assert.equal((await ctx.api('post', '/api/auth/change-password', token).send({ current_password: TEMP, new_password: TEMP })).status, 400);
    assert.equal((await ctx.api('post', '/api/auth/change-password', token).send({ current_password: TEMP, new_password: 'Chosen-pass-123' })).status, 204);
    assert.equal((await appUser(email)).must_change_password, false);
    assert.ok((await ctx.anon().auth.signInWithPassword({ email, password: TEMP })).error, 'temporary password still works');

    const fresh = await signIn(ctx, email, 'Chosen-pass-123');
    assert.equal((await ctx.api('get', '/api/entities/Product', fresh)).status, 200);
    assert.equal((await ctx.api('get', '/api/entities/Supplier', fresh)).status, role === 'admin' ? 200 : 403);
    assert.equal((await ctx.api('post', '/api/users', fresh).send({ full_name: 'x', email: `${ctx.P}x${role}@example.com`, password: TEMP, role: 'admin' })).status, role === 'admin' ? 201 : 403);
  });
}

test('T29: unauthorized account creation is refused and creates nothing', async () => {
  const email = `${ctx.P}forbidden@example.com`;
  const stranger = await createUser(ctx, 'user', { invited: false });
  assert.equal((await ctx.api('post', '/api/users').send({ full_name: 'x', email, password: TEMP, role: 'admin' })).status, 401);
  assert.equal((await createViaApi(cashier.token, { email, role: 'admin' })).status, 403);
  assert.equal((await createViaApi(stranger.token, { email })).status, 403);
  assert.equal(await appUser(email), undefined);
  const { data } = await ctx.supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
  assert.ok(!data.users.some((u) => u.email === email), 'an Auth user was created');
});

test('T30: duplicate email (any letter case) -> 409', async () => {
  const email = `${ctx.P}dup@example.com`;
  assert.equal((await createViaApi(admin.token, { email })).status, 201);
  const again = await createViaApi(admin.token, { email: email.toUpperCase() });
  assert.equal(again.status, 409);
  assert.equal(again.body.error.code, 'USER_EXISTS');
  assert.equal((await createViaApi(admin.token, { email: cashier.email })).status, 409);
});

test('T31: if saving the app user fails, the Auth account is removed (no orphan)', async () => {
  await ctx.db.query(readFileSync(join(FIXTURES, 'force-rollback.sql'), 'utf8'));
  try {
    const email = `${ctx.P}__force_rollback__@example.com`;
    ctx.deletedAuthUsers.length = 0;
    const res = await createViaApi(admin.token, { email });
    assert.equal(res.status, 500);
    assert.equal(res.body.error.code, 'INTERNAL');
    assert.equal(ctx.deletedAuthUsers.length, 1);
    const { data } = await ctx.supabase.auth.admin.getUserById(ctx.deletedAuthUsers[0]);
    assert.ok(!data?.user, 'orphaned Auth user remained');
    assert.equal(await appUser(email), undefined);
  } finally {
    await ctx.db.query(readFileSync(join(FIXTURES, 'remove-force-rollback.sql'), 'utf8'));
  }
  for (const bad of [{ full_name: '' }, { email: 'nope' }, { password: 'short1' }, { role: 'owner' }]) {
    assert.equal((await createViaApi(admin.token, bad)).status, 400, JSON.stringify(bad));
  }
});

test('T33/T34: password change signs other sessions out', async () => {
  const user = await createUser(ctx, 'user');
  const other = ctx.anon();
  assert.ifError((await other.auth.signInWithPassword({ email: user.email, password: user.password })).error);
  const res = await ctx.api('post', '/api/auth/change-password', user.token).send({ current_password: user.password, new_password: 'Later-change-42' });
  assert.equal(res.status, 204);
  const refreshed = await other.auth.refreshSession();
  assert.ok(refreshed.error, 'the other session can still refresh');
  assert.ok(await signIn(ctx, user.email, 'Later-change-42'));
});

test('T14: email reset link -> new password without the old one; flag cleared; link works once', async () => {
  const row = await createViaApi(admin.token, { email: `${ctx.P}reset@example.com` });
  assert.equal(row.status, 201);
  const email = `${ctx.P}reset@example.com`;
  const { data, error } = await ctx.supabase.auth.admin.generateLink({ type: 'recovery', email });
  assert.ifError(error);
  const client = ctx.anon();
  const verified = await client.auth.verifyOtp({ type: 'recovery', token_hash: data.properties.hashed_token });
  assert.ifError(verified.error);
  const token = verified.data.session.access_token;
  const res = await ctx.api('post', '/api/auth/change-password', token).send({ new_password: 'Reset-chosen-77' });
  assert.equal(res.status, 204, `recovery session not recognised (amr: ${JSON.stringify(verified.data.session.user?.amr ?? '')}) ${JSON.stringify(res.body)}`);
  assert.equal((await appUser(email)).must_change_password, false);
  assert.ok(await signIn(ctx, email, 'Reset-chosen-77'));
  assert.ok((await ctx.anon().auth.signInWithPassword({ email, password: TEMP })).error, 'old password still works');
  assert.ok((await ctx.anon().auth.verifyOtp({ type: 'recovery', token_hash: data.properties.hashed_token })).error, 'reset link worked twice');
});

test('T15/T35: role rules — demotion takes effect, no self role change, last admin protected', async () => {
  const admin2 = await createUser(ctx, 'admin');
  assert.equal((await ctx.api('get', '/api/entities/Supplier', admin2.token)).status, 200);
  assert.equal((await ctx.api('patch', `/api/entities/User/${admin2.id}`, admin.token).send({ role: 'user' })).status, 200);
  assert.equal((await ctx.api('get', '/api/entities/Supplier', admin2.token)).status, 403);
  assert.equal((await ctx.api('patch', `/api/entities/User/${admin.id}`, admin.token).send({ role: 'user' })).status, 409);
  assert.equal((await ctx.api('patch', `/api/entities/User/${cashier.id}`, cashier.token).send({ role: 'admin' })).status, 403);
  const admins = (await ctx.db.query("SELECT count(*)::int AS n FROM public.app_users WHERE role = 'admin'")).rows[0].n;
  if (admins === 1) {
    const res = await ctx.api('patch', `/api/entities/User/${admin.id}`, admin.token).send({ role: 'user' });
    assert.equal(res.status, 409);
  } // with other (real) admins on staging the last-admin case is covered by the unit test
});

test('T32: password-change attempts are rate-limited', async () => {
  const user = await createUser(ctx, 'user');
  let last;
  for (let i = 0; i < 6; i++) last = await ctx.api('post', '/api/auth/change-password', user.token).send({ current_password: 'Wrong-pass-9', new_password: 'Whatever-pass-9' });
  assert.equal(last.status, 429);
});

test('T36: Supabase offers email sign-in only; sign-ups disabled', async () => {
  const res = await fetch(`${ctx.config.supabase.url}/auth/v1/settings`, { headers: { apikey: process.env.SUPABASE_PUBLISHABLE_KEY } });
  assert.equal(res.status, 200);
  const settings = await res.json();
  assert.equal(settings.disable_signup, true, 'sign-ups are enabled');
  assert.equal(settings.external.email, true, 'email provider is off');
  const enabled = Object.entries(settings.external).filter(([k, v]) => v === true && k !== 'email');
  assert.deepEqual(enabled, [], `other providers enabled: ${enabled.map(([k]) => k).join(', ')}`);
});
