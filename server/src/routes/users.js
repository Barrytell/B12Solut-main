// Admin invitations (D1). Only admins create accounts; the invited person sets
// their own password through the emailed link. Sign-ups are disabled in Supabase.
import { Router } from 'express';
import { z } from 'zod';
import { rateLimit } from 'express-rate-limit';
import { ApiError } from '../errors.js';
import { emailField } from '../lib/fields.js';
import { serializeOne } from '../lib/serialize.js';

const inviteSchema = z.strictObject({
  email: emailField(),
  display_name: z.string().trim().max(200).optional(),
  role: z.enum(['admin', 'user']).default('user'),
});

const isAlreadyRegistered = (error) => /already (been )?registered|already exists/i.test(error?.message ?? '');

export function usersRouter({ db, authAdmin, config }) {
  const router = Router();
  const redirectTo = `${config.appUrl}/reset-password?invite=1`;

  router.use(rateLimit({
    windowMs: 60 * 60_000, limit: 30, keyGenerator: (req) => `invite:${req.user.id}`,
    handler: (_req, res) => res.status(429).json({ error: { code: 'RATE_LIMITED', message: 'Too many invitations, try again later' } }),
  }));

  router.post('/invite', async (req, res, next) => {
    try {
      const body = inviteSchema.parse(req.body);
      const exists = await db.query('SELECT 1 FROM public.app_users WHERE lower(email) = $1', [body.email]);
      if (exists.rowCount) throw new ApiError(409, 'USER_EXISTS', 'A user with this email already exists');

      const { data, error } = await authAdmin.inviteUserByEmail(body.email, { redirectTo });
      if (error) {
        if (isAlreadyRegistered(error)) throw new ApiError(409, 'USER_EXISTS', 'This email already has a sign-in account');
        req.log?.error({ err: { message: error.message, status: error.status } }, 'invite failed');
        throw new ApiError(502, 'INVITE_FAILED', 'The invitation email could not be sent');
      }

      try {
        const created = serializeOne(await db.query(
          `INSERT INTO public.app_users (email, full_name, display_name, role, auth_user_id, created_by_id)
           VALUES ($1, $2, $2, $3, $4, $5) RETURNING *`,
          [body.email, body.display_name || null, body.role, data.user.id, req.user.id],
        ));
        res.status(201).json(created);
      } catch (err) {
        // keep Auth and app_users consistent: undo the auth user if the app row failed
        await authAdmin.deleteUser(data.user.id).catch(() => {});
        throw err;
      }
    } catch (e) { next(e); }
  });

  router.post('/:id/resend-invite', async (req, res, next) => {
    try {
      const user = (await db.query('SELECT id, email, auth_user_id FROM public.app_users WHERE id = $1', [req.params.id])).rows[0];
      if (!user) throw new ApiError(404, 'NOT_FOUND', 'User not found');
      if (user.auth_user_id) {
        const { data } = await authAdmin.getUserById(user.auth_user_id);
        if (data?.user?.last_sign_in_at || data?.user?.email_confirmed_at) {
          throw new ApiError(409, 'INVITE_ACCEPTED', 'This user has already accepted the invitation');
        }
      }
      const { data, error } = await authAdmin.inviteUserByEmail(user.email, { redirectTo });
      if (error) {
        req.log?.error({ err: { message: error.message, status: error.status } }, 'resend invite failed');
        throw new ApiError(502, 'INVITE_FAILED', 'The invitation email could not be sent');
      }
      if (!user.auth_user_id && data?.user?.id) {
        await db.query('UPDATE public.app_users SET auth_user_id = $2 WHERE id = $1', [user.id, data.user.id]);
      }
      res.status(204).end();
    } catch (e) { next(e); }
  });

  return router;
}
