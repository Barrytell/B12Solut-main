import { test } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import pino from 'pino';
import { createApp } from '../../src/app.js';
import { makeRequireAuth, requireAdmin } from '../../src/auth.js';
import { parseOrigins } from '../../src/config.js';

const USERS = {
  'admin-sub': { id: 'u1', email: 'a@x.test', full_name: 'Ann', display_name: 'Ann', role: 'admin' },
  'cashier-sub': { id: 'u2', email: 'c@x.test', full_name: 'Cal', display_name: 'Cal', role: 'user' },
};
const TOKENS = { 'tok-admin': 'admin-sub', 'tok-cashier': 'cashier-sub', 'tok-uninvited': 'stranger-sub' };

function build({ dbUp = true } = {}) {
  const db = {
    async query(sql, params) {
      if (!dbUp) throw new Error('connect ECONNREFUSED 10.0.0.1:5432 password=hunter2');
      if (sql === 'SELECT 1') return { rows: [{}] };
      const user = USERS[params?.[0]];
      return { rows: user ? [user] : [] };
    },
  };
  const verifyToken = async (t) => (TOKENS[t] ? { sub: TOKENS[t] } : null);
  const config = {
    appEnv: 'staging',
    currency: 'USD',
    isAllowedOrigin: parseOrigins('https://b12-staging.vercel.app,https://b12-*-team.vercel.app', { allowWildcard: true }).isAllowed,
  };
  const app = createApp({ config, logger: pino({ level: 'silent' }), db, requireAuth: makeRequireAuth({ verifyToken, db }) });
  // Test-only admin route to exercise requireAdmin through the real stack.
  return app;
}

test('health: 200 when the database answers, 503 without leaking details', async () => {
  const ok = await request(build()).get('/health');
  assert.equal(ok.status, 200);
  assert.equal(ok.body.status, 'ok');
  const down = await request(build({ dbUp: false })).get('/health');
  assert.equal(down.status, 503);
  assert.ok(!JSON.stringify(down.body).includes('hunter2'));
});

test('auth: no token 401, bad token 401, uninvited 403, invited 200 with DB role', async () => {
  const app = build();
  assert.equal((await request(app).get('/api/auth/me')).status, 401);
  assert.equal((await request(app).get('/api/auth/me').set('Authorization', 'Bearer nope')).status, 401);
  assert.equal((await request(app).get('/api/auth/me').set('Authorization', 'Basic abc')).status, 401);
  const stranger = await request(app).get('/api/auth/me').set('Authorization', 'Bearer tok-uninvited');
  assert.equal(stranger.status, 403);
  assert.equal(stranger.body.error.code, 'USER_NOT_REGISTERED');
  const me = await request(app).get('/api/auth/me').set('Authorization', 'Bearer tok-cashier');
  assert.equal(me.status, 200);
  assert.equal(me.body.user.role, 'user');
  assert.equal(me.body.currency, 'USD');
});

test('requireAdmin', () => {
  let result;
  requireAdmin({ user: USERS['cashier-sub'] }, {}, (e) => { result = e; });
  assert.equal(result.status, 403);
  requireAdmin({ user: USERS['admin-sub'] }, {}, (e) => { result = e; });
  assert.equal(result, undefined);
});

test('security headers, request id, no x-powered-by', async () => {
  const res = await request(build()).get('/health');
  assert.equal(res.headers['x-powered-by'], undefined);
  assert.ok(res.headers['strict-transport-security']);
  assert.equal(res.headers['x-content-type-options'], 'nosniff');
  assert.match(res.headers['x-request-id'], /^[0-9a-f-]{36}$/);
});

test('CORS: allowed origins only', async () => {
  const app = build();
  const ok = await request(app).options('/api/auth/me').set('Origin', 'https://b12-git-x-team.vercel.app').set('Access-Control-Request-Method', 'GET');
  assert.equal(ok.headers['access-control-allow-origin'], 'https://b12-git-x-team.vercel.app');
  const bad = await request(app).options('/api/auth/me').set('Origin', 'https://evil.example.com').set('Access-Control-Request-Method', 'GET');
  assert.equal(bad.headers['access-control-allow-origin'], undefined);
});

test('errors: unknown route 404 JSON, malformed JSON 400, oversized body 413', async () => {
  const app = build();
  const nf = await request(app).get('/nope');
  assert.equal(nf.status, 404);
  assert.equal(nf.body.error.code, 'NOT_FOUND');
  const bad = await request(app).post('/api/auth/me').set('Content-Type', 'application/json').send('{"a":');
  assert.equal(bad.status, 400);
  assert.equal(bad.body.error.code, 'INVALID_JSON');
  const big = await request(app).post('/api/auth/me').set('Content-Type', 'application/json').send(JSON.stringify({ x: 'a'.repeat(110_000) }));
  assert.equal(big.status, 413);
});

test('rate limit returns 429 JSON after 300 requests per minute', async () => {
  const app = build();
  let last;
  for (let i = 0; i < 301; i++) last = await request(app).get('/api/auth/me');
  assert.equal(last.status, 429);
  assert.equal(last.body.error.code, 'RATE_LIMITED');
});
