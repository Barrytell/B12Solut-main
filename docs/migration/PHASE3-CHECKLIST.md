# B12 Store Solution — Implementation Checklist (Phase 3–7)

Status: **round 4: cloud-only.** Cloud implementation and staging preparation are authorized; production stays behind the gates in section G.
**Round 5 (2026-11-06):**
- **Email-and-password authentication only.** All social/OAuth login is removed from the plan (A19).
- Admins create accounts with an initial password, which the user must change at first login (A20).
- The application code for this is **Stage 12, waiting for your approval**: the current branch still contains the earlier invite and Google code.
- The Anthropic API is optional (A21, implemented).
Date: 2026-11-05 · Builds on [PHASE2-DESIGN.md](PHASE2-DESIGN.md).
- Decisions D1–D6 are approved and B.5 is decided.
- The domain is no longer blocking; you add it in Vercel yourself.
- **No Docker Desktop and no local Supabase anywhere in this plan.**

---

## A. Design amendments

All of these are in PHASE2-DESIGN.md.

| # | Amendment | Round |
|---|---|---|
| A1 | `shifts.report_path` links each official PDF to its shift (S13) | 2 |
| A2 | `GET /api/shifts/:id/report-url`: a 10-minute signed URL, owner or admin only | 2 |
| A3 | `migrate-reports.js`: old report PDFs mapped by file name or contents; nothing invented | 2 |
| A4 | "View report" button: the only UI addition | 2 |
| A5 | D6: cashiers read `cost_price`, but have no write path to products, prices, costs or stock | 2 |
| A6 | Originals preserved (section B); imports fixed by editing the import lines, not by renaming files | 2 |
| A7 | **Integer minor units for all money**: NUMERIC is never turned into floats | 3 |
| A8 | **Server-generated official shift PDF** from database values; `declared_cash` stored (S14) | 3 |
| A9 | **Migration target guard**: dry-run by default, ref verified against the actual connection, separate production authorization | 3 |
| A10 | **No access without an `app_users` row**: sign-ups off, and the API matches sessions only on `auth_user_id`, which is set when the admin creates the account (round 5: the OAuth part is gone) | 3, 5 |
| A11 | **Model verified** with the Models API at startup; `ANTHROPIC_MODEL` configurable; default `claude-opus-5-5` | 3 |
| A12 | **Storage**: product images publicly viewable with no client writes; shift reports private, backend only | 3 |
| A13 | **Git hygiene**: extended `.gitignore` + secret scan as a pre-commit hook and before the first push | 3 |
| A14 | **Cloud-only.** A hosted staging Supabase project, a Railway `staging` environment and Vercel previews. Automated tests run in GitHub Actions (or from this machine) against **staging only**. No Docker, no local Supabase | 4 |
| A15 | **`server/` holds everything server-side**: the Express API, tests, migration scripts and Supabase migrations (`server/supabase`). The original has no server code, so nothing existing moves | 4 |
| A16 | **Complete environment templates**: `/.env.example` (public `VITE_` only) and `server/.env.example`, plus the README reference with staging and production instructions. The server refuses to boot on a missing or `YOUR_…` value. The build refuses any secret-looking `VITE_` variable | 4 |
| A17 | **One configurable currency** (`CURRENCY` = `VITE_CURRENCY`). Minor units follow ISO 4217; 0- and 2-digit currencies are supported, 3-digit ones are refused at boot | 4 |
| A19 | **Email and password only (firm).** No Google, Apple, Facebook, Microsoft or other social/OAuth login, now or later. No OAuth configuration, callback routes, components, buttons or variables. Login screen: email, password, Sign in, Forgot password. No public sign-up | 5 |
| A20 | **Admin-created accounts.** `POST /api/users`: full name, email, initial password and role (Admin/Cashier); created with the Supabase Auth Admin API; `app_users` linked by `auth_user_id`; any failure deletes the half-created Auth user. The initial password is temporary: `must_change_password` (S15) blocks every other route until `POST /api/auth/change-password`. Users can change their password any time. The last admin can't be demoted | 5 |
| A21 | **Anthropic optional.** Without `ANTHROPIC_API_KEY` only the Restock Advisor is off; admins see "not configured"; startup and everything else are unaffected. **Implemented** (commit `e4f3d59`) | 5 |
| A18 | **Domain not blocking**: generated Vercel and Railway URLs until you add the domain. I make no DNS changes. README "After adding your domain" lists every setting to update | 4 |

---

## B. Original source preservation

1. ✅ ZIP `C:\Users\USER\B12bizzsolu-original-2026-11-05.zip`: 153 files, SHA-256 `B265E261F9C3821A79F17D71C36AB0C0C989B612B4A453D85257580AE4872199`.
2. ✅ Secret check before the baseline commit: no `.env`, key files or credential strings.
3. ✅ Baseline commit `27c20f7` on `main`, tagged `original-base44`. **Never modified.**
4. ✅ Branch `migration/supabase`; all work happens here.
   - On 2026-11-05 you committed the docs as "First commit", renamed this branch to `main` and pushed it to `github.com/Barrytell/B12Solut-main`.
   - `migration/supabase` was recreated locally from that `main` (`8fcbdcf`).
   - The untouched baseline is still `27c20f7`, tagged `original-base44`. The tag exists **locally only**; it hasn't been pushed.
5. `OAuthConsent.jsx` and `app-params.js` are deleted **on the branch only**, after a grep shows no references and build, lint and tests pass. They stay in the ZIP and the tag.
6. The ZIP's SHA-256 is re-checked at handover (10.3).

---

## C. Implementation stages

Each item has a "done when" check. Nothing is ticked until its check has been run and its output recorded. **A failed build, security test, database test or migration test stops the work and is reported to you. Nothing is skipped, bypassed or marked passed without running.**

Stages 1–3 need no cloud accounts. Stage 4 onwards needs the staging projects (H.1).

### Stage 0 — Safety and templates

- [x] 0.1 ZIP + SHA-256 (B.1)
- [x] 0.2 Secret check, baseline, tag, branch (B.2–4)
- [x] 0.3a Extended `.gitignore` (A13, A16)
- [x] 0.3b `/.env.example`, `server/.env.example` and the README environment reference (A16). *Placeholders only.*
- [x] 0.4 `scripts/check-secrets.mjs` + `.githooks/pre-commit` (`git config core.hooksPath .githooks`).
  - A planted fake Anthropic key blocked a commit.
  - The hook also caught a fake key in a test file during a real commit; that was fixed.
  - Full-history scan: clean.
- [x] 0.5 "Before" state, recorded on 2026-11-06 with `npm install`. There was no lockfile, so `package-lock.json` was added.
  - Build **failed**: `base44Client` missing, and the `SaleTerminal` case mismatch.
  - Lint **failed**: 21 unused imports.

### Stage 1 — Frontend build blockers (no cloud needed)

- [x] 1.1 Import case fixes (SaleTerminal ×2, Cart, WholesaleSale), plus the 21 unused imports removed (`eslint --fix`, import lines only). `npm run lint` now passes.
- [x] 1.2 Import-case check: `scripts/check-import-case.mjs` (dependency-free, part of `npm run lint`) instead of an ESLint plugin.
  - Verified that it catches a planted wrong-case import.
  - Its only remaining failures are the 33 `@/api/base44Client` imports, which Stage 6 replaces.
  - The build passes only after Stage 6; the Linux build check comes with CI (Stage 7).

### Stage 2 — Server foundation (no cloud needed)

*Stage 2 status (2026-11-06): 2.1–2.7 done; 28 server unit tests + 5 script tests pass. 2.5 is unit-tested with a fake token verifier; the real Supabase `getClaims` is verified on staging (Stage 5).*

- [x] 2.1 `server/package.json` (Node ≥ 22, pinned versions, lockfile committed), Express app:
  - `helmet`, CORS allow-list with the Vercel preview pattern, 100 kB JSON limit, `trust proxy`;
  - `pino-http` with redaction;
  - central error handler.
- [x] 2.2 **Config validation** (also requires `DATABASE_CA_CERT`, so database TLS is verified):
  - every required variable present and not a `YOUR_…` placeholder;
  - `APP_ENV` is `staging` or `production`;
  - the `SUPABASE_PROJECT_ID` value matches the host in `SUPABASE_URL` and the user in `DATABASE_URL`;
  - `CURRENCY` is supported.
  - *Done when:* unit tests cover each refusal.
- [x] 2.3 `money.js` (A7, A17). *Done when:* unit tests pass:
  - `0.1 + 0.2`;
  - 3-dp quantities;
  - half-way rounding;
  - 10¹⁰ scale;
  - JPY (0 dp);
  - KWD refused.
- [x] 2.4 `target-guard.js` + `targets.json` (A9). *Done when:* T22's unit cases pass using fake URLs, with no database.
- [x] 2.5 `requireAuth` (JWKS from `SUPABASE_URL`, `app_users` by `auth_user_id` only) and `requireAdmin`.
- [x] 2.6 Rate limits (general 300/min; per-route limits are added with their routes); `GET /health`; `PORT` from the environment, bound to `0.0.0.0`.
- [x] 2.7 `scripts/check-public-env.mjs`, run before `vite build` (verified: a planted `VITE_SUPABASE_SECRET_KEY` is refused). It fails if a `VITE_` name contains `SECRET`, `SERVICE`, `PASSWORD` or `PRIVATE`, or a value looks like `sb_secret_`, `sk-ant-`, `re_` or a JWT with `service_role`.

### Stage 3 — Database migrations written (no cloud needed to write)

*Stage 3 status (2026-11-06):*
- *All files are written and pass the real Postgres parser (`libpg-query`, syntax only).*
- *Not yet checked: function bodies, and references to `auth.users` and `storage.buckets`. These are checked when the files are applied to staging in 4.1.*
- *Supabase CLI file names use timestamps (`YYYYMMDDHHMMSS_name.sql`).*

- [x] 3.1 `server/supabase/migrations/20261106000100_schema.sql`:
  - 10 tables, S1–S8, S12–S14, `numeric(12,2)`; S10 (`sale_type` null) is handled by the import.
  - Adds `UNIQUE(transaction_id, line_no)` and `UNIQUE(return_id, line_no)`.
  - The `updated_date` trigger honours `b12.preserve_updated_date` so the import keeps original timestamps.
- [x] 3.2 `20261106000200_security.sql`:
  - RLS on, no policies, `REVOKE ALL` from `anon` and `authenticated`;
  - default privileges revoked for future objects;
  - RLS deliberately not FORCEd, because the API is the table owner.
- [x] 3.3 `20261106000300_storage.sql`:
  - `product-images`: public, PNG/JPEG/WebP/GIF, 5 MB. SVG is excluded because it can carry scripts.
  - `shift-reports`: private, PDF, 10 MB.
  - No `storage.objects` policies.
- [x] 3.4 `server/supabase/test-fixtures/force-rollback.sql` + `remove-force-rollback.sql`.
  - **Staging only**, outside `migrations/`.
  - It fires only on rows marked `__force_rollback__`.

### Stage 4 — Staging Supabase (needs H.1)

- [ ] 4.1 `supabase link` + `supabase db push --linked` on **staging**, behind the guard. *Done when:* `supabase migration list --linked` shows 0001–0003.
- [ ] 4.2 Security advisors on staging (`supabase db advisors --linked`, or the dashboard Security Advisor if the CLI version lacks it). *Done when:* there are no security findings.
- [ ] 4.3 Auth settings on staging, done by you from README §Supabase:
  - email provider only, sign-ups off, every other provider off;
  - password policy, and secure password change on;
  - Auth rate limits;
  - Site/Redirect URLs (for reset links);
  - Resend SMTP.
  - *Done when:* T10 and T32 pass.
- [ ] 4.4 Update `docs/schema/schema.sql` and the README tables section to the final schema.

### Stage 5 — API (integration tests against staging)

*Stage 5 status (2026-11-06): **routes are written and unit-tested; nothing is ticked yet.** An item is ticked only after its staging integration test passes.*
- *Unit tests: 47 server tests (permission matrix, validation, injection guards, pricing, returns, report figures, PDF rendering in Node, email escaping, upload sniffing) plus 5 script tests.*
- *Not yet run against a real database: locking, rollback, concurrency, idempotency races, Supabase Auth (admin account creation, `getClaims`), Storage, Resend, Anthropic (optional).*

*Design details settled while writing Stage 5:*
- *Tax per line = unit × qty × rate%, rounded once from the exact product. Profit = grand total − cost, as today.*
- *Card and e-pay are charged exactly the total; cash must cover it, or `409 PAYMENT_SHORT`.*
- *A product's category must exist (`400 UNKNOWN_CATEGORY`): the new schema links categories by name. The product form's `'other'` default is fixed in Stage 6.*
- *Deleting a category in use is refused on the server too (`409 CATEGORY_IN_USE`).*
- *Product create with stock → audit "Initial stock (product created)". Product form stock edit → audit "Stock edited in product form" (D3).*
- *Images: PNG, JPEG, WebP and GIF, checked by content; SVG refused.*
- *The upload request body is the raw file.*
- *The report body takes the store header as `{store: {storeName, storeAddress, storePhone, storeEmail, storeWebsite}}`. The response is `{report_path, email_sent}`: the PDF is kept even if email fails.*
- *`STORE_TIMEZONE` added, so report times aren't printed in the server's UTC.*
- *Restock Advisor: refusal fallbacks are **not** used. They're opt-in and aimed at other models; a refusal returns a polite message instead.*
- *(Round 5: the invite and resend-invite routes are superseded by admin-created accounts; see Stage 12.)*

- [ ] 5.1 Generic entity routes + permission matrix (A5).
- [ ] 5.2 `PATCH /Product`: stock change and audit row in one transaction (D3).
- [ ] 5.3 `POST /api/sales`: locks, 409 on insufficient stock (D4), database prices, integer cents, idempotency, relative shift totals, low-stock alerts.
- [ ] 5.4 `POST /api/returns`: admin only (D2), atomic, cents, audit rows.
- [ ] 5.5 `POST /api/inventory/update` and `/bulk-stock`: atomic, reason required, audit rows.
- [ ] 5.6 Shifts: `start`; `close` (stores `declared_cash`); `report` (server PDF via jsPDF in Node, stored, emailed); `report-url` (10 min).
- [ ] 5.7 Users: `auth/me`, **`POST /api/users`** and **`POST /api/auth/change-password`**, the `must_change_password` gate, and last-admin protection (A20). *Round 5: the current code still has `users/invite` and `resend-invite`; Stage 12 replaces them.*
- [ ] 5.8 `uploads/product-image`: admin only, magic bytes, ≤ 5 MB.
- [ ] 5.9 Resend email module; escaped templates; figures from the database.
- [ ] 5.10 Restock Advisor: model check at boot, read-only tools, 503 if the model is unavailable, limitation documented.

### Stage 6 — Frontend migration (same UI, same routes)

*Stage 6 status (2026-11-06):*
- *Code is complete. `npm run lint` and `npm run build` **pass**: the first successful build since the migration began.*
- *The bundle contains no `base44` code and no secrets; the only `VITE_` values in it are the Supabase URL and the publishable key.*
- *A parity test shows the browser cart total equals the server's charge on 2,000 random carts.*
- *Local smoke test without a backend:*
  - *`/admin` redirects to `/login`;*
  - *the login page showed only the Google button (D5 at the time), and an invalid invite link showed the "invalid invitation" screen. **Both are superseded by round 5 and are reworked in Stage 12;***
  - *`/register` explains that accounts are created by the administrator.*
- ***Not yet verified with a backend:** every data screen, sign-in, account creation, sales, returns, inventory and reports. That happens on staging (T20).*

*Changes made beyond a straight swap:*
- *Close shift: the server closes the shift first. If that fails the shift stays open and the error shows. Then the server builds and emails the report, and "Download PDF" fetches a fresh 10-minute link.*
  - *My Shift now keeps the closed shift on screen until "Done". Before, the confirmation and download screen disappeared at once.*
  - *My Shift offers "View last shift report".*
- *The browser "Preview PDF before sending" button is kept. It's a preview only, never stored or emailed.*
- *`stockAlerts.js` is removed: low-stock emails are sent by the server after each sale. The client-side upload and email code in `shiftReport.js` is removed too.*
- *The user form was changed to invite by email, with "Resend invite". **Superseded by round 5:** Stage 12 changes it to full name, email, initial password and role.*
- *Product form: category defaults to "No category" instead of `'other'`.*
- *Product images: PNG, JPEG, WebP and GIF, at most 5 MB, checked in the browser and again on the server.*
- *Inventory and bulk-stock saves now show an error toast on failure; before, a failed save gave no message.*
- *The Vite config sets the `@` alias itself (the Base44 plugin did that before). There is a local favicon, and `vercel.json` adds the SPA rewrite and security headers.*
- *Money in the browser:*
  - *Cart pricing, return previews, the shift-close variance and every dashboard, margin, wholesale and purchase-order total use exact cents (`src/lib/money.js`).*
  - *Ratios (margin %, share, turnover) and demand-forecast statistics stay plain division; they aren't money amounts.*
- ***Open:** the `$` symbol is still hard-coded in labels (K9). It's correct for USD, the default, and gets switched to `formatMoney` if you set another currency.*

- [ ] 6.1 `src/lib/supabase.js`, `src/api/client.js` (same `entities.X.*` shape).
- [ ] 6.2 `AuthContext` on supabase-js; auth pages with **email and password only** (D5); the admin create-user form (D1); `/change-password` (A20). *Finished in Stage 12.*
- [ ] 6.3 Mechanical `base44.` → `api.` swap (about 22 files).
- [ ] 6.4 Logic call sites: sales, returns, inventory, shift close/report/download via `report-url`, alerts, advisor.
- [ ] 6.5 `src/lib/money.js` in the ~37 money files; `formatMoney` uses `VITE_CURRENCY` (A7, A17).
- [ ] 6.6 "View report" button (A4).
- [ ] 6.7 `vite.config.js` without Base44, a local favicon, `vercel.json` SPA rewrite.

### Stage 7 — Staging deployment + CI (authorized; staging only)

*Stage 7 status (2026-11-06): **configuration prepared, nothing deployed.***
- *`.github/workflows/ci.yml`: secret scan, lint plus the import-case check, script tests, build, a no-Base44 bundle check, and server unit tests. It needs no secrets. It hasn't run yet: the branch isn't pushed.*
- *`.github/workflows/db-staging.yml`: manual, staging only.*
  - *The guard runs first.*
  - *Supabase CLI pinned to **2.121.0**, a release older than 2 weeks; 3.0.0 came out on 2026-11-02 and is avoided. Flags checked against that version's `--help`.*
  - *Dry-run, then apply, then advisors with `--fail-on warn`.*
- *`server/supabase/config.toml` (minimal), `engines.node >= 22` in both packages.*
- *`docs/deploy/DEPLOYMENT.md`: step-by-step staging setup.*
- *`server/scripts/create-first-admin.js` bootstraps the first admin, since sign-ups are off. It's guarded, dry-run by default, refuses if an admin exists, and sends a real email only with your approval.*
- *Both workflow files parse as YAML. They haven't been run on GitHub.*
- *Staging integration suite **written, not yet run**: 41 tests in `server/test/integration/`.*
  - *They run via `npm run test:integration` (reads a git-ignored `server/.env.staging`) or Actions → "Staging integration tests" (manual only, serialized with migrations).*
  - *Coverage: T2, T3, T5–T10, T11(b), T12, T14–T18, T21, T24, plus the D3 audit, category and wholesale checks.*
  - *Every file refuses unless all settings point at the staging project. Verified: without staging settings all 34 runnable tests refuse.*
  - *Email is captured in memory, so nothing is sent. The AI tests (T18) are opt-in, and so is the deployed-API smoke test (T24).*
  - ***Round 5:** `02-auth.test.js` still tests the invite flow (T12 old). Stage 12 rewrites it for T12, T13 and T27–T36 below.*
  - *The rollback tests (T7) install `supabase/test-fixtures/force-rollback.sql` for the run and always remove it.*
- *Security review fix: `db-staging.yml` pins `supabase/setup-cli` to a commit SHA, passes secrets only to the steps that need them, and checks `SUPABASE_PROJECT_ID` too before linking.*

- [ ] 7.1 `.github/workflows/ci.yml`:
  - lint, `check-public-env`, build;
  - server unit tests;
  - integration tests against staging, using the GitHub `staging` environment secrets;
  - `concurrency: staging-db` so only one run touches staging at a time.
- [ ] 7.2 Railway `staging` environment, set in the service settings (docs/deploy/DEPLOYMENT.md):
  - root directory `server`;
  - start command `npm start`;
  - health check `/health`;
  - restart on failure.
  - You enter the variables.
  - *`railway.json` is not used: Railway deprecated it, and new services can't opt in.*
- [ ] 7.3 Vercel project: previews for pull requests and a staging alias. The alias host should contain `staging` (e.g. `b12-staging.vercel.app`) so I may run the browser walkthrough on it. You enter the variables.
- [ ] 7.4 Staging smoke test (T24).

### Stage 8 — Migration scripts (staging rehearsal)

*Stage 8 status (2026-11-06): **scripts written and unit-tested, not yet run against a database.** Runbook: `docs/deploy/DATA-MIGRATION.md`.*
- *`import-base44.js` + `lib/base44-export.js`:*
  - *pre-import check as specified, including >2-dp money, totals ≠ lines and unknown fields;*
  - *read-only conflict check against the target;*
  - *one transaction with reconciliation inside it (any mismatch rolls back).*
  - *8 unit tests on a synthetic export. Staging test `09-import` covers the commit, kept ids and dates, a detected re-import, and full rollback on a last-step failure.*
- *`migrate-images.js` (`--hosts` required, content-sniffed, ≤ 5 MB), `migrate-reports.js` (file-name match + manual `--map`, never overwrites), `invite-users.js` (real emails, approval only).*
- *All four refuse without `--target`/`--expect-ref` (verified) and are dry-run by default.*
- *Change from A3: renamed PDFs are matched with a `--map` file you confirm, instead of reading the cashier and date from inside the PDF. Automatic matching from PDF contents would be guesswork.*
- *JSON export only. CSV is added once your real export shows its layout.*

- [ ] 8.1 `import-base44.js`: preflight (orphans, >2-dp money, totals ≠ lines), single-transaction import, exact reconciliation.
- [ ] 8.2 `migrate-images.js`, `migrate-reports.js`.
- [ ] 8.3 Accounts for imported users. **Round 5:** `invite-users.js` is replaced in Stage 12 by `create-accounts.js`. It creates Auth accounts with a random password that's never shown, plus `must_change_password`, then sends a password-reset email. That's real email, so it runs with approval only. Alternatively, the admin creates each account in User Management.

### Stage 9 — Cloud test campaign (section D) and handover docs

- [ ] 9.1 Run T1–T26 as defined in section D; record each result with its output in `docs/migration/TEST-REPORT.md`.
- [ ] 9.2 Handover docs, in `docs/deploy/`:
  - Supabase setup (email/password auth), Railway, Vercel, Resend, Anthropic (optional);
  - database migrations, data import, storage migration;
  - domain configuration;
  - production deployment checklist, backup and recovery;
  - security verification report;
  - `docs/API.md`.

### Stage 10 — Base44 removal and delivery

- [ ] 10.1 Grep audit for `base44`, `@base44/sdk`, `VITE_BASE44` and `/api/apps/`.
- [ ] 10.2 Delete the obsolete files on the branch (B.5) and remove the Base44 packages; build, lint and tests pass afterwards.
- [ ] 10.3 Full-history secret scan before the first push; re-check the ZIP's SHA-256.

### Stage 11 — Production (each step only with your explicit approval)

- [ ] 11.1 Production Supabase: `db push` behind the production authorization (A9); advisors; auth settings.
- [ ] 11.2 Production Railway and Vercel deployment.
- [ ] 11.3 Final export, then production import behind the guard (A9), then reconciliation.
- [ ] 11.4 Images and reports migration, then user accounts (reset emails or admin-set initial passwords), with your approval.
- [ ] 11.5 You add the domain in Vercel; then the README "After adding your domain" updates; then T26 read-only smoke.

### Stage 12 — Round 5 auth rework (approved 2026-11-06; **code written, not yet run against staging**)

*Status:*
- *12.1–12.5 are implemented. 66 server unit tests pass (9 new in `auth-rules.test.js`). Lint and build pass. The 45 staging tests refuse correctly without staging settings.*
- *Local check: the login page shows email, password, Sign in and Forgot password only, `/change-password` redirects to `/login` without a session, and `/reset-password` without a link shows "invalid link".*
- *Open:*
  - *T14 confirms on staging that a reset-link session is recognised (`amr` `otp`/`magiclink`).*
  - *The T35 last-admin case runs on staging only when it's the only admin; it's covered by a unit test.*
  - *The supabase-js library itself still defines `signInWithOAuth`, so the CI check (T36) asserts our source never calls it and that the bundle has no provider buttons.*
- *Each item below is ticked once its staging test passes.*

Superseded implementation (round 3): invite emails, the Google button, `VITE_AUTH_PROVIDERS` and `SocialAuthButtons`. Work items:

- [ ] 12.1 Migration `…_must_change_password.sql` (S15). Nothing else in the schema changes.
- [ ] 12.2 Server:
  - `POST /api/users` (replaces `/invite` and `/resend-invite`) and `POST /api/auth/change-password`;
  - the `PASSWORD_CHANGE_REQUIRED` gate in `requireAuth`;
  - `must_change_password` in `/api/auth/me`, and cleared after a completed email reset;
  - last-admin protection on PATCH and DELETE of User;
  - pino redaction of `password` and `current_password`;
  - rate limits.
- [ ] 12.3 Frontend:
  - delete `SocialAuthButtons.jsx` and `GoogleIcon.jsx`, and remove `VITE_AUTH_PROVIDERS` and every `signInWithOAuth`;
  - login page: email, password, Sign in, Forgot password;
  - `CreateUserForm`: full name, email, initial password (with Generate and Copy, as before) and role;
  - new `/change-password` page, the forced redirect while `must_change_password` is set, and a "Change password" entry in the account menu;
  - `/reset-password` keeps password recovery only (the invite variant goes).
- [ ] 12.4 Scripts: `create-first-admin.js` asks for the initial password at a hidden prompt, never as an argument. `invite-users.js` becomes `create-accounts.js` (8.3).
- [ ] 12.5 Tests:
  - rewrite `02-auth.test.js` for T11–T15 and T27–T35;
  - add the T31 fixture trigger (staging-only, like T7);
  - T36 checks the built bundle for `signInWithOAuth`;
  - unit tests for validation, the gate and last-admin protection.
  - No existing security test is removed or weakened.
- [ ] 12.6 Update the README and `docs/deploy/DEPLOYMENT.md` "smoke check" to the new login screen.

---

## D. Cloud test plan (Phase 5)

All tests run on **staging only**: the staging Supabase project, Railway `staging` and Vercel previews or the staging alias.
- **Automated runs** (CI, or this machine with a git-ignored `server/.env.staging` that you fill in yourself) refuse to start unless `APP_ENV=staging` and the project ID matches the **staging** entry in `targets.json`.
- Every run creates its own users, products and shifts under a unique prefix `t_<runid>_`, deletes them afterwards, and sweeps leftovers older than 24 h.
- **No destructive test ever runs against production.**

Levels:
- **CI** — automated (GitHub Actions or this machine) against the staging database or API;
- **DEP** — automated against the deployed staging Railway/Vercel;
- **M** — manual, by you or by me in the browser pane;
- **P** — production, read-only.

| # | Test | Level | Pass criteria |
|---|---|---|---|
| T1 | **Build + lint** | CI + Vercel preview | `npm run lint`, `check-public-env` and `npm run build` pass on Linux (`ubuntu-latest`, Node 22), and the Vercel preview builds |
| T2 | **API authorization:** every endpoint × {no token, cashier, admin, valid token with no `app_users` row, expired token} | CI + DEP subset | Matches the permission matrix exactly; forced-scope routes return only the caller's own rows; privilege escalation (cashier PATCH on `role` or products) returns 403 |
| T3 | **Data API + Storage lockdown** with the publishable key, as anonymous, cashier and admin | CI | (a) Tables: no rows readable, no insert, update or delete accepted. (b) `product-images`: the public URL returns 200; upload, upsert, delete, move and list are refused. (c) `shift-reports`: public URL, download, list, upload, delete and client `createSignedUrl` all refused. (d) `report-url`: owner and admin succeed, another cashier gets 403, no token gets 401, and the URL expires after 10 min. (e) `uploads/product-image`: admin 201, cashier 403 |
| T4 | **Security advisors** | CI (CLI `--linked`) or M (dashboard) | No security findings |
| T5 | **Concurrent sales:** 20 parallel sales of 1 unit against stock 5, across 2 cashiers, through the real HTTP API | CI + DEP | Exactly 5 succeed and 15 return 409; stock = 0, never negative; shift totals equal the exact sum; 5 transaction rows |
| T6 | Concurrent mixed operations: sales + bulk stock + return on the same products | CI | Final stock equals the expected arithmetic; one audit row per change; no deadlocks |
| T7 | **Rollback** for sales, returns, inventory update, bulk stock and shift close | CI | A staging-only fixture trigger raises at the last write step. It fires only for rows carrying the run's `t_<runid>_fail_` prefix, and is installed and dropped by the runner. Afterwards: zero new rows; stock and shift values unchanged; 500 with no internals |
| T8 | **Idempotency:** the same `client_request_id` sent twice, sequentially and concurrently | CI | One transaction; stock decremented once; the replay returns the same transaction |
| T9 | **Price integrity:** tampered `unit_price`, `cost_price`, totals or discount above subtotal in the request | CI | 400 or ignored; database prices are used |
| T10 | **No self-registration:** `signUp` with the publishable key | CI | Rejected |
| T11 | **No access without an `app_users` row** | CI | A real Supabase Auth user that no admin created (no `app_users` row) gets `403 USER_NOT_REGISTERED` on every route |
| T12 | **Admin creates an Admin account** (replaces the old invitation test) | CI | `POST /api/users` (role `admin`) → 201 without a password in the response. The Auth user exists with a confirmed email. `app_users` has the full name, role `admin`, `auth_user_id` and `must_change_password = true`. No password is in any table or in the logs |
| T13 | **Admin creates a Cashier account** | CI | Same with role `user`. The new cashier can sign in, and after the forced password change can use the POS but gets 403 on admin routes |
| T14 | **Password reset (email)** | CI + M | CI: `generateLink({type:'recovery'})` (no email sent) → the new password works, the old one fails, a reused link is refused, `must_change_password` is cleared. M: one real reset email delivered to an address you choose (your approval) |
| T15 | Demotion takes effect | CI | Next request returns 403 on admin routes |
| T16 | **Shift report:** close → server PDF → stored → admins emailed | CI + M | PDF text and email figures equal the database exactly; financial fields in the request are rejected; the store header is escaped; another cashier can't fetch it. CI sends to Resend's test recipient. M: visual comparison of the PDF against the old layout |
| T17 | **Image upload:** valid PNG/JPEG/WebP; renamed `.exe`; > 5 MB; SVG | CI | 201 / 400 / 413 / 400 |
| T18 | **Restock Advisor** | CI (model check) + DEP (prompts) | The model check passes with the staging key, and a wrong model gives 503 on the advisor only. The 5 suggested prompts run once on staging and reference real inventory; cashiers get 403. *Costs a few cents per run* |
| T19 | **Import + reconciliation** on your Base44 export | M (staging, your approval: it contains real personal data) | Preflight report reviewed; exact counts and decimal totals match. Destructive suites T5–T7 are paused while this data is on staging; staging is reset after T20 |
| T20 | **Feature parity** (section E) at 375 / 768 / 1280 px | M (me in the browser pane on the staging alias, or you) | Every item ticked with a screenshot |
| T21 | **Financial calculations** | CI | `money.js` unit tests; 3 × 0.10 + 0.20 = 0.50 exactly with tax and discount; 1,000 random sales against the exact SQL `SUM`; margins and return impact match hand-computed values; JPY case |
| T22 | **Migration target guard** | CI (unit) + staging dry-run | Every refusal case stops before any write; a production run without the double authorization is refused; a staging dry-run writes nothing |
| T23 | **Secret hygiene** | CI | A planted key blocks the commit; the full-history scan is clean; `check-public-env` rejects a planted `VITE_SUPABASE_SECRET_KEY` |
| T24 | **Deployed staging smoke + HTTP security** | DEP | `/health` 200; CORS allows the staging origin and refuses others; `helmet` headers present; 429 after the rate limit; errors carry no stack or SQL; HTTPS only |
| T25 | **Config refusal** | CI | The server refuses to boot on a missing variable, a `YOUR_…` placeholder, a project ID mismatch or an unsupported currency |
| T27 | **Email/password login** | CI | A correct email and password returns a session. `/api/auth/me` returns the role from `app_users`, not from token metadata |
| T28 | **Invalid password rejected** | CI | A wrong password, or an unknown email, gets the same generic error and no session. The account isn't locked out, because Supabase's rate limit applies instead (T32) |
| T29 | **Unauthorized account creation rejected** | CI | `POST /api/users` with no token → 401; as a cashier → 403 (including attempts to create an Admin); as an account with no `app_users` row → 403. In every case no Auth user and no `app_users` row is created |
| T30 | **Duplicate email rejected** | CI | Creating an existing email (any letter case) → `409 USER_EXISTS`. Nothing new in Auth or `app_users` |
| T31 | **Account creation failure handling** | CI | A staging-only fixture trigger makes the `app_users` insert fail. Result: 500 with no internals, the Auth user created a moment earlier is **deleted** (no orphan in `auth.users`), and nothing remains in `app_users`. Also: invalid full name, email, password or role → 400 before Supabase is called |
| T32 | **Rate limits on auth** | CI + M | CI: `POST /api/users` and `POST /api/auth/change-password` return 429 after their limits. M: the Supabase Auth rate limits for sign-in and password-reset emails are set in the dashboard (screenshot in `TEST-REPORT.md`), and a burst of wrong-password sign-ins gets throttled |
| T33 | **Password change on first login** | CI | A new user's API calls → `403 PASSWORD_CHANGE_REQUIRED` (except `/api/auth/me` and the password change). A wrong current password → 401. A weak or unchanged new password → 400. A correct change → 204, after which `must_change_password` is false, the old password fails, the new one works, and other sessions are signed out. Browser walkthrough (T20): login goes to `/change-password` and no other page opens until the password is changed |
| T34 | **Change password later** | CI | A signed-in user without the flag changes their password with the current one. The same checks apply as T33 |
| T35 | **Role protection** | CI | A cashier can't change any role. Nobody can change their own role (admin → 409). The **last admin** can't be demoted or deleted (`409 LAST_ADMIN`). With two admins, demoting one works and takes effect on its next request (T15) |
| T36 | **No social login anywhere** | CI | Supabase project settings list no enabled provider except email (Auth admin settings API, or a dashboard screenshot). The built frontend contains no `signInWithOAuth` and no provider buttons. `/register` has no form. A `signUp` call is refused (T10) |
| T26 | **Production smoke, read-only**, after an approved cutover | P | `/health`, login, one read per role. No writes, no test data |

**Tests that can't be reproduced the old (local) way, and what replaces them:**
- **Mailpit inbox capture** → `generateLink` in CI (T12, T14) plus one real delivery each, done by you.
- **Disposable local database reset between runs** → run prefixes + cleanup + sweep, serialized CI, and an optional guarded `db reset --linked` on staging only.
- **Offline rollback trigger** → a prefix-scoped fixture trigger on staging (T7).
- **Round 5:** there is no OAuth anymore, so every authentication test except real email delivery and the dashboard rate-limit check is automated.

---

## E. Feature parity checklist (requirement 10)

Each item is checked on staging (T20).

**Auth:**
- Login (email and password only)
- Forgot / reset password
- Admin creates Admin and Cashier accounts (full name, email, initial password, role)
- Forced password change at first login; change password any time
- `/register` notice
- Logout
- Unauthenticated → `/login`
- Non-admin on `/admin/*` → `/pos`
- 404 page

**POS:**
- `/pos` sale type chooser
- `/pos/retail`:
  - Start shift
  - Search and category filter
  - Barcode scanner
  - Cart quantity limits
  - Discount
  - Cash / card / electronic payment with change
  - Receipt modal
  - Thermal receipt
  - Sale invoice PDF
  - Store / printer settings
  - Low-stock toast
- `/pos/wholesale`:
  - Wholesale pricing
  - Customer name
  - WS- numbers
  - Invoice
- `/pos/history` (own sales)
- `/pos/shift`:
  - Live totals
  - Close with declared cash
  - Variance
  - Official PDF download
  - Email to admins
  - View report

**Admin:**
- Dashboard:
  - Daily performance
  - Trend chart
  - Recent transactions
  - Summary and sale type filter
  - Low-stock alerts and banner
  - Process return
- Products CRUD + image upload / URL
- Inventory manager:
  - Inline edits with reason
  - Bulk set / add / subtract
  - Adjustment log
- Categories:
  - Add
  - Delete blocked while in use
- Suppliers CRUD
- Purchase orders + PDF
- Transactions and filters
- Shifts + View report
- Margins by period
- Demand forecast + apply threshold
- Wholesale dashboard:
  - Filters
  - Analytics
  - Turnover
  - Payment mix
  - Top customers
  - Product table
  - CSV export
- Users: list, create account, change role (with last-admin protection)
- Restock Advisor with tool-call display

**Responsive:**
- Desktop, tablet (768 px) and mobile (375 px) for every route above

---

## F. Requirement traceability

| Requirement | Covered by |
|---|---|
| D1 Admin creates accounts with a temporary password (round 5) | A20, 5.7, 6.2, Stage 12, T12, T13, T29–T31, T33 |
| D2 Admin-only returns | 5.4, T2 |
| D3 Every stock change audited | 5.2, 5.4, 5.5, T6, T7 |
| D4 Refuse short-stock sales, never clamp | 5.3, T5 |
| D5 Email and password only, no social login (round 5) | A19, 6.2, Stage 12, T27, T28, T36 |
| D6 Cost visible to cashiers, no cashier writes | A5, 5.1, T2, T9 |
| R1–R10 (round 2) | A1–A6, section B, T2–T20, gates |
| C1 Public images, private reports | A12, 3.3, T3 |
| C2 Integer money, per currency | A7, A17, 2.3, 5.3, 5.4, 6.5, 8.1, T21 |
| C3 Server-generated official PDF | A8, 5.6, T16 |
| C4 Migration target guard | A9, 2.4, T22 |
| C5 Git secrets | A13, 0.4, 10.3, T23 |
| C6 No access without an admin-created account | A10, T10, T11 |
| **Round 5:** | |
| N10 Email/password only, no OAuth anywhere | A19, Stage 12, T36 |
| N11 Admin-only account creation, validation, failure safety | A20, T12, T13, T29, T30, T31 |
| N12 Temporary password, first-login change, change any time | A20, S15, T33, T34 |
| N13 Login/reset rate limits; passwords never stored or logged | T12, T32 |
| N14 Role rules: no self-role change, last admin protected | T35, T15 |
| N15 Anthropic optional | A21 (implemented), unit tests, T18 |
| C7 Model verified, configurable | A11, 5.10, T18 |
| C8 Obsolete files deleted on the branch | B.5, 10.2 |
| C9 No production without approval | Section G |
| **Round 4:** | |
| N1 No Docker or local Supabase | A14; every test in section D is cloud-based; replacements listed under D |
| N1b `server/` folder | A15 |
| N2 Complete environment templates and reference; `VITE_` public only | A16, 0.3b, 2.2, 2.7, T23, T25 |
| N3 Domain not blocking; no DNS changes | A18, README "After adding your domain" |
| N4 All features preserved, responsive | Section E, T20 |
| N5 Security and financial integrity | Stages 2–5, T2–T9, T15–T17, T21, T24 |
| N6 Cloud testing, no destructive production tests | Section D (staging guard, T26 read-only) |
| N7 Handover docs | 9.2 |
| N8 Originals preserved | Section B |
| N9 Approval gates | Section G |

---

## G. Gates

**Authorized now:** implementation, staging projects, staging deployments, and the automated test campaign on staging.

**Each of these needs your explicit approval:**
1. Importing your real Base44 export into **staging** (T19). It contains personal data.
2. Any real email: password-reset emails to real inboxes, report emails to real admins.
3. Creating any real (non-test) user account.
3. **Production:**
   - database changes;
   - data import;
   - deployment or cutover;
   - real user accounts or bulk emails.
   - All of these come only after T1–T25 pass on staging and you sign off on `TEST-REPORT.md`.
4. **DNS: never done by me.**

---

## H. What I need from you

| # | Item | Needed by |
|---|---|---|
| H.1 | **Staging Supabase project** (its project ID goes in `targets.json`, which is not secret). Then, in a git-ignored `server/.env.staging` that you fill in yourself, never in chat: the staging values from `server/.env.example`, plus `SUPABASE_ACCESS_TOKEN` (a **scoped** personal access token for the staging project) and `SUPABASE_DB_PASSWORD` | Stage 4 |
| H.2 | A private GitHub repository + a GitHub **`staging` environment** with the same secrets | Stage 7 (CI) |
| H.3 | Railway project with a `staging` environment; Vercel project linked to the repository | Stage 7 |
| H.4 | Resend API key (+ sending domain later), entered in the dashboards. Optionally an Anthropic API key; without it only the Restock Advisor is off. **No OAuth credentials of any kind** | Stage 4.3 / 5.9 / 5.10 |
| H.5 | Base44 export + report PDFs or links + the `restock_advisor` config, if obtainable | Stage 8 / T19 |
| H.6 | The production Supabase project ID (for `targets.json`) | Stage 11 |

---

## I. Risks

| # | Risk | Mitigation |
|---|---|---|
| K1 | Money arithmetic in ~37 frontend files | `money.js` swap; T20 compares figures; the server is authoritative |
| K2 | Float residue in historical Base44 totals | Preflight reports each case; nothing is silently rounded |
| K3 | A half-cent rounding difference against old receipts | New sales only; documented |
| K4 | Store header comes from the closing device's `localStorage` | Display text only, escaped |
| K5 | jsPDF 4 under Node not yet verified | Checked in 5.6; I stop and report if it fails |
| K6 | An admin-chosen temporary password is known to the admin until it's changed | It's forced to change at first login (S15 gate); the API refuses everything else until then; T33 |
| K7 | The model check needs your key | Boot check + T18 on staging |
| K8 | Old report PDFs may be unretrievable | Listed, never invented |
| K9 | Changing the display currency from the hard-coded `$` touches every money label | Done in the same pass as K1 (6.5); USD by default, so nothing changes unless you set it |

## J. Limitations introduced by removing local Docker testing

| # | Limitation | Consequence | Mitigation |
|---|---|---|---|
| L1 | No offline development | Server integration work needs the staging project online. Free-plan projects pause after inactivity | Unit-testable parts (Stages 1–3) proceed without it; un-pause staging or use a paid plan |
| L2 | **Staging is shared** by automated tests, me and you | Test rows can briefly appear in staging screens | `t_<runid>_` prefix, cleanup and sweep; serialized CI; destructive suites paused during T19/T20 |
| L3 | No captured inbox (Mailpit) | Automated tests prove the auth links, not that the mail arrives | `generateLink` in CI + one real delivery each for password reset and report (manual, your approval). Resend without a verified domain can only send to your own account email, and free-plan daily limits apply |
| L4 | `supabase start`, `db diff`, `db pull` and `test db` (pgTAP) need Docker | No auto-generated migrations or pgTAP suite | Hand-written, reviewed migrations; database checks in the Node suite; advisors via `--linked` or the dashboard |
| L5 | No throwaway database | A bad migration on staging needs a forward fix or a guarded `db reset --linked` (staging only) | Migrations are reviewed before push; the guard refuses resets on production |
| L6 | The rollback test installs a trigger on shared staging | A short window where the trigger exists | It fires only on the run's `fail_` prefix, is dropped in `finally`, and the sweep removes leftovers |
| L7 | CI needs staging secrets in GitHub | One more place that holds staging secrets | A GitHub environment scoped to `staging` only; production secrets never go into GitHub |
| L8 | Network latency and service limits (Supabase auth email limits, Resend, Anthropic cost) | Slower tests; T18 costs a few cents | Prompt suite run once per release, not per commit |
| L9 | I can't read your inbox | The real-delivery parts of T14 and T16, and the dashboard part of T32, need you | Step-by-step instructions in `TEST-REPORT.md` |
| Optional | Supabase Branching (per-PR databases) would remove L2 and L5 but is a paid feature | — | Not planned unless you want it |
