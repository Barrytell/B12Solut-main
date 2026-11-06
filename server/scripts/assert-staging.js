// Exits non-zero unless the environment points at the STAGING project listed in
// targets.json (APP_ENV, SUPABASE_URL and DATABASE_URL must all agree). Used by
// CI before any staging database step. Production is never accepted here.
import { assertStagingTestTarget, loadTargets } from './lib/target-guard.js';

try {
  assertStagingTestTarget(process.env, loadTargets());
  console.log('[guard] staging project confirmed');
} catch (err) {
  console.error(`[guard] REFUSED: ${err.message}`);
  process.exit(1);
}
