// T2 authorization against real Supabase tokens, T11(b) uninvited account,
// T12 invitation, T14 password reset, T15 demotion (staging; no email is sent).
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanup, createProduct, createUser, setup, signIn } from './helpers.js';

let ctx; let admin; let cashier;

before(async () => {
  ctx = await setup('auth');
  admin = await createUser(ctx, 'admin');
  cashier = await createUser(ctx, 'user');
});
after(() => cleanup(ctx));

test('T2: real tokens, roles from app_users', async () => {
  assert.equal((await ctx.api('get', '/api/auth/me')).status, 401);
  assert.equal((await ctx.api('get', '/api/auth/me', 'not.a.jwt')).status, 401);
  const me = await ctx.api('get', '/api/auth/me', cashier.token);
  assert.equal(me.status, 200);
  assert.equal(me.body.user.role, 'user');
  assert.equal(me.body.user.email, cashier.email);
  assert.equal((await ctx.api('get', '/api/auth/me', admin.token)).body.user.role, 'admin');

  const p = await createProduct(ctx, { name: 'authz' });
  assert.equal((await ctx.api('patch', `/api/entities/Product/${p.id}`, cashier.token).send({ selling_price: 0.01 })).status, 403);
  assert.equal((await ctx.api('patch', `/api/entities/User/${cashier.id}`, cashier.token).send({ role: 'admin' })).status, 403);
  assert.equal((await ctx.api('get', '/api/entities/Supplier', cashier.token)).status, 403);
  assert.equal((await ctx.api('post', '/api/returns', cashier.token).send({})).status, 403);
  const users = await ctx.api('get', '/api/entities/User', cashier.token);
  assert.equal(users.status, 200);
  assert.deepEqual(users.body.map((u) => u.email), [cashier.email]); // own row only
  assert.ok(users.body.every((u) => !('auth_user_id' in u)));
});

test('T11(b): a signed-in account with no invitation has no app access', async () => {
  const stranger = await createUser(ctx, 'user', { invited: false });
  const res = await ctx.api('get', '/api/auth/me', stranger.token);
  assert.equal(res.status, 403);
  assert.equal(res.body.error.code, 'USER_NOT_REGISTERED');
  assert.equal((await ctx.api('get', '/api/entities/Product', stranger.token)).status, 403);
  assert.equal((await ctx.api('post', '/api/shifts/start', stranger.token).send({})).status, 403);
});

test('T12: invite -> set own password -> sign in with the invited role; the link works once', async () => {
  const email = `${ctx.P}invitee@example.com`;
  const res = await ctx.api('post', '/api/users/invite', admin.token).send({ email, display_name: 'Invitee', role: 'user' });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  const authId = (await ctx.db.query('SELECT auth_user_id FROM public.app_users WHERE email = $1', [email])).rows[0].auth_user_id;
  ctx.authUserIds.push(authId);
  assert.equal((await ctx.api('post', '/api/users/invite', admin.token).send({ email, role: 'user' })).status, 409);
  assert.equal((await ctx.api('post', '/api/users/invite', cashier.token).send({ email: `${ctx.P}x@example.com` })).status, 403);

  const tokenHash = ctx.inviteTokens.get(email);
  assert.ok(tokenHash, 'no invite link generated');
  const client = ctx.anon();
  const verified = await client.auth.verifyOtp({ type: 'invite', token_hash: tokenHash });
  assert.ifError(verified.error);
  const password = `Invitee-${Date.now()}!`;
  assert.ifError((await client.auth.updateUser({ password })).error);

  const token = await signIn(ctx, email, password);
  const me = await ctx.api('get', '/api/auth/me', token);
  assert.equal(me.status, 200);
  assert.equal(me.body.user.role, 'user');

  const reuse = await ctx.anon().auth.verifyOtp({ type: 'invite', token_hash: tokenHash });
  assert.ok(reuse.error, 'invitation link worked twice');
  const resend = await ctx.api('post', `/api/users/${res.body.id}/resend-invite`, admin.token).send({});
  assert.equal(resend.status, 409, 'accepted invitation can be resent');
});

test('T14: password reset link sets a new password once; the old one stops working', async () => {
  const user = await createUser(ctx, 'user');
  const { data, error } = await ctx.supabase.auth.admin.generateLink({ type: 'recovery', email: user.email });
  assert.ifError(error);
  const client = ctx.anon();
  assert.ifError((await client.auth.verifyOtp({ type: 'recovery', token_hash: data.properties.hashed_token })).error);
  const newPassword = `Reset-${Date.now()}!`;
  assert.ifError((await client.auth.updateUser({ password: newPassword })).error);

  assert.ok(await signIn(ctx, user.email, newPassword));
  const old = await ctx.anon().auth.signInWithPassword({ email: user.email, password: user.password });
  assert.ok(old.error, 'old password still works');
  const reuse = await ctx.anon().auth.verifyOtp({ type: 'recovery', token_hash: data.properties.hashed_token });
  assert.ok(reuse.error, 'reset link worked twice');
});

test('T15: demoting an admin takes effect on the next request', async () => {
  const admin2 = await createUser(ctx, 'admin');
  assert.equal((await ctx.api('get', '/api/entities/Supplier', admin2.token)).status, 200);
  const demote = await ctx.api('patch', `/api/entities/User/${admin2.id}`, admin.token).send({ role: 'user' });
  assert.equal(demote.status, 200);
  assert.equal((await ctx.api('get', '/api/entities/Supplier', admin2.token)).status, 403);
  const self = await ctx.api('patch', `/api/entities/User/${admin.id}`, admin.token).send({ role: 'user' });
  assert.equal(self.status, 409);
});
