import { test } from 'node:test';
import assert from 'node:assert/strict';
import { verifyTarget, parseFlags, assertStagingTestTarget, GuardError } from '../../scripts/lib/target-guard.js';
import { refFromDatabaseUrl, refFromSupabaseUrl } from '../../src/lib/supabaseRef.js';

const STG = 'aaaaaaaaaaaaaaaaaaaa';
const PRD = 'bbbbbbbbbbbbbbbbbbbb';
const targets = { staging: STG, production: PRD };
const envFor = (ref, appEnv = 'staging') => ({
  APP_ENV: appEnv,
  SUPABASE_PROJECT_ID: ref,
  SUPABASE_URL: `https://${ref}.supabase.co`,
  DATABASE_URL: `postgresql://postgres.${ref}:pw@aws-0-eu-central-1.pooler.supabase.com:5432/postgres`,
});
const run = (argv, env = envFor(STG), t = targets) => verifyTarget({ flags: parseFlags(argv), env, targets: t });
const refused = (fn, re) => assert.throws(fn, (e) => e instanceof GuardError && re.test(e.message));

test('ref extraction', () => {
  assert.equal(refFromSupabaseUrl(`https://${STG}.supabase.co`), STG);
  assert.equal(refFromSupabaseUrl(`http://${STG}.supabase.co`), null);
  assert.equal(refFromSupabaseUrl('https://evil.example.com'), null);
  assert.equal(refFromDatabaseUrl(`postgresql://postgres:pw@db.${STG}.supabase.co:5432/postgres`), STG);
  assert.equal(refFromDatabaseUrl(`postgresql://postgres.${STG}:pw@aws-0-x.pooler.supabase.com:5432/postgres`), STG);
  assert.equal(refFromDatabaseUrl('postgresql://postgres:pw@aws-0-x.pooler.supabase.com:5432/postgres'), null);
  assert.equal(refFromDatabaseUrl(`postgresql://postgres.${STG}:pw@db.example.com:5432/postgres`), null);
  assert.equal(refFromDatabaseUrl('postgresql://postgres:pw@127.0.0.1:54322/postgres'), null);
});

test('staging dry-run by default, commit only with --commit', () => {
  assert.deepEqual(run(['--target=staging', `--expect-ref=${STG}`]), { target: 'staging', ref: STG, commit: false });
  assert.equal(run(['--target=staging', `--expect-ref=${STG}`, '--commit']).commit, true);
});

test('refusals happen before any connection', () => {
  refused(() => run([`--expect-ref=${STG}`]), /--target/);
  refused(() => run(['--target=prod', `--expect-ref=${STG}`]), /--target/);
  refused(() => run(['--target=staging']), /--expect-ref/);
  refused(() => run(['--target=staging', `--expect-ref=${PRD}`]), /mismatch/);
  refused(() => run(['--target=staging', `--expect-ref=${STG}`], { ...envFor(STG), DATABASE_URL: envFor(PRD).DATABASE_URL }), /mismatch/);
  refused(() => run(['--target=staging', `--expect-ref=${STG}`], { ...envFor(STG), SUPABASE_URL: envFor(PRD).SUPABASE_URL }), /mismatch/);
  refused(() => run(['--target=staging', `--expect-ref=${STG}`], { ...envFor(STG), SUPABASE_PROJECT_ID: PRD }), /mismatch/);
  refused(() => run(['--target=staging', `--expect-ref=${STG}`], { ...envFor(STG), DATABASE_URL: 'postgresql://u:p@db.example.com/x' }), /DATABASE_URL/);
  refused(() => run(['--target=staging', `--expect-ref=${STG}`], envFor(STG, 'production')), /APP_ENV/);
  refused(() => run(['--target=staging', `--expect-ref=${STG}`], envFor(STG), { staging: STG, production: STG }), /same project/);
  refused(() => run(['--target=staging', `--expect-ref=${STG}`], envFor(STG), { staging: 'YOUR_STAGING_SUPABASE_PROJECT_ID', production: PRD }), /targets\.json/);
});

test('production needs its own explicit approval flag', () => {
  const prodEnv = envFor(PRD, 'production');
  refused(() => run(['--target=production', `--expect-ref=${PRD}`, '--commit'], prodEnv), /approval-for-production/);
  refused(() => run(['--target=production', `--expect-ref=${PRD}`, `--i-have-approval-for-production=${STG}`], prodEnv), /approval-for-production/);
  refused(() => run(['--target=production', `--expect-ref=${STG}`, `--i-have-approval-for-production=${STG}`], envFor(STG, 'production')), /mismatch/);
  assert.equal(run(['--target=production', `--expect-ref=${PRD}`, `--i-have-approval-for-production=${PRD}`], prodEnv).target, 'production');
});

test('integration tests refuse anything but staging', () => {
  assert.doesNotThrow(() => assertStagingTestTarget(envFor(STG), targets));
  refused(() => assertStagingTestTarget(envFor(PRD), targets), /staging/);
  refused(() => assertStagingTestTarget(envFor(STG, 'production'), targets), /staging/);
  refused(() => assertStagingTestTarget(envFor(STG), { staging: 'YOUR_X', production: PRD }), /staging/);
});
