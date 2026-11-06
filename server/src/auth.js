import { createClient } from '@supabase/supabase-js';
import { ApiError } from './errors.js';

/** Supabase admin client (secret key). Server-side only. */
export function createSupabaseAdmin({ url, secretKey }) {
  return createClient(url, secretKey, { auth: { persistSession: false, autoRefreshToken: false } });
}

/** Verifies a Supabase access token (JWKS / asymmetric keys) and returns its claims, or null. */
export function makeVerifyToken(supabase) {
  return async (token) => {
    const { data, error } = await supabase.auth.getClaims(token);
    return error || !data?.claims?.sub ? null : data.claims;
  };
}

// While a temporary password is still active, only these routes answer.
const ALLOWED_WITH_TEMP_PASSWORD = new Set(['GET /api/auth/me', 'POST /api/auth/change-password']);

/**
 * Authenticates the bearer token, then loads the app user by auth_user_id ONLY.
 * Roles come from app_users, never from token metadata, and accounts are never
 * linked by email here, so a sign-in account no admin created has no app access.
 */
export function makeRequireAuth({ verifyToken, db }) {
  return async (req, _res, next) => {
    try {
      const m = /^Bearer ([A-Za-z0-9._-]+)$/.exec(req.get('authorization') || '');
      if (!m) throw new ApiError(401, 'UNAUTHENTICATED', 'Sign in required');
      const claims = await verifyToken(m[1]);
      if (!claims) throw new ApiError(401, 'UNAUTHENTICATED', 'Session expired or invalid');
      const { rows } = await db.query(
        'SELECT id, email, full_name, display_name, role, must_change_password FROM app_users WHERE auth_user_id = $1',
        [claims.sub],
      );
      if (!rows[0]) throw new ApiError(403, 'USER_NOT_REGISTERED', 'This account has not been created by an administrator');
      req.user = rows[0];
      req.auth = { userId: claims.sub, token: m[1], claims };
      req.log?.setBindings?.({ userId: rows[0].id });

      const route = `${req.method} ${(req.baseUrl + req.path).replace(/\/$/, '')}`;
      if (rows[0].must_change_password && !ALLOWED_WITH_TEMP_PASSWORD.has(route)) {
        throw new ApiError(403, 'PASSWORD_CHANGE_REQUIRED', 'Change your temporary password to continue');
      }
      next();
    } catch (err) {
      next(err);
    }
  };
}

export function requireAdmin(req, _res, next) {
  next(req.user?.role === 'admin' ? undefined : new ApiError(403, 'FORBIDDEN', 'Administrator access required'));
}
