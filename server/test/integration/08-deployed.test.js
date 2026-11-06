// T24 smoke test of the DEPLOYED staging API (Railway), over real HTTPS.
// Runs only when STAGING_API_URL and STAGING_FRONTEND_ORIGIN are set. Read-only:
// it creates no data. The rate-limit check briefly throttles this runner's IP.
import { test } from 'node:test';
import assert from 'node:assert/strict';

const API = process.env.STAGING_API_URL?.replace(/\/$/, '');
const ORIGIN = process.env.STAGING_FRONTEND_ORIGIN;
const skip = !(API && ORIGIN) && 'set STAGING_API_URL and STAGING_FRONTEND_ORIGIN';

test('T24: health, HTTPS, security headers', { skip }, async () => {
  assert.ok(API.startsWith('https://'), 'staging API must be HTTPS');
  const res = await fetch(`${API}/health`);
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { status: 'ok', env: 'staging' });
  assert.ok(res.headers.get('strict-transport-security'));
  assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(res.headers.get('x-powered-by'), null);
});

test('T24: CORS allows the staging frontend only', { skip }, async () => {
  const preflight = (origin) => fetch(`${API}/api/auth/me`, {
    method: 'OPTIONS', headers: { Origin: origin, 'Access-Control-Request-Method': 'GET', 'Access-Control-Request-Headers': 'authorization' },
  });
  assert.equal((await preflight(ORIGIN)).headers.get('access-control-allow-origin'), ORIGIN);
  assert.equal((await preflight('https://evil.example.com')).headers.get('access-control-allow-origin'), null);
});

test('T24: errors are JSON without internals', { skip }, async () => {
  const unauth = await fetch(`${API}/api/auth/me`);
  assert.equal(unauth.status, 401);
  const body = await unauth.text();
  assert.match(body, /"code":"UNAUTHENTICATED"/);
  assert.doesNotMatch(body, /at .*\.js|stack|SELECT|postgres/i);
  const bad = await fetch(`${API}/api/auth/me`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"a":' });
  assert.ok([400, 401].includes(bad.status));
});

test('T24: rate limit answers 429 after 300 requests a minute', { skip, timeout: 120_000 }, async () => {
  let last;
  for (let i = 0; i < 31; i++) {
    const batch = await Promise.all(Array.from({ length: 10 }, () => fetch(`${API}/api/auth/me`)));
    last = batch.at(-1);
    if (batch.some((r) => r.status === 429)) { last = batch.find((r) => r.status === 429); break; }
  }
  assert.equal(last.status, 429);
});
