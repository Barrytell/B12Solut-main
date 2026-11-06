-- S15 (round 5): an administrator creates accounts with a temporary password.
-- While this flag is true the API refuses everything except /api/auth/me and
-- the password change. No password or hash is ever stored in application tables.
ALTER TABLE public.app_users
  ADD COLUMN must_change_password boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.app_users.must_change_password IS
  'True after an admin sets a temporary password; cleared when the user sets their own (change or email reset).';
