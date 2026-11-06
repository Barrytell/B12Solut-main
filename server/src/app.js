import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { pinoHttp } from 'pino-http';
import { rateLimit } from 'express-rate-limit';
import { randomUUID } from 'node:crypto';
import { errorHandler, notFound } from './errors.js';
import { requireAdmin } from './auth.js';
import { entityRouter } from './routes/entities.js';
import { salesRouter } from './routes/sales.js';
import { returnsRouter } from './routes/returns.js';
import { inventoryRouter } from './routes/inventory.js';
import { shiftsRouter } from './routes/shifts.js';
import { usersRouter } from './routes/users.js';
import { uploadsRouter } from './routes/uploads.js';
import { advisorRouter } from './routes/advisor.js';

/**
 * Builds the Express app. Everything external is injected so tests can run it
 * without a database or network: { config, logger, db, requireAuth, services }.
 * `services` = { money, entities, storage, sendMail, fmt, authAdmin, advisor, notifyLowStock }.
 */
export function createApp({ config, logger, db, requireAuth, services }) {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1); // Railway terminates TLS in front of us

  app.use(pinoHttp({
    logger,
    genReqId: (req, res) => {
      const id = randomUUID();
      res.setHeader('x-request-id', id);
      return id;
    },
    redact: ['req.headers.authorization', 'req.headers.cookie', 'res.headers["set-cookie"]'],
    serializers: { req: (r) => ({ id: r.id, method: r.method, url: r.url }) },
    customLogLevel: (_req, res, err) => (err || res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info'),
  }));

  app.use(helmet());
  app.use(cors({
    origin: (origin, cb) => cb(null, !origin || config.isAllowedOrigin(origin)),
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE'],
    allowedHeaders: ['Authorization', 'Content-Type'],
    maxAge: 600,
  }));
  app.use(express.json({ limit: '100kb' }));

  // Public, unauthenticated, not rate-limited: Railway's health check.
  app.get('/health', async (_req, res) => {
    try {
      await db.query('SELECT 1');
      res.json({ status: 'ok', env: config.appEnv });
    } catch {
      res.status(503).json({ status: 'unavailable' });
    }
  });

  app.use('/api', rateLimit({
    windowMs: 60_000,
    limit: 300,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler: (_req, res) => res.status(429).json({ error: { code: 'RATE_LIMITED', message: 'Too many requests, slow down' } }),
  }));
  app.use('/api', requireAuth); // every /api route below needs a valid, invited session

  app.get('/api/auth/me', (req, res) => {
    const u = req.user;
    res.json({ user: { id: u.id, email: u.email, full_name: u.full_name, display_name: u.display_name, role: u.role }, currency: config.currency });
  });

  if (services) {
    const s = services;
    app.use('/api/entities', entityRouter({ db, entities: s.entities }));
    app.use('/api/sales', salesRouter({ db, money: s.money, notifyLowStock: s.notifyLowStock }));
    app.use('/api/shifts', shiftsRouter({ db, money: s.money, storage: s.storage, sendMail: s.sendMail, fmt: s.fmt, config }));
    app.use('/api/returns', requireAdmin, returnsRouter({ db, money: s.money }));
    app.use('/api/inventory', requireAdmin, inventoryRouter({ db, money: s.money }));
    app.use('/api/users', requireAdmin, usersRouter({ db, authAdmin: s.authAdmin, config }));
    app.use('/api/uploads', requireAdmin, uploadsRouter({ storage: s.storage, config }));
    app.use('/api/restock-advisor', requireAdmin, advisorRouter({ advisor: s.advisor }));
  }

  app.use(notFound);
  app.use(errorHandler);
  return app;
}
