import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { pinoHttp } from 'pino-http';
import { rateLimit } from 'express-rate-limit';
import { randomUUID } from 'node:crypto';
import { errorHandler, notFound } from './errors.js';

/**
 * Builds the Express app. Dependencies are injected so tests can run it
 * without a real database: { config, logger, db, requireAuth }.
 */
export function createApp({ config, logger, db, requireAuth }) {
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
    allowedHeaders: ['Authorization', 'Content-Type', 'Idempotency-Key'],
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
  app.use('/api', requireAuth);

  app.get('/api/auth/me', (req, res) => {
    const u = req.user;
    res.json({ user: { id: u.id, email: u.email, full_name: u.full_name, display_name: u.display_name, role: u.role }, currency: config.currency });
  });

  app.use(notFound);
  app.use(errorHandler);
  return app;
}
