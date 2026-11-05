import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadConfig, parseOrigins, ConfigError } from '../../src/config.js';

const REF = 'aaaaaaaaaaaaaaaaaaaa';
const OTHER = 'bbbbbbbbbbbbbbbbbbbb';
const valid = (over = {}) => ({
  APP_ENV: 'staging',
  CURRENCY: 'USD',
  APP_URL: 'https://b12-staging.vercel.app',
  FRONTEND_ORIGINS: 'https://b12-staging.vercel.app,https://b12-*-team.vercel.app',
  SUPABASE_URL: `https://${REF}.supabase.co`,
  SUPABASE_PROJECT_ID: REF,
  SUPABASE_SECRET_KEY: 'sb_secret_test',
  DATABASE_URL: `postgresql://postgres.${REF}:pw@aws-0-eu-central-1.pooler.supabase.com:5432/postgres`,
  DATABASE_CA_CERT: '-----BEGIN CERTIFICATE-----\nMIIB\n-----END CERTIFICATE-----',
  RESEND_API_KEY: 'test-resend',
  EMAIL_FROM: 'B12 <reports@example.com>',
  ANTHROPIC_API_KEY: 'test-anthropic',
  ANTHROPIC_MODEL: 'claude-opus-5-5',
  ...over,
});
const refused = (env, re) => assert.throws(() => loadConfig(env), (e) => e instanceof ConfigError && re.test(e.message));

test('valid staging config loads with defaults', () => {
  const c = loadConfig(valid());
  assert.equal(c.port, 3001);
  assert.equal(c.database.poolMax, 10);
  assert.equal(c.storage.shiftReports, 'shift-reports');
  assert.equal(c.isProduction, false);
});

test('the committed server/.env.example is refused (placeholders)', () => {
  const env = {};
  for (const line of readFileSync(join(import.meta.dirname, '../../.env.example'), 'utf8').split(/\r?\n/)) {
    const m = /^([A-Z_]+)=(.*)$/.exec(line);
    if (m) env[m[1]] = m[2];
  }
  refused(env, /YOUR_ placeholder/);
});

test('each refusal', () => {
  refused(valid({ ANTHROPIC_API_KEY: '' }), /ANTHROPIC_API_KEY is missing/);
  refused(valid({ APP_ENV: 'dev' }), /APP_ENV/);
  refused(valid({ CURRENCY: 'KWD' }), /only 0 or 2/);
  refused(valid({ APP_URL: 'http://b12.example.com' }), /APP_URL/);
  refused(valid({ SUPABASE_PROJECT_ID: OTHER }), /different projects/);
  refused(valid({ DATABASE_URL: `postgresql://postgres.${OTHER}:pw@aws-0-x.pooler.supabase.com:5432/postgres` }), /different projects/);
  refused(valid({ DATABASE_URL: 'postgresql://u:p@db.example.com:5432/x' }), /DATABASE_URL/);
  refused(valid({ SUPABASE_SECRET_KEY: 'sb_publishable_x' }), /publishable/);
  refused(valid({ DATABASE_CA_CERT: 'not a cert' }), /DATABASE_CA_CERT/);
  refused(valid({ PORT: 'abc' }), /PORT/);
  refused(valid({ APP_ENV: 'production' }), /wildcard .* staging only/);
});

test('error messages never contain secret values', () => {
  try { loadConfig(valid({ APP_ENV: 'dev', SUPABASE_SECRET_KEY: ['sb', 'secret', 'supersecret'].join('_') })); } catch (e) {
    assert.ok(!e.message.includes('supersecret'));
  }
});

test('origin matching', () => {
  const { isAllowed, problems } = parseOrigins('https://app.example.com,https://b12-*-team.vercel.app', { allowWildcard: true });
  assert.deepEqual(problems, []);
  assert.ok(isAllowed('https://app.example.com'));
  assert.ok(isAllowed('https://b12-git-feature-x-team.vercel.app'));
  assert.ok(!isAllowed('https://b12-x-team.vercel.app.evil.com'));
  assert.ok(!isAllowed('https://evil-team.vercel.app'));
  assert.ok(!isAllowed('http://app.example.com'));
  assert.ok(!isAllowed('https://b12-a.b-team.vercel.app')); // "*" cannot span labels
  assert.equal(parseOrigins('https://app.example.com/', { allowWildcard: false }).problems.length, 1);
  assert.equal(parseOrigins('https://*.vercel.app.*', { allowWildcard: true }).problems.length, 1);
});
