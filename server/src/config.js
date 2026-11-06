// Validates the environment once at boot. The server refuses to start on any
// problem, listing all of them, and never prints secret values.
import { minorDigits } from './lib/money.js';
import { refFromDatabaseUrl, refFromSupabaseUrl } from './lib/supabaseRef.js';

const REQUIRED = [
  'APP_ENV', 'CURRENCY', 'APP_URL', 'FRONTEND_ORIGINS',
  'SUPABASE_URL', 'SUPABASE_PROJECT_ID', 'SUPABASE_SECRET_KEY', 'DATABASE_URL', 'DATABASE_CA_CERT',
  'RESEND_API_KEY', 'EMAIL_FROM',
];
// ANTHROPIC_API_KEY / ANTHROPIC_MODEL are optional: without a key only the AI
// Restock Advisor is disabled; everything else runs normally.
export const DEFAULT_ANTHROPIC_MODEL = 'claude-opus-5-5';

export class ConfigError extends Error {}

const isHttpsUrl = (v) => { try { return new URL(v).protocol === 'https:'; } catch { return false; } };

/**
 * "https://app.example.com,https://b12-*-team.vercel.app" -> origin predicate.
 * A single "*" may stand for part of one host label (Vercel previews).
 */
export function parseOrigins(list, { allowWildcard }) {
  const problems = [];
  const matchers = [];
  for (const raw of list.split(',').map((s) => s.trim()).filter(Boolean)) {
    const m = /^https:\/\/([a-z0-9.*-]+)$/.exec(raw);
    if (!m) { problems.push(`FRONTEND_ORIGINS entry "${raw}" must be https://host with no path or trailing slash`); continue; }
    const host = m[1];
    const stars = (host.match(/\*/g) || []).length;
    if (stars === 0) { matchers.push((o) => o === raw); continue; }
    if (!allowWildcard) { problems.push(`FRONTEND_ORIGINS wildcard "${raw}" is allowed on staging only`); continue; }
    if (stars > 1 || host.split('.')[0].indexOf('*') === -1) {
      problems.push(`FRONTEND_ORIGINS "${raw}": one "*" inside the first host label only`);
      continue;
    }
    const [before, after] = raw.split('*').map((s) => s.replace(/[.\\]/g, '\\$&'));
    const re = new RegExp(`^${before}[a-z0-9-]+${after}$`);
    matchers.push((o) => re.test(o));
  }
  if (!matchers.length && !problems.length) problems.push('FRONTEND_ORIGINS is empty');
  return { problems, isAllowed: (origin) => matchers.some((fn) => fn(origin)) };
}

export function loadConfig(env = process.env) {
  const problems = [];
  for (const name of REQUIRED) {
    if (!env[name] || !String(env[name]).trim()) problems.push(`${name} is missing`);
    else if (/YOUR_/.test(env[name])) problems.push(`${name} still contains a YOUR_ placeholder`);
  }
  if (problems.length) throw new ConfigError(`Invalid configuration:\n  - ${problems.join('\n  - ')}`);

  if (!['staging', 'production'].includes(env.APP_ENV)) problems.push('APP_ENV must be "staging" or "production"');
  try { minorDigits(env.CURRENCY); } catch (e) { problems.push(`CURRENCY: ${e.message}`); }
  if (!isHttpsUrl(env.APP_URL) || env.APP_URL.endsWith('/')) problems.push('APP_URL must be an https URL without a trailing slash');

  const apiRef = refFromSupabaseUrl(env.SUPABASE_URL);
  const dbRef = refFromDatabaseUrl(env.DATABASE_URL);
  if (!apiRef) problems.push('SUPABASE_URL must be https://<project-id>.supabase.co');
  if (!dbRef) problems.push('DATABASE_URL must be a Supabase pooler or direct URL');
  if (apiRef && dbRef && (apiRef !== dbRef || apiRef !== env.SUPABASE_PROJECT_ID)) {
    problems.push('SUPABASE_PROJECT_ID, SUPABASE_URL and DATABASE_URL point at different projects');
  }
  if (!/-----BEGIN CERTIFICATE-----/.test(env.DATABASE_CA_CERT)) problems.push('DATABASE_CA_CERT must be the PEM certificate text');
  if (/^sb_publishable_/.test(env.SUPABASE_SECRET_KEY)) problems.push('SUPABASE_SECRET_KEY is a publishable key; use the secret key');

  const origins = parseOrigins(env.FRONTEND_ORIGINS, { allowWildcard: env.APP_ENV === 'staging' });
  problems.push(...origins.problems);

  const timeZone = env.STORE_TIMEZONE || 'UTC';
  try { new Intl.DateTimeFormat('en-US', { timeZone }); } catch { problems.push(`STORE_TIMEZONE "${timeZone}" is not an IANA time zone (e.g. Africa/Lagos)`); }

  const port = Number(env.PORT || 3001);
  if (!Number.isInteger(port) || port < 1 || port > 65535) problems.push('PORT must be an integer 1-65535');
  const poolMax = Number(env.DATABASE_POOL_MAX || 10);
  if (!Number.isInteger(poolMax) || poolMax < 1 || poolMax > 100) problems.push('DATABASE_POOL_MAX must be 1-100');

  if (problems.length) throw new ConfigError(`Invalid configuration:\n  - ${problems.join('\n  - ')}`);

  const aiKey = (env.ANTHROPIC_API_KEY || '').trim();
  return Object.freeze({
    appEnv: env.APP_ENV,
    isProduction: env.APP_ENV === 'production',
    port,
    logLevel: env.LOG_LEVEL || 'info',
    currency: env.CURRENCY,
    timeZone,
    appUrl: env.APP_URL,
    isAllowedOrigin: origins.isAllowed,
    supabase: { url: env.SUPABASE_URL, projectId: env.SUPABASE_PROJECT_ID, secretKey: env.SUPABASE_SECRET_KEY },
    database: { url: env.DATABASE_URL, poolMax, caCert: env.DATABASE_CA_CERT },
    storage: {
      productImages: env.STORAGE_PRODUCT_IMAGES_BUCKET || 'product-images',
      shiftReports: env.STORAGE_SHIFT_REPORTS_BUCKET || 'shift-reports',
    },
    email: { resendApiKey: env.RESEND_API_KEY, from: env.EMAIL_FROM },
    // null = AI Restock Advisor not configured (a missing key or an unfilled YOUR_ placeholder)
    anthropic: aiKey && !/YOUR_/.test(aiKey)
      ? { apiKey: aiKey, model: (env.ANTHROPIC_MODEL || '').trim() && !/YOUR_/.test(env.ANTHROPIC_MODEL) ? env.ANTHROPIC_MODEL.trim() : DEFAULT_ANTHROPIC_MODEL }
      : null,
  });
}
