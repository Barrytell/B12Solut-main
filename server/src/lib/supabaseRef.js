// Extracts the Supabase project reference ID from the URLs a process is
// configured with, so scripts and the server can prove which project they hit.

const REF = '[a-z0-9]{20}';

/** https://<ref>.supabase.co -> ref, otherwise null. */
export function refFromSupabaseUrl(value) {
  let url;
  try { url = new URL(value); } catch { return null; }
  if (url.protocol !== 'https:') return null;
  const m = new RegExp(`^(${REF})\\.supabase\\.co$`).exec(url.hostname);
  return m ? m[1] : null;
}

/**
 * Postgres URL -> ref. Accepts only Supabase hosts:
 *   direct  db.<ref>.supabase.co
 *   pooler  <region>.pooler.supabase.com with user <role>.<ref>
 */
export function refFromDatabaseUrl(value) {
  let url;
  try { url = new URL(value); } catch { return null; }
  if (url.protocol !== 'postgresql:' && url.protocol !== 'postgres:') return null;
  const direct = new RegExp(`^db\\.(${REF})\\.supabase\\.co$`).exec(url.hostname);
  if (direct) return direct[1];
  if (/^[a-z0-9-]+\.pooler\.supabase\.com$/.test(url.hostname)) {
    const user = new RegExp(`^[a-z_]+\\.(${REF})$`).exec(decodeURIComponent(url.username));
    return user ? user[1] : null;
  }
  return null;
}
