import pg from 'pg';

// NUMERIC (OID 1700) keeps pg's default string parser on purpose: money is
// converted with lib/money.js, never through a JavaScript float.

/**
 * TLS is always verified against the Supabase CA (DATABASE_CA_CERT); sslmode in
 * the URL is removed so the connection string can't weaken this.
 */
export function createPool({ url, poolMax, caCert }) {
  const u = new URL(url);
  u.searchParams.delete('sslmode');
  const pool = new pg.Pool({
    connectionString: u.toString(),
    max: poolMax,
    ssl: { ca: caCert, rejectUnauthorized: true },
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
    statement_timeout: 15_000,
    application_name: 'b12-api',
  });
  // An idle client error must not crash the process; the next query reconnects.
  pool.on('error', () => {});
  return pool;
}

/**
 * Runs fn(client) inside BEGIN/COMMIT. Any thrown error rolls back the whole
 * transaction before it propagates, so a failed operation leaves no partial writes.
 */
export async function withTransaction(pool, fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch { /* connection already broken; pg discards it */ }
    throw err;
  } finally {
    client.release();
  }
}
