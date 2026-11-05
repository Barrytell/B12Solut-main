import pino from 'pino';
import { loadConfig, ConfigError } from './config.js';
import { createPool } from './db.js';
import { createSupabaseAdmin, makeRequireAuth, makeVerifyToken } from './auth.js';
import { createApp } from './app.js';

let config;
try {
  config = loadConfig(process.env);
} catch (err) {
  if (!(err instanceof ConfigError)) throw err;
  console.error(err.message); // lists variable names only, never values
  process.exit(1);
}

const logger = pino({ level: config.logLevel, base: { env: config.appEnv } });
const db = createPool(config.database);
const supabase = createSupabaseAdmin(config.supabase);
const requireAuth = makeRequireAuth({ verifyToken: makeVerifyToken(supabase), db });
const app = createApp({ config, logger, db, requireAuth });

const server = app.listen(config.port, '0.0.0.0', () => logger.info({ port: config.port }, 'b12 api listening'));

const shutdown = (signal) => {
  logger.info({ signal }, 'shutting down');
  server.close(() => db.end().finally(() => process.exit(0)));
  setTimeout(() => process.exit(1), 10_000).unref();
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
