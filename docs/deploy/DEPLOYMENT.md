# B12 Store Solution — Staging Deployment Guide

This guide sets up **staging**: Supabase + Railway + Vercel + GitHub Actions. Production is the same
procedure on separate projects and is done **only with your explicit approval** (checklist Stage 11).

- Every value goes into a dashboard. Never put one in a file in git or in a chat.
- The full variable reference is in [README → Environment variables](../../README.md#environment-variables-vercel--railway--supabase).
- No Docker and no local Supabase are needed.

**Order:** 1 Supabase → 2 GitHub → 3 migrations → 4 Railway → 5 Vercel → 6 connect the URLs → 7 smoke check.

---

## 1. Supabase (staging project)

1. Create a project named e.g. `b12-staging`. Choose a strong database password and keep it in your password manager.
2. Note the **project reference ID**, the subdomain of the Project URL.
   - Put it in `server/scripts/targets.json` as `"staging"`.
   - It isn't secret, so it's committed. The migration and test guards refuse any other project.
3. **Authentication → Sign In / Providers:**
   - **Allow new users to sign up: OFF**.
   - Email: on.
   - Google: on (section 1a).
4. **Authentication → URL Configuration:** you fill these in at step 6, once the Vercel URL exists.
5. **Authentication → SMTP Settings:** enable custom SMTP.
   - Host `smtp.resend.com`, port `465`, username `resend`, password = a Resend API key.
   - Sender = an address on your Resend-verified domain.
   - Until a domain is verified, Resend only delivers to your own account email.
6. **Project Settings → API Keys:** you'll need the **publishable** key (`sb_publishable_…`) and a **secret** key (`sb_secret_…`).
7. **Connect → Session pooler:** copy the connection string (port 5432) for `DATABASE_URL`.
8. **Database → Settings → SSL Configuration → Download certificate:** its PEM text is `DATABASE_CA_CERT`.
9. **Account → Access Tokens:** create a **scoped** token limited to the staging project. That's `SUPABASE_ACCESS_TOKEN`, used only by the migration workflow.
10. Storage buckets are created by the migrations. Create nothing by hand.

### 1a. Google OAuth (staging client)

1. Google Cloud Console → APIs & Services → Credentials → **Create OAuth client ID** → *Web application*.
2. Authorized JavaScript origins: your staging Vercel URL (add it at step 6).
3. Authorized redirect URI: `https://<staging-project-id>.supabase.co/auth/v1/callback`.
4. Paste the client ID and secret **only** into Supabase → Authentication → Providers → Google.

## 2. GitHub

1. Keep the repository **private**. Push branch `migration/supabase`. *(This is the first push of this branch. I only push when you ask.)*
2. **Settings → Environments → New environment `staging`.** Add these as **environment secrets**:
   - `APP_ENV` = `staging`
   - `SUPABASE_URL`, `SUPABASE_PROJECT_ID`, `DATABASE_URL`
   - `SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD`
3. For the **staging integration tests**, add to the same environment:
   - every backend variable from the README table, with staging values, as secrets;
   - `SUPABASE_PUBLISHABLE_KEY`;
   - optionally the environment **variables** `STAGING_API_URL` and `STAGING_FRONTEND_ORIGIN`.

   Run them from Actions → **"Staging integration tests"**. They're manual only. They write and remove prefixed test data on staging and never send email.
4. Never create a `production` environment holding production database secrets for CI. Production migrations are run by hand, with your approval.
5. The **CI** workflow (`.github/workflows/ci.yml`) runs automatically on every push and pull request, with no secrets:
   - full-history secret scan;
   - lint plus the Linux case-sensitive import check;
   - script tests (including browser/server money parity);
   - production build;
   - a check that the bundle has no Base44 code;
   - the server unit tests.

## 3. Database migrations (staging)

1. GitHub → **Actions → "DB migrations (staging)" → Run workflow**, mode **dry-run** first.
   - The guard step refuses unless every value points at the staging project in `targets.json`.
2. Check the listed migrations (`…_schema`, `…_security`, `…_storage`), then run again with mode **apply**.
3. The workflow finishes with the security advisors and **fails on any security warning** (test T4).

## 4. Railway (backend, `staging` environment)

1. New project → **Deploy from GitHub repo** → this repository.
2. Service **Settings**:

   | Setting | Value |
   |---|---|
   | Root Directory | `server` |
   | Branch | `migration/supabase` for staging |
   | Build | Railpack (default); Node 22+ comes from `server/package.json` `engines` |
   | Start Command | `npm start` |
   | Healthcheck Path | `/health` |
   | Restart Policy | On Failure, 5 retries |
   | Watch Paths | `/server/**`, so frontend-only commits don't redeploy the API |
   | Networking | **Generate Domain** → this `https://…up.railway.app` URL is `VITE_API_URL` |

3. **Variables** (staging environment): every backend row of the README table, with staging values:
   - `APP_ENV=staging`, `NODE_ENV=production`, `CURRENCY`, `STORE_TIMEZONE`;
   - `APP_URL`, `FRONTEND_ORIGINS`;
   - `SUPABASE_URL`, `SUPABASE_PROJECT_ID`, `SUPABASE_SECRET_KEY`;
   - `DATABASE_URL`, `DATABASE_CA_CERT`;
   - `RESEND_API_KEY`, `EMAIL_FROM`;
   - *Optional:* `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL`. Without them only the AI Restock Advisor is off (README → "AI Restock Advisor (optional)").
   - `PORT` is set by Railway.
4. If any variable is missing or still a `YOUR_…` placeholder, the deploy log names it and the service doesn't start. That's intended.
5. Railway's `railway.json` (Config as Code) is deprecated and not used here; these dashboard settings replace it.

## 5. Vercel (frontend)

1. **Add New → Project** → import the repository. Root directory: the repository root.
   - Framework, install, build and output come from `vercel.json`: Vite, `npm ci`, `npm run build`, `dist`.
2. **Settings → Environment Variables**, scope **Preview** (staging values):
   - `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_API_URL` (the Railway URL);
   - `VITE_AUTH_PROVIDERS=google`, `VITE_CURRENCY`;
   - leave `VITE_APP_URL` empty for previews.
   - Only these public values go here. The build refuses anything that looks like a secret.
3. **Settings → Domains:** add a staging alias whose name contains `staging`, e.g. `b12-staging.vercel.app`, pointing at the `migration/supabase` branch. I'm allowed to run the browser walkthrough (T20) only on a host labelled as staging.

## 6. Connect the URLs (staging)

| Where | Setting | Value |
|---|---|---|
| Railway (staging) | `APP_URL` | `https://b12-staging.vercel.app` |
| Railway (staging) | `FRONTEND_ORIGINS` | `https://b12-staging.vercel.app,https://b12-*-<your-vercel-team>.vercel.app` |
| Supabase (staging) → URL Configuration | Site URL | `https://b12-staging.vercel.app` |
| Supabase (staging) → URL Configuration | Redirect URLs | `https://b12-staging.vercel.app/**`, `https://b12-*-<your-vercel-team>.vercel.app/**` |
| Google OAuth client (staging) | Authorized JavaScript origins | `https://b12-staging.vercel.app` |

Redeploy Railway after changing its variables.

## 7. Smoke check (T24, first part)

- `https://<railway-url>/health` returns `{"status":"ok","env":"staging"}`.
- The staging site opens on `/login` with only "Continue with Google".
- **First admin:** there's no self sign-up, so the first admin is invited once with `server/scripts/create-first-admin.js`.
  - It runs behind the target guard, is dry-run by default, and refuses if any admin already exists.
  - It **sends a real email**, so it runs only with your approval, to an address you choose.
  - After that, every user is invited from the Users page.

---

## Production (later, Stage 11, only with your explicit approval)

- **Separate projects throughout:** Supabase project, Google OAuth client, Railway `production` environment and Vercel **Production** variables.
- **Migrations:** applied by hand from a terminal behind the production guard (`--i-have-approval-for-production=<id>` plus typing the ID). Never from CI.
- **Domain:** you add it in Vercel. Then follow [README → After adding your domain](../../README.md#after-adding-your-domain-in-vercel).
