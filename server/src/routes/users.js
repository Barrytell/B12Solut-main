// POST /api/users (admin): an administrator creates an Admin or Cashier
// account with full name, email, an initial (temporary) password and role.
// Sign-ups are disabled in Supabase; there is no other way to get an account.
import { Router } from 'express';
import { z } from 'zod';
import { rateLimit } from 'express-rate-limit';
import { ApiError } from '../errors.js';
import { emailField } from '../lib/fields.js';
import { passwordField, isWeakPasswordError } from '../lib/password.js';
import { serializeOne } from '../lib/serialize.js';

const createSchema = z.strictObject({
  full_name: z.string().trim().min(1, 'Full name is required').max(200),
  email: emailField(),
  password: passwordField(),
  role: z.enum(['admin', 'user']),
});

const isAlreadyRegistered = (error) =>
  error?.code === 'email_exists' || error?.status === 422 && /already|registered|exists/i.test(error?.message ?? '');

export function usersRouter({ db, authAdmin }) {
  const router = Router();

  router.post('/',
    rateLimit({
      windowMs: 60 * 60_000, limit: 30, keyGenerator: (req) => `create-user:${req.user.id}`,
      handler: (_req, res) => res.status(429).json({ error: { code: 'RATE_LIMITED', message: 'Too many accounts created, try again later' } }),
    }),
    async (req, res, next) => {
      try {
        const body = createSchema.parse(req.body);
        const exists = await db.query('SELECT 1 FROM public.app_users WHERE lower(email) = $1', [body.email]);
        if (exists.rowCount) throw new ApiError(409, 'USER_EXISTS', 'A user with this email already exists');

        // 1. Auth account (Supabase hashes the password; it is never stored or logged here)
        const { data, error } = await authAdmin.createUser({ email: body.email, password: body.password, email_confirm: true });
        if (error) {
          if (isAlreadyRegistered(error)) throw new ApiError(409, 'USER_EXISTS', 'This email already has a sign-in account');
          if (isWeakPasswordError(error)) throw new ApiError(400, 'WEAK_PASSWORD', error.message);
          req.log?.error({ err: { code: error.code, status: error.status } }, 'auth createUser failed');
          throw new ApiError(502, 'ACCOUNT_CREATE_FAILED', 'The account could not be created');
        }

        // 2. App user linked to it; on any failure the Auth account is removed so nothing half-made remains
        try {
          const created = serializeOne(await db.query(
            `INSERT INTO public.app_users (email, full_name, display_name, role, auth_user_id, must_change_password, created_by_id)
             VALUES ($1, $2, $2, $3, $4, true, $5) RETURNING *`,
            [body.email, body.full_name, body.role, data.user.id, req.user.id],
          ));
          res.status(201).json(created);
        } catch (err) {
          const { error: cleanupError } = await authAdmin.deleteUser(data.user.id).catch((e) => ({ error: e }));
          if (cleanupError) req.log?.error({ orphanAuthUserId: data.user.id }, 'could not remove auth user after failed app_users insert');
          throw err;
        }
      } catch (e) { next(e); }
    });

  return router;
}
