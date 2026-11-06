import pino from 'pino';
import Anthropic from '@anthropic-ai/sdk';
import { loadConfig, ConfigError } from './config.js';
import { createPool } from './db.js';
import { createSupabaseAdmin, makeRequireAuth, makeVerifyToken } from './auth.js';
import { createApp } from './app.js';
import { createMoney } from './lib/money.js';
import { createFormat } from './lib/format.js';
import { createEntities } from './entities.js';
import { createStorage } from './storage.js';
import { adminEmails, createMailer, lowStockEmail } from './email.js';
import { createAdvisor, createDisabledAdvisor } from './routes/advisor.js';
import { createPasswordService } from './routes/authRoutes.js';
import { createClient } from '@supabase/supabase-js';

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
const money = createMoney(config.currency);
const sendMail = createMailer(config.email);

const services = {
  money,
  entities: createEntities(money),
  storage: createStorage(supabase),
  sendMail,
  fmt: createFormat({ currency: config.currency, timeZone: config.timeZone }),
  authAdmin: supabase.auth.admin,
  passwords: createPasswordService(supabase, config.supabase, createClient),
  // Optional integration: without ANTHROPIC_API_KEY only the Restock Advisor is disabled.
  advisor: config.anthropic
    ? createAdvisor({
      anthropic: new Anthropic({ apiKey: config.anthropic.apiKey }),
      model: config.anthropic.model,
      db,
      currency: config.currency,
      log: logger,
    })
    : createDisabledAdvisor(),
  notifyLowStock: async (alerts) => {
    const to = await adminEmails(db);
    if (to.length) await sendMail({ to, ...lowStockEmail(alerts, config.appUrl) });
  },
};

const requireAuth = makeRequireAuth({ verifyToken: makeVerifyToken(supabase), db });
const app = createApp({ config, logger, db, requireAuth, services });

const server = app.listen(config.port, '0.0.0.0', () => {
  logger.info({ port: config.port }, 'b12 api listening');
  if (!config.anthropic) logger.info('AI Restock Advisor disabled: ANTHROPIC_API_KEY is not set (optional)');
});

const shutdown = (signal) => {
  logger.info({ signal }, 'shutting down');
  server.close(() => db.end().finally(() => process.exit(0)));
  setTimeout(() => process.exit(1), 10_000).unref();
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
