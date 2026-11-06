// Round 5 authentication rules through the real Express stack, with stubbed
// database and Supabase (no network): admin-only account creation, validation,
// duplicate and failure handling, the temporary-password gate, password change,
// and role protection. Real Supabase behaviour is covered on staging (02-auth).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import pino from 'pino';
import { createApp } from '../../src/app.js';
import { makeRequireAuth } from '../../src/auth.js';
import { parseOrigins } from '../../src/config.js';
import { createMoney } from '../../src/lib/money.js';
import { createEntities } from '../../src/entities.js';
import { isFreshRecoverySession } from '../../src/routes/authRoutes.js';

const money = createMoney('USD');
const GOOD_PASSWORD = 'Temporary-2026';

function build({ users, failInsert = false, authError = null, recoveryAmr = false, admins = null } = {}) {
  const USERS = users ?? {
    admin: { id: 'u-admin', email: 'admin@x.test', full_name: 'Ann', display_name: 'Ann', role: 'admin', must_change_password: false },
    admin2: { id: 'u-admin2', email: 'admin2@x.test', full_name: 'Bo', display_name: 'Bo', role: 'admin', must_change_password: false },
    cashier: { id: 'u-cash', email: 'cash@x.test', full_name: 'Cal', display_name: 'Cal', role: 'user', must_change_password: false },
    fresh: { id: 'u-new', email: 'new@x.test', full_name: 'Nia', display_name: 'Nia', role: 'user', must_change_password: true },
  };
  const calls = { createUser: [], deleteUser: [], update: [], signOutOthers: 0, queries: [] };
  const db = {
    async query(sql, params = []) {
      calls.queries.push({ sql, params });
      if (sql.includes('FROM app_users WHERE auth_user_id')) return { rows: USERS[params[0]] ? [USERS[params[0]]] : [], fields: [] };
      if (sql.includes('lower(email) = $1')) return { rowCount: params[0] === 'taken@x.test' ? 1 : 0, rows: [] };
      if (sql.startsWith('INSERT INTO public.app_users')) {
        if (failInsert) throw Object.assign(new Error('insert failed'), { code: 'XX000' });
        return { rows: [{ id: 'u-created', email: params[0], full_name: params[1], role: params[2], auth_user_id: params[3], must_change_password: true }], fields: [] };
      }
      if (sql.includes("WHERE role = 'admin'") && sql.includes('FOR UPDATE')) return { rows: admins ?? [{ id: 'u-admin' }, { id: 'u-admin2' }] };
      if (sql.startsWith('UPDATE public.app_users SET role') || sql.startsWith('UPDATE public.app_users SET')) return { rows: [{ id: params[0] }], fields: [] };
      if (sql.startsWith('SELECT * FROM public.app_users')) return { rows: [{ id: params[0], role: 'user' }], fields: [] };
      return { rows: [], fields: [], rowCount: 0 };
    },
    async connect() { return { query: (s, p) => db.query(s, p), release() {} }; },
  };
  const authAdmin = {
    async createUser(attrs) { calls.createUser.push(attrs); return authError ? { data: null, error: authError } : { data: { user: { id: 'auth-new' } }, error: null }; },
    async deleteUser(id) { calls.deleteUser.push(id); return { error: null }; },
  };
  const passwords = {
    verify: async (_email, pw) => pw === 'Current-pass-1',
    update: async (id, pw) => { calls.update.push({ id, length: pw.length }); return { error: null }; },
    signOutOthers: async () => { calls.signOutOthers++; },
  };
  const verifyToken = async (t) => (USERS[t] ? { sub: t, amr: recoveryAmr ? [{ method: 'otp', timestamp: Math.floor(Date.now() / 1000) - 60 }] : [{ method: 'password', timestamp: 1 }] } : null);
  const app = createApp({
    config: { appEnv: 'staging', currency: 'USD', appUrl: 'https://app.example', isAllowedOrigin: parseOrigins('https://app.example', { allowWildcard: false }).isAllowed, storage: {} },
    logger: pino({ level: 'silent' }),
    db,
    requireAuth: makeRequireAuth({ verifyToken, db }),
    services: { money, entities: createEntities(money), storage: {}, sendMail: async () => {}, fmt: null, authAdmin, passwords, advisor: { status: async () => ({}), chat: async () => ({}) }, notifyLowStock: async () => {} },
  });
  return { app, calls };
}
const as = (who) => ({ Authorization: `Bearer ${who}` });
const newUser = (over = {}) => ({ full_name: 'Dee Cashier', email: 'Dee@X.test', password: GOOD_PASSWORD, role: 'user', ...over });

test('T12/T13: an admin creates Admin and Cashier accounts with a temporary password', async () => {
  for (const role of ['admin', 'user']) {
    const { app, calls } = build();
    const res = await request(app).post('/api/users').set(as('admin')).send(newUser({ role }));
    assert.equal(res.status, 201, JSON.stringify(res.body));
    assert.deepEqual(calls.createUser, [{ email: 'dee@x.test', password: GOOD_PASSWORD, email_confirm: true }]);
    const insert = calls.queries.find((q) => q.sql.startsWith('INSERT INTO public.app_users'));
    assert.match(insert.sql, /must_change_password/);
    assert.deepEqual(insert.params.slice(0, 4), ['dee@x.test', 'Dee Cashier', role, 'auth-new']);
    assert.ok(!insert.params.includes(GOOD_PASSWORD), 'password stored in app_users');
    assert.ok(!JSON.stringify(res.body).includes(GOOD_PASSWORD), 'password returned');
    assert.ok(!('auth_user_id' in res.body));
  }
});

test('T29: no token, cashiers and unregistered accounts cannot create accounts', async () => {
  const { app, calls } = build();
  assert.equal((await request(app).post('/api/users').send(newUser())).status, 401);
  assert.equal((await request(app).post('/api/users').set(as('cashier')).send(newUser({ role: 'admin' }))).status, 403);
  assert.equal((await request(app).post('/api/users').set(as('stranger')).send(newUser())).status, 401);
  assert.equal(calls.createUser.length, 0);
});

test('validation happens before Supabase is called', async () => {
  const { app, calls } = build();
  for (const bad of [
    newUser({ full_name: '' }), newUser({ email: 'not-an-email' }), newUser({ role: 'owner' }),
    newUser({ password: 'short1' }), newUser({ password: 'lettersonlyhere' }), newUser({ password: '1234567890123' }),
    newUser({ password: `A1${'x'.repeat(80)}` }), { ...newUser(), is_admin: true },
  ]) {
    assert.equal((await request(app).post('/api/users').set(as('admin')).send(bad)).status, 400, JSON.stringify(bad));
  }
  assert.equal(calls.createUser.length, 0);
});

test('T30: duplicate email (app or Supabase) -> 409, nothing created', async () => {
  const dup = build();
  const res = await request(dup.app).post('/api/users').set(as('admin')).send(newUser({ email: 'TAKEN@x.test' }));
  assert.equal(res.status, 409);
  assert.equal(dup.calls.createUser.length, 0);
  const authDup = build({ authError: { code: 'email_exists', status: 422, message: 'A user with this email address has already been registered' } });
  assert.equal((await request(authDup.app).post('/api/users').set(as('admin')).send(newUser())).status, 409);
});

test('T31: if saving the app user fails, the new Auth account is deleted', async () => {
  const { app, calls } = build({ failInsert: true });
  const res = await request(app).post('/api/users').set(as('admin')).send(newUser());
  assert.equal(res.status, 500);
  assert.equal(res.body.error.code, 'INTERNAL');
  assert.deepEqual(calls.deleteUser, ['auth-new']);
});

test('T33: a temporary password blocks everything except /me and the password change', async () => {
  const { app, calls } = build();
  const me = await request(app).get('/api/auth/me').set(as('fresh'));
  assert.equal(me.status, 200);
  assert.equal(me.body.user.must_change_password, true);
  for (const [m, p] of [['get', '/api/entities/Product'], ['post', '/api/sales'], ['post', '/api/shifts/start'], ['get', '/api/entities/Shift']]) {
    const res = await request(app)[m](p).set(as('fresh')).send({});
    assert.equal(res.status, 403, `${m} ${p}`);
    assert.equal(res.body.error.code, 'PASSWORD_CHANGE_REQUIRED');
  }
  assert.equal((await request(app).post('/api/auth/change-password').set(as('fresh')).send({ new_password: 'New-password-9' })).status, 400); // current required
  assert.equal((await request(app).post('/api/auth/change-password').set(as('fresh')).send({ current_password: 'wrong', new_password: 'New-password-9' })).status, 401);
  assert.equal((await request(app).post('/api/auth/change-password').set(as('fresh')).send({ current_password: 'Current-pass-1', new_password: 'Current-pass-1' })).status, 400);
  assert.equal((await request(app).post('/api/auth/change-password').set(as('fresh')).send({ current_password: 'Current-pass-1', new_password: 'weak' })).status, 400);
  const ok = await request(app).post('/api/auth/change-password').set(as('fresh')).send({ current_password: 'Current-pass-1', new_password: 'New-password-9' });
  assert.equal(ok.status, 204);
  assert.deepEqual(calls.update, [{ id: 'fresh', length: 14 }]);
  assert.ok(calls.queries.some((q) => q.sql.includes('SET must_change_password = false') && q.params[0] === 'u-new'));
  assert.equal(calls.signOutOthers, 1);
});

test('T34/T14: change later with the current password; after an email reset link the current one is not needed', async () => {
  const later = build();
  assert.equal((await request(later.app).post('/api/auth/change-password').set(as('cashier')).send({ current_password: 'Current-pass-1', new_password: 'Another-pass-7' })).status, 204);
  const recovery = build({ recoveryAmr: true });
  assert.equal((await request(recovery.app).post('/api/auth/change-password').set(as('fresh')).send({ new_password: 'Recovered-pass-3' })).status, 204);
  assert.equal(isFreshRecoverySession({ amr: [{ method: 'otp', timestamp: Date.now() / 1000 - 3600 }] }), false, 'an old link session must not skip the current password');
  assert.equal(isFreshRecoverySession({ amr: [{ method: 'password', timestamp: Date.now() / 1000 }] }), false);
});

test('T35: nobody changes their own role; the last admin cannot be demoted', async () => {
  const two = build();
  assert.equal((await request(two.app).patch('/api/entities/User/u-admin').set(as('admin')).send({ role: 'user' })).status, 409);
  assert.equal((await request(two.app).patch('/api/entities/User/u-cash').set(as('cashier')).send({ role: 'admin' })).status, 403);
  assert.equal((await request(two.app).patch('/api/entities/User/u-admin2').set(as('admin')).send({ role: 'user' })).status, 200);
  const last = build({ admins: [{ id: 'u-admin2' }] });
  const res = await request(last.app).patch('/api/entities/User/u-admin2').set(as('admin')).send({ role: 'user' });
  assert.equal(res.status, 409);
  assert.equal(res.body.error.code, 'LAST_ADMIN');
  assert.equal((await request(two.app).delete('/api/entities/User/u-cash').set(as('admin'))).status, 405);
});

test('T32 (API part): account creation and password change are rate-limited', async () => {
  const { app } = build();
  let last;
  for (let i = 0; i < 6; i++) last = await request(app).post('/api/auth/change-password').set(as('cashier')).send({ current_password: 'wrong', new_password: 'Another-pass-7' });
  assert.equal(last.status, 429);
});
