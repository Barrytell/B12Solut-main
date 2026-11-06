// POST /api/auth/change-password (any signed-in user).
//
// - Normal and first-login change: requires the current password, which the
//   server verifies with Supabase before setting the new one.
// - After an email password reset the session comes from the reset link (token
//   amr "otp"/"magiclink" within the last 15 minutes): then the current password
//   is not required, because the owner proved access to the mailbox.
// Either way: the policy is checked, the password is set through the Auth Admin
// API, must_change_password is cleared and the user's other sessions end.
// Passwords are never logged or returned.
import { Router } from 'express';
import { z } from 'zod';
import { rateLimit } from 'express-rate-limit';
import { ApiError } from '../errors.js';
import { passwordField, isWeakPasswordError } from '../lib/password.js';

const schema = z.strictObject({
  current_password: z.string().min(1).max(72).optional(),
  new_password: passwordField(),
});

const RECOVERY_WINDOW_SECONDS = 15 * 60;

/** True when this session was opened from an email recovery link moments ago. */
export function isFreshRecoverySession(claims, now = Date.now() / 1000) {
  // auth-js documents "otp" / "magiclink" for email-link sessions; all need mailbox access (verified in T14)
  return (claims?.amr ?? []).some((a) => ['otp', 'magiclink', 'recovery'].includes(a?.method) && now - Number(a.timestamp) <= RECOVERY_WINDOW_SECONDS);
}

export function authRouter({ db, passwords }) {
  const router = Router();

  router.post('/change-password',
    rateLimit({
      windowMs: 15 * 60_000, limit: 5, keyGenerator: (req) => `change-password:${req.user.id}`,
      handler: (_req, res) => res.status(429).json({ error: { code: 'RATE_LIMITED', message: 'Too many attempts, wait 15 minutes' } }),
    }),
    async (req, res, next) => {
      try {
        const body = schema.parse(req.body);
        const recovery = isFreshRecoverySession(req.auth.claims);
        if (!recovery) {
          if (!body.current_password) throw new ApiError(400, 'CURRENT_PASSWORD_REQUIRED', 'Enter your current password');
          if (!(await passwords.verify(req.user.email, body.current_password))) {
            throw new ApiError(401, 'WRONG_PASSWORD', 'The current password is not correct');
          }
          if (body.current_password === body.new_password) throw new ApiError(400, 'SAME_PASSWORD', 'Choose a password different from the current one');
        }

        const { error } = await passwords.update(req.auth.userId, body.new_password);
        if (error) {
          if (isWeakPasswordError(error)) throw new ApiError(400, 'WEAK_PASSWORD', error.message);
          req.log?.error({ err: { code: error.code, status: error.status } }, 'password update failed');
          throw new ApiError(502, 'PASSWORD_UPDATE_FAILED', 'The password could not be changed');
        }
        await db.query('UPDATE public.app_users SET must_change_password = false WHERE id = $1', [req.user.id]);
        // keep this session, end every other one (including the verification sign-in above)
        await passwords.signOutOthers(req.auth.token).catch((err) => req.log?.warn({ err: { message: err?.message } }, 'signing out other sessions failed'));
        res.status(204).end();
      } catch (e) { next(e); }
    });

  return router;
}

/** Real implementation on the Supabase secret-key client (server only). */
export function createPasswordService(supabase, { url, secretKey }, createClient) {
  return {
    async verify(email, password) {
      // a throw-away client so the check never touches the admin client's state
      const probe = createClient(url, secretKey, { auth: { persistSession: false, autoRefreshToken: false } });
      const { error } = await probe.auth.signInWithPassword({ email, password });
      return !error;
    },
    update: (authUserId, password) => supabase.auth.admin.updateUserById(authUserId, { password }),
    signOutOthers: async (token) => {
      const { error } = await supabase.auth.admin.signOut(token, 'others');
      if (error) throw error;
    },
  };
}
