# B12 Store Solution — Implementation Checklist (Phase 3–7)

Status: **round 4: cloud-only.** Cloud implementation and staging preparation are authorized; production stays behind the gates in section G.
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
| A10 | **Uninvited Google accounts**: sign-ups off, plus matching only on `auth_user_id`; Before User Created hook as fallback | 3 |
| A11 | **Model verified** with the Models API at startup; `ANTHROPIC_MODEL` configurable; default `claude-opus-5-5` | 3 |
| A12 | **Storage**: product images publicly viewable with no client writes; shift reports private, backend only | 3 |
| A13 | **Git hygiene**: extended `.gitignore` + secret scan as a pre-commit hook and before the first push | 3 |
| A14 | **Cloud-only.** A hosted staging Supabase project, a Railway `staging` environment and Vercel previews. Automated tests run in GitHub Actions (or from this machine) against **staging only**. No Docker, no local Supabase | 4 |
| A15 | **`server/` holds everything server-side**: the Express API, tests, migration scripts and Supabase migrations (`server/supabase`). The original has no server code, so nothing existing moves | 4 |
| A16 | **Complete environment templates**: `/.env.example` (public `VITE_` only) and `server/.env.example`, plus the README reference with staging and production instructions. The server refuses to boot on a missing or `YOUR_…` value. The build refuses any secret-looking `VITE_` variable | 4 |
| A17 | **One configurable currency** (`CURRENCY` = `VITE_CURRENCY`). Minor units follow ISO 4217; 0- and 2-digit currencies are supported, 3-digit ones are refused at boot | 4 |
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
- [ ] 4.3 Auth settings on staging, done by you from README §Supabase: sign-ups off, Google, Site/Redirect URLs, Resend SMTP. *Done when:* T10 passes.
- [ ] 4.4 Update `docs/schema/schema.sql` and the README tables section to the final schema.

### Stage 5 — API (integration tests against staging)

*Stage 5 status (2026-11-06): **routes are written and unit-tested; nothing is ticked yet.** An item is ticked only after its staging integration test passes.*
- *Unit tests: 47 server tests (permission matrix, validation, injection guards, pricing, returns, report figures, PDF rendering in Node, email escaping, upload sniffing) plus 5 script tests.*
- *Not yet run against a real database: locking, rollback, concurrency, idempotency races, Supabase Auth (invite, `getClaims`), Storage, Resend, Anthropic.*

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
- *Resending an invite to someone who already has an unconfirmed Supabase account may be refused by Supabase. This is verified in T12.*

- [ ] 5.1 Generic entity routes + permission matrix (A5).
- [ ] 5.2 `PATCH /Product`: stock change and audit row in one transaction (D3).
- [ ] 5.3 `POST /api/sales`: locks, 409 on insufficient stock (D4), database prices, integer cents, idempotency, relative shift totals, low-stock alerts.
- [ ] 5.4 `POST /api/returns`: admin only (D2), atomic, cents, audit rows.
- [ ] 5.5 `POST /api/inventory/update` and `/bulk-stock`: atomic, reason required, audit rows.
- [ ] 5.6 Shifts: `start`; `close` (stores `declared_cash`); `report` (server PDF via jsPDF in Node, stored, emailed); `report-url` (10 min).
- [ ] 5.7 Users: `auth/me`, `users/invite`, `resend-invite`. The invite sets `auth_user_id`; admins can't demote themselves.
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
  - *only the Google button shows (D5);*
  - *an invalid invite link shows the "invalid invitation" screen;*
  - *`/register` explains the invite flow.*
- ***Not yet verified with a backend:** every data screen, sign-in, invites, sales, returns, inventory and reports. That happens on staging (T20).*

*Changes made beyond a straight swap:*
- *Close shift: the server closes the shift first. If that fails the shift stays open and the error shows. Then the server builds and emails the report, and "Download PDF" fetches a fresh 10-minute link.*
  - *My Shift now keeps the closed shift on screen until "Done". Before, the confirmation and download screen disappeared at once.*
  - *My Shift offers "View last shift report".*
- *The browser "Preview PDF before sending" button is kept. It's a preview only, never stored or emailed.*
- *`stockAlerts.js` is removed: low-stock emails are sent by the server after each sale. The client-side upload and email code in `shiftReport.js` is removed too.*
- *The user form invites by email (name, email, role). The starting-password and one-time-code steps are gone (D1). Users now have "Resend invite".*
- *Product form: category defaults to "No category" instead of `'other'`.*
- *Product images: PNG, JPEG, WebP and GIF, at most 5 MB, checked in the browser and again on the server.*
- *Inventory and bulk-stock saves now show an error toast on failure; before, a failed save gave no message.*
- *The Vite config sets the `@` alias itself (the Base44 plugin did that before). There is a local favicon, and `vercel.json` adds the SPA rewrite and security headers.*
- *Money in the browser:*
  - *Cart pricing, return previews, the shift-close variance and every dashboard, margin, wholesale and purchase-order total use exact cents (`src/lib/money.js`).*
  - *Ratios (margin %, share, turnover) and demand-forecast statistics stay plain division; they aren't money amounts.*
- ***Open:** the `$` symbol is still hard-coded in labels (K9). It's correct for USD, the default, and gets switched to `formatMoney` if you set another currency.*

- [ ] 6.1 `src/lib/supabase.js`, `src/api/client.js` (same `entities.X.*` shape).
- [ ] 6.2 `AuthContext` on supabase-js; auth pages; Google only (D5); the invite form (D1).
- [ ] 6.3 Mechanical `base44.` → `api.` swap (about 22 files).
- [ ] 6.4 Logic call sites: sales, returns, inventory, shift close/report/download via `report-url`, alerts, advisor.
- [ ] 6.5 `src/lib/money.js` in the ~37 money files; `formatMoney` uses `VITE_CURRENCY` (A7, A17).
- [ ] 6.6 "View report" button (A4).
- [ ] 6.7 `vite.config.js` without Base44, a local favicon, `vercel.json` SPA rewrite.

### Stage 7 — Staging deployment + CI (authorized; staging only)

- [ ] 7.1 `.github/workflows/ci.yml`:
  - lint, `check-public-env`, build;
  - server unit tests;
  - integration tests against staging, using the GitHub `staging` environment secrets;
  - `concurrency: staging-db` so only one run touches staging at a time.
- [ ] 7.2 Railway `staging` environment: `server/railway.json`, root `server`, health check `/health`. You enter the variables.
- [ ] 7.3 Vercel project: previews for pull requests and a staging alias. The alias host should contain `staging` (e.g. `b12-staging.vercel.app`) so I may run the browser walkthrough on it. You enter the variables.
- [ ] 7.4 Staging smoke test (T24).

### Stage 8 — Migration scripts (staging rehearsal)

- [ ] 8.1 `import-base44.js`: preflight (orphans, >2-dp money, totals ≠ lines), single-transaction import, exact reconciliation.
- [ ] 8.2 `migrate-images.js`, `migrate-reports.js`.
- [ ] 8.3 `invite-users.js`: dry-run only, until you approve real invites.

### Stage 9 — Cloud test campaign (section D) and handover docs

- [ ] 9.1 Run T1–T26 as defined in section D; record each result with its output in `docs/migration/TEST-REPORT.md`.
- [ ] 9.2 Handover docs, in `docs/deploy/`:
  - Supabase setup, Railway, Vercel, Google OAuth, Resend, Anthropic;
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
- [ ] 11.4 Images and reports migration, then real invites.
- [ ] 11.5 You add the domain in Vercel; then the README "After adding your domain" updates; then T26 read-only smoke.

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
| T11 | **Uninvited Google account (actual Supabase behaviour)** | M (you, on staging) | Sign-in refused and no new `auth.users` row in the dashboard. If a row appears: every API route returns 403, I add the Before User Created hook, and T11 is re-run. **Production is blocked until it passes** |
| T12 | **Invitation:** admin invites → link → set password → login → role | CI + M | CI: `auth.admin.generateLink({type:'invite'})` gives the link without sending mail; following it, setting the password, logging in and the role are checked; a reused link is refused. M: one real invite email delivered to an address you choose (your approval) |
| T13 | An invited user signs in with Google using the same email | M (you, on staging) | Same account and role |
| T14 | **Password reset** | CI + M | CI: `generateLink({type:'recovery'})` → new password works, the old one fails, a reused link is refused. M: one real reset email delivered |
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
| T26 | **Production smoke, read-only**, after an approved cutover | P | `/health`, login, one read per role. No writes, no test data |

**Tests that can't be reproduced the old (local) way, and what replaces them:**
- **Mailpit inbox capture** → `generateLink` in CI (T12, T14) plus one real delivery each, done by you.
- **Disposable local database reset between runs** → run prefixes + cleanup + sweep, serialized CI, and an optional guarded `db reset --linked` on staging only.
- **Offline rollback trigger** → a prefix-scoped fixture trigger on staging (T7).
- **Google OAuth** was never automatable (real Google accounts are needed) → it stays manual (T11, T13).

---

## E. Feature parity checklist (requirement 10)

Each item is checked on staging (T20).

**Auth:**
- Login (email + Google)
- Forgot / reset password
- Invite + set password
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
- Users + invite
- Restock Advisor with tool-call display

**Responsive:**
- Desktop, tablet (768 px) and mobile (375 px) for every route above

---

## F. Requirement traceability

| Requirement | Covered by |
|---|---|
| D1 Invites, users set their own password | 5.7, 6.2, T12 |
| D2 Admin-only returns | 5.4, T2 |
| D3 Every stock change audited | 5.2, 5.4, 5.5, T6, T7 |
| D4 Refuse short-stock sales, never clamp | 5.3, T5 |
| D5 Google only | 6.2, T11, T13 |
| D6 Cost visible to cashiers, no cashier writes | A5, 5.1, T2, T9 |
| R1–R10 (round 2) | A1–A6, section B, T2–T20, gates |
| C1 Public images, private reports | A12, 3.3, T3 |
| C2 Integer money, per currency | A7, A17, 2.3, 5.3, 5.4, 6.5, 8.1, T21 |
| C3 Server-generated official PDF | A8, 5.6, T16 |
| C4 Migration target guard | A9, 2.4, T22 |
| C5 Git secrets | A13, 0.4, 10.3, T23 |
| C6 Uninvited Google verified on staging | A10, T11 |
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
2. Any real email: invites, reset tests to real inboxes, report emails to real admins.
3. **Production:**
   - database changes;
   - data import;
   - deployment or cutover;
   - real invitations or bulk emails.
   - All of these come only after T1–T25 pass on staging and you sign off on `TEST-REPORT.md`.
4. **DNS: never done by me.**

---

## H. What I need from you

| # | Item | Needed by |
|---|---|---|
| H.1 | **Staging Supabase project** (its project ID goes in `targets.json`, which is not secret). Then, in a git-ignored `server/.env.staging` that you fill in yourself, never in chat: the staging values from `server/.env.example`, plus `SUPABASE_ACCESS_TOKEN` (a **scoped** personal access token for the staging project) and `SUPABASE_DB_PASSWORD` | Stage 4 |
| H.2 | A private GitHub repository + a GitHub **`staging` environment** with the same secrets | Stage 7 (CI) |
| H.3 | Railway project with a `staging` environment; Vercel project linked to the repository | Stage 7 |
| H.4 | Google OAuth client for staging; Resend API key (+ sending domain later); Anthropic API key, all in the dashboards | Stage 4.3 / 5.9 / 5.10 |
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
| K6 | Supabase may let uninvited Google users create an auth row | Matching on `auth_user_id` only; T11; the hook as fallback |
| K7 | The model check needs your key | Boot check + T18 on staging |
| K8 | Old report PDFs may be unretrievable | Listed, never invented |
| K9 | Changing the display currency from the hard-coded `$` touches every money label | Done in the same pass as K1 (6.5); USD by default, so nothing changes unless you set it |

## J. Limitations introduced by removing local Docker testing

| # | Limitation | Consequence | Mitigation |
|---|---|---|---|
| L1 | No offline development | Server integration work needs the staging project online. Free-plan projects pause after inactivity | Unit-testable parts (Stages 1–3) proceed without it; un-pause staging or use a paid plan |
| L2 | **Staging is shared** by automated tests, me and you | Test rows can briefly appear in staging screens | `t_<runid>_` prefix, cleanup and sweep; serialized CI; destructive suites paused during T19/T20 |
| L3 | No captured inbox (Mailpit) | Automated tests prove the auth links, not that the mail arrives | `generateLink` in CI + one real delivery each for invite, reset and report (manual, your approval). Resend without a verified domain can only send to your own account email, and free-plan daily limits apply |
| L4 | `supabase start`, `db diff`, `db pull` and `test db` (pgTAP) need Docker | No auto-generated migrations or pgTAP suite | Hand-written, reviewed migrations; database checks in the Node suite; advisors via `--linked` or the dashboard |
| L5 | No throwaway database | A bad migration on staging needs a forward fix or a guarded `db reset --linked` (staging only) | Migrations are reviewed before push; the guard refuses resets on production |
| L6 | The rollback test installs a trigger on shared staging | A short window where the trigger exists | It fires only on the run's `fail_` prefix, is dropped in `finally`, and the sweep removes leftovers |
| L7 | CI needs staging secrets in GitHub | One more place that holds staging secrets | A GitHub environment scoped to `staging` only; production secrets never go into GitHub |
| L8 | Network latency and service limits (Supabase auth email limits, Resend, Anthropic cost) | Slower tests; T18 costs a few cents | Prompt suite run once per release, not per commit |
| L9 | I can't sign in with Google or read your inbox | T11, T13 and the real-delivery parts of T12, T14 and T16 need you | Step-by-step instructions in `TEST-REPORT.md` |
| Optional | Supabase Branching (per-PR databases) would remove L2 and L5 but is a paid feature | — | Not planned unless you want it |
