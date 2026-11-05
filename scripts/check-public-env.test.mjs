import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkPublicEnv } from './check-public-env.mjs';

const jwt = (payload) =>
  ['eyJhbGciOiJIUzI1NiJ9', Buffer.from(JSON.stringify(payload)).toString('base64url'), 'sig'].join('.');

test('allows the documented public variables', () => {
  assert.deepEqual(checkPublicEnv({
    VITE_SUPABASE_URL: 'https://abc.supabase.co',
    VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_abc123',
    VITE_API_URL: 'https://b12-staging.up.railway.app',
    VITE_APP_URL: '',
    VITE_AUTH_PROVIDERS: 'google',
    VITE_CURRENCY: 'USD',
    SUPABASE_SECRET_KEY: 'sb_secret_xyz', // not VITE_: not bundled, not this check's concern
  }), []);
  assert.deepEqual(checkPublicEnv({ VITE_SUPABASE_ANON_KEY: jwt({ role: 'anon' }) }), []);
});

test('rejects secret names and secret values', () => {
  const cases = {
    VITE_SUPABASE_SECRET_KEY: 'anything',
    VITE_SUPABASE_SERVICE_ROLE_KEY: 'anything',
    VITE_DB_PASSWORD: 'x',
    VITE_DATABASE_URL: 'x',
    VITE_KEY_A: 'sb_secret_' + 'x'.repeat(20),
    VITE_KEY_B: 'sk-ant-' + 'x'.repeat(30),
    VITE_KEY_C: 're_' + 'a'.repeat(10) + '_' + 'b'.repeat(10),
    VITE_KEY_D: 'GOCSPX-' + 'x'.repeat(20),
    VITE_KEY_E: 'postgresql://u:p@h/db',
    VITE_KEY_F: jwt({ role: 'service_role' }),
  };
  for (const [k, v] of Object.entries(cases)) assert.equal(checkPublicEnv({ [k]: v }).length, 1, k);
});
