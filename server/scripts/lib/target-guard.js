// Every script that writes to a database (import, image/report migration,
// invites, staging test runs) must pass through this guard first.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { refFromDatabaseUrl, refFromSupabaseUrl } from '../../src/lib/supabaseRef.js';

export class GuardError extends Error {}

const TARGETS = ['staging', 'production'];
const isPlaceholder = (v) => !v || /^YOUR_/.test(v);

export function loadTargets(path = join(import.meta.dirname, '..', 'targets.json')) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

/** --flag=value / --flag -> { flag: value | true } */
export function parseFlags(argv) {
  const flags = {};
  for (const arg of argv) {
    const m = /^--([a-z0-9-]+)(?:=(.*))?$/.exec(arg);
    if (m) flags[m[1]] = m[2] ?? true;
  }
  return flags;
}

/**
 * Pure validation. Returns { target, ref, commit } or throws GuardError
 * before anything connects. `commit` is false (dry-run) unless --commit.
 */
export function verifyTarget({ flags, env, targets }) {
  const target = flags.target;
  if (!TARGETS.includes(target)) throw new GuardError('--target=staging|production is required');

  const expected = flags['expect-ref'];
  if (typeof expected !== 'string' || !expected) throw new GuardError('--expect-ref=<project-id> is required');

  if (isPlaceholder(targets?.staging) || isPlaceholder(targets?.production)) {
    throw new GuardError('scripts/targets.json must list real staging and production project IDs');
  }
  if (targets.staging === targets.production) {
    throw new GuardError('targets.json lists the same project for staging and production');
  }

  const fromApi = refFromSupabaseUrl(env.SUPABASE_URL);
  const fromDb = refFromDatabaseUrl(env.DATABASE_URL);
  if (!fromApi) throw new GuardError('SUPABASE_URL is not a https://<project-id>.supabase.co URL');
  if (!fromDb) throw new GuardError('DATABASE_URL is not a Supabase database URL (db.<id>.supabase.co or pooler user <role>.<id>)');

  const sources = {
    '--expect-ref': expected,
    SUPABASE_URL: fromApi,
    DATABASE_URL: fromDb,
    SUPABASE_PROJECT_ID: env.SUPABASE_PROJECT_ID,
    [`targets.json ${target}`]: targets[target],
  };
  const distinct = new Set(Object.values(sources));
  if (distinct.size !== 1) {
    const detail = Object.entries(sources).map(([k, v]) => `${k}=${v}`).join(', ');
    throw new GuardError(`project ID mismatch: ${detail}`);
  }
  if (env.APP_ENV !== target) throw new GuardError(`APP_ENV=${env.APP_ENV} does not match --target=${target}`);

  if (target === 'production' && flags['i-have-approval-for-production'] !== expected) {
    throw new GuardError('production requires --i-have-approval-for-production=<project-id>');
  }
  return { target, ref: expected, commit: flags.commit === true };
}

/** Full guard for CLI scripts: validation plus the interactive production confirmation. */
export async function guardOrExit({ argv = process.argv.slice(2), env = process.env, targets, input = process.stdin, output = process.stderr } = {}) {
  try {
    const result = verifyTarget({ flags: parseFlags(argv), env, targets: targets ?? loadTargets() });
    if (result.target === 'production') {
      if (!input.isTTY) throw new GuardError('production runs need an interactive terminal (refused in CI)');
      const rl = createInterface({ input, output });
      const typed = (await rl.question(`Type the PRODUCTION project ID (${result.ref}) to continue: `)).trim();
      rl.close();
      if (typed !== result.ref) throw new GuardError('confirmation did not match; nothing was written');
    }
    output.write(`[guard] target=${result.target} project=${result.ref} mode=${result.commit ? 'COMMIT' : 'dry-run'}\n`);
    return result;
  } catch (err) {
    if (!(err instanceof GuardError)) throw err;
    output.write(`[guard] REFUSED: ${err.message}\n`);
    process.exit(1);
  }
}

/** For the staging test suite: refuses anything that is not the staging project. */
export function assertStagingTestTarget(env = process.env, targets = loadTargets()) {
  const ref = refFromSupabaseUrl(env.SUPABASE_URL);
  if (env.APP_ENV !== 'staging' || isPlaceholder(targets.staging) || ref !== targets.staging
      || refFromDatabaseUrl(env.DATABASE_URL) !== ref || targets.production === ref) {
    throw new GuardError('integration tests run only against the staging project listed in targets.json');
  }
}
