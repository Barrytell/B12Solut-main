# B12 Store Solution — Final Implementation Checklist (Phase 3–7)

Status: **awaiting approval**. No application file has been changed.
Date: 2026-11-05 · Builds on [PHASE2-DESIGN.md](PHASE2-DESIGN.md). Decisions D1–D6 are approved; D7 (domain) is still open.

---

## A. Design amendments from this round

These add to, and where noted supersede, parts of PHASE2-DESIGN.md. The design doc is updated to match in step 1.4.

| # | Amendment | Replaces |
|---|---|---|
| A1 | **Shift report PDFs are kept and linked to their shift.** New column `shifts.report_path text` (schema change S13). `POST /api/shifts/:id/report` stores the path there. | §3.3, §7 |
| A2 | **Short-lived report links.** New `GET /api/shifts/:id/report-url` (admin or the shift's cashier) returns a signed URL that **expires after 10 minutes**, generated fresh on each request. Emails attach the PDF and link to the **app's Shifts page** (login required) instead of embedding a long-lived signed URL. | the 7-day signed URLs in §3.3, §7 |
| A3 | **Migrating old report PDFs.** The PDF file name has always been `shift-report-{shift_id}.pdf` (`shiftReport.js:342`), so each file maps back to its shift. Base44 may have renamed the files when storing them; if so, the shift is matched from the PDF's own contents (cashier and date), and anything still unclear is listed for you to decide. `scripts/migrate-reports.js` takes the files or URLs you can supply (a Base44 storage listing, or links copied from old report emails). It downloads each one, checks it is a PDF ≤ 10 MB, uploads it to the private `shift-reports/{shift_id}/migrated.pdf`, and sets `report_path`. Files that can't be retrieved are listed in its report, never invented. | §7 ("nothing to migrate") |
| A4 | **The only UI addition:** a "View report" button on the admin Shifts page (and on My Shift after closing), shown only when `report_path` is set. It calls A2. Without it, migrated PDFs could not be opened at all. | — |
| A5 | **D6 enforcement.** Cashiers can *read* `cost_price` (unchanged). They have **no write path** to products, prices, costs or stock: the generic routes return 403, and every price and cost is recomputed on the server. | §3.1 |
| A6 | **Original files are preserved (requirement 8)**, see section B. Case-sensitivity is fixed by **editing the import lines**, not by renaming files. | §1.4 (renames) |

---

## B. How "do not delete or overwrite original files" is applied

Replacing Base44 means editing files, so the originals are protected like this:

1. **Before any change:**
   - A full zip snapshot `B12bizzsolu-original-2026-11-05.zip` (excluding `node_modules` and `graphify-out`), saved **next to** the project folder.
   - A SHA-256 of the zip, written into the checklist log.
2. `git init` and a **baseline commit of the untouched files on `main`**, tagged `original-base44`. `main` is never modified afterwards.
3. All work happens on branch **`migration/supabase`**. Files there *are* edited (the Base44 code has to change), but the original of every file can always be recovered from the tag and the zip.
4. **Files that are no longer used** (`OAuthConsent.jsx`, `app-params.js`, `UserNotRegisteredError` stays) are removed **on the branch only** once their replacements are verified (Phase 6). They stay in the baseline and the zip.
   - → If you'd rather keep them in the branch too, I'll move them to `legacy/base44/` outside `src/` instead. Please say which you want.

---

## C. Implementation checklist

Each item has a "done when" check. Nothing is ticked until its check has been run and the output recorded.

### Phase 3.0 — Safety and tooling

- [ ] 0.1 Create the zip snapshot + SHA-256 (B.1).
- [ ] 0.2 `git init`, baseline commit, tag `original-base44`, branch `migration/supabase` (B.2–3).
- [ ] 0.3 Tooling: Supabase CLI as a `server` dev dependency (`npx supabase`), Docker Desktop running for local Supabase. *Today Docker is installed but its engine isn't running, and there is no Supabase CLI or `gh`.*
- [ ] 0.4 `npm ci` and record the current lint/build output as the "before" state.

### Phase 3.1 — Build blockers

- [ ] 1.1 `src/api/base44Client.js` missing. *Fixed by 7.1 (the new `src/api/client.js`).*
- [ ] 1.2 Import fixes:
  - `@/components/pos/SaleTerminal` → `SaleTerninal` (2 files)
  - `@/components/pos/Cart` → `cart`
  - `@/pages/pos/WholesaleSale` → `wholesaleSale`
- [ ] 1.3 Add an ESLint check that fails when an import's letter case doesn't match the file. *Done when:* the build passes on Linux (Docker `node:22` container).
- [ ] 1.4 Update PHASE2-DESIGN.md with amendments A1–A6.

### Phase 3.2 — Database (local Supabase first)

- [ ] 2.1 `0001_schema.sql`: the 10 tables + S1–S10, S12, **S13 `shifts.report_path`**.
- [ ] 2.2 `0002_security.sql`: RLS on for all 10 tables, no policies, `REVOKE ALL` from `anon` and `authenticated` (S11).
- [ ] 2.3 `0003_storage.sql`: `product-images` (public read, no client writes), `shift-reports` (private, no client access).
- [ ] 2.4 `supabase db advisors` shows no security warnings.
- [ ] 2.5 Update `docs/schema/schema.sql` + README so they document the final schema.

### Phase 3.3 — Backend foundation (`server/`)

- [ ] 3.1 Express app: `helmet`, CORS allow-list, 100 kB JSON limit, `trust proxy`, `pino-http` with request ids, central error handler (no stack traces in production).
- [ ] 3.2 `PORT` from the environment, bound to `0.0.0.0`. `GET /health` checks the database.
- [ ] 3.3 `pg` pool on the session pooler, with the NUMERIC → number parser, and a `withTransaction()` helper that always ROLLBACKs on any thrown error.
- [ ] 3.4 `requireAuth` (`getClaims` + `app_users` lookup → 403 `USER_NOT_REGISTERED`) and `requireAdmin`.
- [ ] 3.5 Rate limits: general, AI, report, invite.

### Phase 3.4 — API

- [ ] 4.1 Generic entity routes with the whitelist, limits and the permission matrix (§3.1 + A5).
- [ ] 4.2 `PATCH /Product` writes the stock change and its `stock_adjustments` row in one transaction (D3).
- [ ] 4.3 `POST /api/sales`: locks, stock check → 409 (D4), prices from the database, idempotency, relative shift totals, low-stock alerts after commit.
- [ ] 4.4 `POST /api/returns`: admin only (D2), atomic, restock + audit rows.
- [ ] 4.5 `POST /api/inventory/update` and `/bulk-stock`: atomic, reason required, audit rows (D3).
- [ ] 4.6 `POST /api/shifts/start`, `/:id/close`, `/:id/report` (A1), `GET /:id/report-url` (A2).
- [ ] 4.7 `GET /api/auth/me`, `POST /api/users/invite`, `/:id/resend-invite` (D1). Admins can't demote themselves.
- [ ] 4.8 `POST /api/uploads/product-image`: type checked by magic bytes, ≤ 5 MB.
- [ ] 4.9 Resend email module; templates moved from `shiftReport.js` and `stockAlerts.js` with every value HTML-escaped.
- [ ] 4.10 `POST /api/restock-advisor/chat`: Anthropic SDK, read-only tools, model from the environment (default `claude-opus-5-5`), refusal fallback, limitation note in the code and docs.

### Phase 3.5 — Frontend (same UI, same routes)

- [ ] 7.1 `src/lib/supabase.js` (publishable key) and `src/api/client.js` (same `entities.X.*` shape, bearer token, errors carry `message` + `status`).
- [ ] 7.2 `AuthContext` on supabase-js, keeping the same context shape. `AppLayout`, `Sidebar` and `PageNotFound` use it.
- [ ] 7.3 Login, Forgot, Reset / Set-password pages. Google button. Microsoft, Facebook and Apple hidden unless listed in `VITE_AUTH_PROVIDERS` (D5).
- [ ] 7.4 `CreateUserForm` becomes the invite form plus resend (D1); the rest of `UserManagement` is unchanged.
- [ ] 7.5 Mechanical `base44.` → `api.` swap in the read-only call sites (about 22 files).
- [ ] 7.6 Logic call sites: SaleTerminal (→ `/sales`, shows the 409 stock message), ReturnModal/`returns.js` (→ `/returns`), InventoryManager (→ `/inventory/*`), MyShift/ShiftCloseModal/`shiftReport.js` (→ close + report; PDF still generated in the browser), `stockAlerts.js` (client-side email removed; toast reads `low_stock_alerts`), RestockAdvisor (→ `/restock-advisor/chat`).
- [ ] 7.7 "View report" button (A4).
- [ ] 7.8 `vite.config.js` without the Base44 plugin, local favicon, `vercel.json` SPA rewrite.

### Phase 3.6 — Migration scripts (all with `--dry-run`, all refuse to run against a database not named in `--target`)

- [ ] 8.1 `import-base44.js`: preflight report → single-transaction import → reconciliation of counts and money totals.
- [ ] 8.2 `migrate-images.js`: Base44-hosted `image_url` → `product-images`; other URLs left alone.
- [ ] 8.3 `migrate-reports.js` (A3).
- [ ] 8.4 `invite-users.js`: invites imported users and links `auth_user_id`. It sends real emails, so it only runs on your go-ahead.

### Phase 4 — Deployment configuration

- [ ] 9.1 `vercel.json`, `server/railway.json`, `engines.node >= 22`.
- [ ] 9.2 `.env.example` (frontend) and `server/.env.example`, placeholders only. `.gitignore` re-checked.
- [ ] 9.3 README: setup, deployment (Vercel, Railway, Supabase), DNS/domain, environment variable checklist.
- [ ] 9.4 `docs/API.md`: every endpoint with its body, response, errors and role.

---

## D. Test plan (Phase 5)

There are three levels: **L** = local Supabase (Docker, automated), **S** = staging Supabase + Railway + Vercel preview, **M** = manual by you, where real Google accounts or inboxes are needed.

| # | Test | Level | Pass criteria |
|---|---|---|---|
| T1 | Production build | L | `npm run build` + `npm run lint` pass in a Linux `node:22` container |
| T2 | Every API endpoint × {no token, cashier, admin, user with no app_users row} | L | Matches the permission matrix exactly; the cashier forced-scope cases return only the caller's own rows |
| T3 | **RLS / Data API lockdown:** every table and both buckets via `/rest/v1` and `/storage/v1`, using the publishable key, as anonymous and as a signed-in user | L+S | No rows readable, no writes accepted, private bucket objects not downloadable |
| T4 | `supabase db advisors` | L+S | No security findings |
| T5 | **Concurrent sales:** 20 parallel sales of 1 unit against stock 5, across 2 cashiers | L+S | Exactly 5 succeed and 15 return 409; stock = 0; never negative; shift totals equal the sum of successful sales; 5 transaction rows |
| T6 | Concurrent mixed operations: sales + bulk stock + return on the same products | L | Final stock equals the arithmetic expectation; one audit row per change; no deadlock errors |
| T7 | **Rollback (all 5 atomic operations):** a test-only database trigger raises an error at the *last* write step (shift update for sales; stock_adjustments insert for returns, inventory and product PATCH; shift update for close) | L | After each failure, **zero** new rows in any table and stock and shift values identical to before; the API returns 500 with no internals |
| T8 | Idempotency: the same `client_request_id` sent twice | L | One transaction, stock decremented once |
| T9 | Pricing integrity: the client sends a tampered `unit_price` or `cost_price` | L | Ignored; the database prices are used |
| T10 | **Uninvited users can't register:** `signUp` with the publishable key | L+S | Rejected ("signups not allowed") |
| T11 | Uninvited Google account | M (on S) | Sign-in refused; no `auth.users` row created |
| T12 | **Invite flow:** admin invites → email → set password → login → correct role | L (Mailpit) + M (on S, your inbox) | Logs in with the right role; the invite link can't be reused |
| T13 | Invited user signs in with Google using the same email | M (on S) | Lands on the same account and role |
| T14 | Password reset end to end; an expired or reused link is refused | L + M | Works; the old password stops working |
| T15 | Demoting an admin to cashier takes effect | L | Next request returns 403 on admin routes |
| T16 | Reports: close shift → PDF stored → email to admins only → `report-url` expires after 10 min → a cashier can't fetch another cashier's report | L+S | All hold; Resend test mode on L, real send on S to an address you choose |
| T17 | Product image upload: valid image / renamed `.exe` / > 5 MB | L | 201 / 400 / 413 |
| T18 | Restock Advisor: the 5 suggested prompts answer using real inventory data; a cashier is refused | S | Responses reference actual products; 403 for cashiers. Needs your Anthropic key on staging |
| T19 | Import dry-run + import + reconciliation on a sample of your export | S | Counts and money totals match exactly |
| T20 | **Feature parity walk-through:** every route and flow in section E, on desktop, tablet (768 px) and mobile (375 px) | S | Each item ticked with a screenshot |

---

## E. Feature parity checklist (requirement 10)

Each item is checked on staging with real (imported) data.

**Auth:**
- Login (email + Google)
- Forgot / reset password
- Invite + set password
- `/register` notice page
- Logout
- Unauthenticated → `/login`
- Non-admin on `/admin/*` → `/pos`
- 404 page

**POS:**
- `/pos` sale type chooser
- `/pos/retail`:
  - Start shift
  - Product search and category filter
  - Barcode scanner
  - Cart quantity limits
  - Discount
  - Cash / card / electronic payment with change
  - Receipt modal
  - Thermal receipt print
  - Sale invoice PDF
  - Store / printer settings (localStorage)
  - Low-stock toast
- `/pos/wholesale`:
  - Wholesale pricing rule
  - Customer name
  - WS- numbers
  - Invoice
- `/pos/history` (own sales only)
- `/pos/shift`:
  - Live totals
  - Close with declared cash
  - Variance
  - PDF download
  - Email to admins
  - View report

**Admin:**
- Dashboard:
  - Daily performance
  - Sales trend chart
  - Recent transactions
  - Transaction summary and sale type filter
  - Low-stock alerts and banner
  - Process return
- Products CRUD + image upload / URL
- Inventory manager:
  - Inline edits with reason
  - Bulk set / add / subtract
  - Stock adjustment log
- Categories:
  - Add
  - Delete blocked while in use
- Suppliers CRUD
- Purchase orders grouped by supplier + PDF
- Transactions list and filters
- Shifts list + View report
- Margins by period
- Demand forecast + apply threshold (single and bulk)
- Wholesale dashboard:
  - Filters
  - Analytics report
  - Inventory turnover
  - Payment mix
  - Top customers
  - Product table
  - CSV export
- Users list + invite
- Restock Advisor chat with tool-call display

---

## F. Requirement traceability

| Requirement | Where it is covered |
|---|---|
| D1 Invite, users set their own password | 4.7, 7.4, T12 |
| D2 Admin-only returns | 4.4, T2 |
| D3 Every stock change audited | 4.2, 4.4, 4.5, T6, T7 |
| D4 Refuse sales when stock is short, never clamp | 4.3, 7.6, T5 |
| D5 Google only; others hidden | 7.3, T11, T13 |
| D6 Cost visible to cashiers, no cashier writes | A5, 4.1, T2, T9 |
| 1 Migrate existing report PDFs | A1, A3, 8.3 (limited to the files you can supply) |
| 2 Secure, time-limited report links | A2, A4, T16 |
| 3 Test invites + Google on staging | T12, T13 (needs you for real inbox and Google accounts) |
| 4 Uninvited users can't register | Signups disabled (§4 of the design), T10, T11 |
| 5 Verify backend authorization + RLS | T2, T3, T4, T15 |
| 6 Concurrent sales and stock | T5, T6, T8 |
| 7 Full rollback on failure | 3.3, T7 |
| 8 Don't delete or overwrite the originals | Section B, A6 |
| 9 No production data until staging passes | Gate G below |
| 10 Preserve every feature | Section E, T20 |
| Earlier phases: Vercel/Railway config, .env.example, README, API docs, migration scripts, Base44 removal audit | 9.1–9.4, 8.x, Phase 6 grep (`base44`, `@base44/sdk`, `VITE_BASE44`, `/api/apps/`) |

---

## G. Gates (I stop and ask you at each one)

1. **Before Phase 3 starts:** this checklist, plus your answer on B.4.
2. **Before anything touches staging:** you create the staging Supabase project and Railway/Vercel projects and enter their secrets in the dashboards. I don't need to see any secret values.
3. **Before `invite-users.js` or any real email** on staging.
4. **Before production:** all of T1–T20 pass on staging, and you sign off on the test report. Only then are production migrations, the data import, DNS and invites done, each with your explicit approval.

## H. What I still need from you (none of it needed to start Phase 3 locally)

| Item | Needed by |
|---|---|
| Your domain (D7) | Phase 4 config and DNS docs |
| Docker Desktop running on this machine | Phase 3.2 (local Supabase) |
| Base44 data export (JSON/CSV) + any shift report PDFs or their links + the `restock_advisor` config, if obtainable | T19 / A3 / 4.10 |
| Staging: Supabase project, Railway project, Vercel project, Google OAuth client, Resend domain + key, Anthropic key, all entered in the dashboards | Gate 2 |
| A GitHub repository (private) | Before the first push |
