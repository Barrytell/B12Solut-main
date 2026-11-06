// Database connection for scripts: same verified-TLS rules as the server.
import pg from 'pg';

export async function connect(env = process.env) {
  if (!env.DATABASE_URL) throw new Error('DATABASE_URL is not set');
  if (!/-----BEGIN CERTIFICATE-----/.test(env.DATABASE_CA_CERT ?? '')) throw new Error('DATABASE_CA_CERT (PEM) is required');
  const url = new URL(env.DATABASE_URL);
  url.searchParams.delete('sslmode');
  const client = new pg.Client({
    connectionString: url.toString(),
    ssl: { ca: env.DATABASE_CA_CERT, rejectUnauthorized: true },
    application_name: 'b12-migration-script',
  });
  await client.connect();
  return client;
}
