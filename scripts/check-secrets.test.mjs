import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findSecrets, isForbiddenFile } from './check-secrets.mjs';

// Fake keys are assembled at runtime so this file never matches the scanner itself.
const fake = (prefix, n = 32) => prefix + 'x'.repeat(n);

test('detects each credential type', () => {
  const samples = [
    `ANTHROPIC_API_KEY=${fake('sk-ant-')}`,
    `SUPABASE_SECRET_KEY=${fake('sb_secret_')}`,
    `RESEND_API_KEY=${'re_' + 'a'.repeat(10) + '_' + 'b'.repeat(16)}`,
    `secret: ${fake('GOCSPX-')}`,
    ['eyJ' + 'a'.repeat(20), 'eyJ' + 'b'.repeat(20), 'c'.repeat(20)].join('.'),
    '-----BEGIN ' + 'PRIVATE KEY-----',
    'DATABASE_URL=postgresql://postgres.abc:' + 'hunter22' + '@aws-0.pooler.supabase.com:5432/postgres',
  ];
  for (const s of samples) assert.equal(findSecrets(s).length, 1, s);
});

test('ignores placeholders and ordinary code', () => {
  const ok = [
    'SUPABASE_SECRET_KEY=YOUR_SUPABASE_SECRET_KEY',
    'DATABASE_URL=postgresql://postgres.YOUR_SUPABASE_PROJECT_ID:YOUR_DATABASE_PASSWORD@YOUR_SUPABASE_POOLER_HOST:5432/postgres',
    'const re_match = value.replace(/x/, "");',
    'ANTHROPIC_MODEL=claude-opus-5-5',
  ];
  for (const s of ok) assert.deepEqual(findSecrets(s), [], s);
});

test('blocks .env files but allows .env.example', () => {
  assert.ok(isForbiddenFile('.env'));
  assert.ok(isForbiddenFile('server/.env.staging'));
  assert.ok(!isForbiddenFile('.env.example'));
  assert.ok(!isForbiddenFile('server/.env.example'));
  assert.ok(!isForbiddenFile('src/env.js'));
});
