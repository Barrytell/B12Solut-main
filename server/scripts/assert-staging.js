// Exits non-zero unless the environment points at the STAGING project listed in
// targets.json (APP_ENV, SUPABASE_URL and DATABASE_URL must all agree). Used by
// CI before any staging database step. Production is never accepted here.
import { assertStagingTestTarget, loadTargets } from './lib/target-guard.js';

try {
  const targets = loadTargets();
  assertStagingTestTarget(process.env, targets);
  // `supabase link` uses SUPABASE_PROJECT_ID, so it must be the staging project too.
  if (process.env.SUPABASE_PROJECT_ID !== targets.staging) throw new Error('SUPABASE_PROJECT_ID is not the staging project in targets.json');
  console.log('[guard] staging project confirmed');
} catch (err) {
  console.error(`[guard] REFUSED: ${err.message}`);
  process.exit(1);
}
