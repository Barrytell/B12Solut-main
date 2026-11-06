# B12 Store Solution — Phase 2 Migration Design

Status: **design only — awaiting approval before Phase 3**. No application file has been changed.
Round 3 corrections (2026-11-05), marked "correction, round 3" in the text:
- money precision (§3, §3.4);
- server-generated shift reports (§3.3, S13–S14);
- account access only through `app_users` (§4);
- the model check (§3.9);
- migration target protection (§6);
- storage access (§7);
- git secret exclusions (§8);
- deleting obsolete files (§11.10).

Round 4 (2026-11-05): **cloud-only development, with no Docker and no local Supabase.**
- All testing runs on a dedicated hosted **staging** Supabase project, Railway `staging` environment and Vercel previews, with CI on GitHub Actions (§11).
- Everything server-side lives in `server/` (§2).
- The full environment variable reference is in the README.
- One configurable currency (§11).
- The domain is not blocking: Railway/Vercel generated URLs until you add the domain in Vercel, and **I make no DNS changes** (§9).
Round 5 (2026-11-06):
- **Email-and-password authentication only.** All social login (Google, Apple, Facebook, Microsoft and any other OAuth provider) is removed from the plan, not deferred.
- Admins create accounts with an initial password, and users must change it at first login (D1, D5, §3.2, §4, S15).
- **The Anthropic API is an optional integration.** Without a key, only the Restock Advisor is off (§3.9).
Date: 2026-11-05

Target: React 18 + Vite on **Vercel** · Node 22 + Express on **Railway** · **Supabase** Postgres, Auth (email and password) and Storage · **Resend** email · **Anthropic** API (optional, Restock Advisor only).

---

## 0. Decisions that need your confirmation

The design below takes the recommended option for each item. Change any of them before Phase 3 starts.

| # | Decision | Recommended | Why / what changes |
|---|---|---|---|
| D1 | How admins create users | **Round 5: the admin creates the account** in User Management with full name, email, **initial password** and role (Admin or Cashier). The initial password is **temporary**: the user must change it at first login. | Replaces the earlier invite-email decision. The backend creates the account with the Supabase Auth Admin API (§3.2, §4). No public registration. |
| D2 | Who can process returns | **Admins only.** | The only route to `ReturnModal` today is the admin Dashboard. The refund price is editable, so restricting it to admins removes no feature. |
| D3 | Stock changed from the product form | **Write an audit row** (reason "Edited in product form"). | Today these edits leave no `StockAdjustment` row. The requirement is that every stock change is atomic and audited. |
| D4 | Sale when stock is short | **Reject with 409** and the available quantity. | Today the browser clamps stock to 0 and the sale still goes through, so a race can oversell silently. |
| D5 | Sign-in methods | **Round 5 (firm): email and password only.** No Google, Apple, Facebook, Microsoft or any other social/OAuth login. | All OAuth configuration, components, buttons, callback routes and variables are removed from the plan. Social login is not a future option. |
| D6 | Cashiers seeing `cost_price` | **Keep it visible**, as today. | Hiding it is optional hardening. The cart uses it today. |
| D7 | Domains | `app.<your-domain>` → Vercel, `api.<your-domain>` → Railway | Please send your actual domain. |

---

## 1. Audit addendum: every Base44 operation (complete)

I inspected every `base44.*` call, including all `list` and `filter` calls with their arguments. There are 34 importing files and **no aliased or dynamic access** (`base44.entities[...]` or destructuring do not occur). The only other Base44 touchpoints are `@base44/sdk/dist/utils/axios-client` in `AuthContext.jsx` and the `/api/apps/...` fetches in `OAuthConsent.jsx`.

**Every feature below depends on the missing `src/api/base44Client.js`.** All 33 importing files fail to build without it, so the app does not build today.

### 1.1 Entity reads

Notation: `list(sort, limit)` and `filter(query, sort, limit)`. The default limit Base44 applies when none is given is undocumented in the repo, so I have not assumed one.

| File:line | Call | Role | Replacement |
|---|---|---|---|
| ProductFormModal.jsx:15 | `Supplier.list()` | admin | `GET /api/entities/Supplier` |
| ProductFormModal.jsx:20 | `Category.list('name')` | admin | `GET /api/entities/Category?sort=name` |
| StockAdjustmentLog.jsx:11 | `StockAdjustment.list('-created_date', limit)` | admin | `GET /api/entities/StockAdjustment?sort=-created_date&limit=N` |
| ProductSearch.jsx:19 | `Category.list('name')` | any | `GET /api/entities/Category?sort=name` |
| SaleTerninal.jsx:34 | `Product.filter({is_active:true})` | any | `GET /api/entities/Product?is_active=true` |
| SaleTerninal.jsx:63 | `Shift.filter({cashier_email, status:'open'})` | any (own) | `GET /api/entities/Shift?status=open` (server forces own email for non-admins) |
| Categories.jsx:18 | `Category.list('name')` | admin | as above |
| Categories.jsx:23 | `Product.list()` | admin | `GET /api/entities/Product` |
| Dashboard.jsx:21 | `Transaction.list('-created_date', 500)` | admin | `GET /api/entities/Transaction?sort=-created_date&limit=500` |
| Dashboard.jsx:26 | `Product.list()` | admin | `GET /api/entities/Product` |
| Dashboard.jsx:31 | `Shift.list('-created_date', 20)` | admin | `GET /api/entities/Shift?sort=-created_date&limit=20` |
| Dashboard.jsx:36 | `Return.list('-created_date', 200)` | admin | `GET /api/entities/Return?sort=-created_date&limit=200` |
| DemandForecast.jsx:29 / :34 | `Transaction.list('-created_date', 500)`, `Product.list()` | admin | as above |
| InventoryManager.jsx:34 / :39 | `Product.list('-created_date')`, `Category.list('name')` | admin | as above |
| Margins.jsx:25 / :30 | `Product.list()`, `Transaction.list('-created_date', 500)` | admin | as above |
| Products.jsx:20 | `Product.list('-created_date')` | admin | as above |
| PurchaseOrders.jsx:16 / :21 | `Product.list()`, `Supplier.list()` | admin | as above |
| Shifts.jsx:11 | `Shift.list('-created_date', 50)` | admin | as above |
| Suppliers.jsx:19 | `Supplier.list('-created_date')` | admin | as above |
| Transactions.jsx:26 | `Transaction.list('-created_date', 200)` | admin | as above |
| UserManagement.jsx:16 | `User.list()` | admin | `GET /api/entities/User` |
| WholesaleDashboard.jsx:35 | `Transaction.filter({sale_type:'wholesale'}, '-created_date', 500)` | admin | `GET /api/entities/Transaction?sale_type=wholesale&sort=-created_date&limit=500` |
| WholesaleDashboard.jsx:39 / :43 | `Product.list('-created_date')`, `Supplier.list('-created_date')` | admin | as above |
| MyShift.jsx:21 | `Shift.filter({cashier_email, status:'open'})` | any (own) | as SaleTerninal |
| SalesHistory.jsx:23 | `Transaction.filter({cashier_email}, '-created_date', 50)` | any (own) | `GET /api/entities/Transaction?sort=-created_date&limit=50` (own email forced) |
| returns.js:66 | `Product.get(id)` | admin | moves inside `POST /api/returns` |
| shiftReport.js:10 | `Transaction.filter({shift_id}, '-created_date')` | any (own) | `GET /api/entities/Transaction?shift_id=…&sort=-created_date` (own email forced) |
| shiftReport.js:16, stockAlerts.js:34, CreateUserForm.jsx:60 | `User.list()` to find admin emails or the new user | cashier/admin | **Removed from the browser.** The server looks up recipients itself. |

### 1.2 Entity writes

| File:line | Call | Replacement |
|---|---|---|
| CreateUserForm.jsx:65 | `User.update(id, {display_name, role})` | folded into `POST /api/users` (round 5) |
| SaleTerninal.jsx:72 | `Shift.create({...})` | `POST /api/shifts/start` |
| SaleTerninal.jsx:177, :183, :200 | `Transaction.create`, a `Product.update(stock)` loop, `Shift.update(totals)` | **one atomic** `POST /api/sales` |
| ReturnModal.jsx:86 + returns.js:72, :78 | `Return.create`, `Product.update(stock)`, `StockAdjustment.create` | **one atomic** `POST /api/returns` |
| Categories.jsx:38 / :57 | `Category.create({name})` / `Category.delete(id)` | `POST /api/entities/Category`, `DELETE /api/entities/Category/:id` |
| DemandForecast.jsx:53, :69 | `Product.update(id, {low_stock_threshold})` | `PATCH /api/entities/Product/:id` |
| InventoryManager.jsx:120 + :123 | per-product `Product.update` (stock and prices) + `StockAdjustment.bulkCreate` | **one atomic** `POST /api/inventory/update` |
| InventoryManager.jsx:169 + :172 | bulk set/add/subtract stock + `bulkCreate` | **one atomic** `POST /api/inventory/bulk-stock` |
| InventoryManager.jsx:218 / :221, Products.jsx:29 / :32 | `Product.update` / `Product.create` (form includes `stock_quantity`) | `PATCH` / `POST /api/entities/Product` (a stock change is logged atomically, see D3) |
| Products.jsx:43 | `Product.delete(id)` | `DELETE /api/entities/Product/:id` |
| Suppliers.jsx:31 / :34 / :44 | `Supplier.update` / `create` / `delete` | `PATCH` / `POST` / `DELETE /api/entities/Supplier` |
| MyShift.jsx:29 | `Shift.update(id, {status:'closed', end_time})` | `POST /api/shifts/:id/close` |

### 1.3 Auth, integrations, agents and platform calls

| File:line | Call | Replacement |
|---|---|---|
| AuthContext.jsx | public-settings fetch, `auth.me`, `logout`, `redirectToLogin`, `createAxiosClient` | supabase-js session + `GET /api/auth/me` (§4) |
| AppLayout.jsx:11, PageNotFound.jsx:14 | `auth.me()` | `useAuth().user` (same data, already loaded) |
| Sidebar.jsx:93 | `auth.logout()` | `useAuth().logout()` → `supabase.auth.signOut()` |
| Login.jsx:26 | `auth.loginViaEmailPassword` | `supabase.auth.signInWithPassword` |
| SocialAuthButtons.jsx:42 | `auth.loginWithProvider(key, returnTo)` | **Removed (round 5).** The component and its use on `/login` are deleted; email and password only. |
| ForgotPassword.jsx:19 | `auth.resetPasswordRequest(email)` | `supabase.auth.resetPasswordForEmail` |
| ResetPassword.jsx:28 | `auth.resetPassword({resetToken, newPassword})` | recovery session + `supabase.auth.updateUser({password})` |
| CreateUserForm.jsx | `auth.register`, `verifyOtp`, `resendOtp` | `POST /api/users` with full name, email, initial password and role (D1, round 5). There's no OTP step: the admin-created password is temporary. |
| OAuthConsent.jsx | `auth.isAuthenticated`, `/api/apps/{id}/mcp/*` | **Removed.** Base44-only MCP consent screen; no route uses it. |
| ProductImageField.jsx:23 | `integrations.Core.UploadPublicFile` | `POST /api/uploads/product-image` → `{file_url}` (same shape) |
| shiftReport.js:345, :448 | `UploadPublicFile(pdf)`, `SendEmail` per admin | `POST /api/shifts/:id/report`: the server generates the official PDF from database values, stores it and emails it (§3.3) |
| stockAlerts.js:117 | `SendEmail` per admin | Server-side, triggered inside `POST /api/sales` |
| RestockAdvisor.jsx:34, :42, :53 | `agents.createConversation`, `subscribeToConversation`, `addMessage` | `POST /api/restock-advisor/chat` (§3.9) |
| app-params.js, vite.config.js, index.html | `VITE_BASE44_*`, `@base44/vite-plugin`, base44.com favicon | Removed or replaced (§8) |

### 1.4 Build blockers on Linux (fixed first in Phase 3)

1. `src/api/base44Client.js` does not exist.
2. `@/components/pos/SaleTerminal` is imported from 2 files, but the file is `SaleTerninal.jsx`.
3. `@/components/pos/Cart` is imported, but the file is `cart.jsx`.
4. `@/pages/pos/WholesaleSale` is imported, but the file is `wholesaleSale.jsx`.

Fix: rename the files to match the imports (`SaleTerminal.jsx`, `Cart.jsx`, `WholesaleSale.jsx`). Nothing else changes.

---

## 2. Architecture

```
Browser (Vercel, static SPA)
  ├─ supabase-js (publishable key) ── Supabase Auth only: email/password login, reset, session refresh
  └─ fetch + Bearer access token ──▶ Express API (Railway)
                                        ├─ verifies JWT (Supabase signing keys / JWKS)
                                        ├─ loads app_users row → role
                                        ├─ pg pool (Supavisor session pooler) ──▶ Supabase Postgres
                                        ├─ supabase-js (secret key) ── Auth admin (create users, passwords), Storage
                                        ├─ Resend ── shift reports, low-stock alerts
                                        └─ Anthropic ── Restock Advisor
```

- **The browser never touches the database.** RLS is on for every table with no policies for `anon` or `authenticated`. The Data API therefore returns nothing even with a leaked publishable key. All authorization lives in one place: the Express API.
- **Repository layout** keeps the frontend where it is (smallest diff) and adds `server/`:

```
/                       Vite app (unchanged location) + vercel.json
/src/api/client.js      replaces base44Client.js — same entities.X.list/filter/get/create/update/delete shape
/src/lib/supabase.js    supabase-js browser client
/server                 Express API (own package.json; Railway root directory)
  src/index.js  src/db.js  src/auth.js  src/errors.js
  src/routes/{entities,sales,returns,inventory,shifts,users,uploads,advisor,health}.js
  src/email/{shiftReport,lowStock}.js     (templates moved from src/utils, values HTML-escaped)
  src/reports/shiftReportPdf.js           (official PDF, moved from src/utils/shiftReport.js)
  src/lib/money.js
  scripts/{import-base44,migrate-images,migrate-reports,create-accounts}.js  scripts/lib/target-guard.js  scripts/targets.json
  supabase/migrations/   0001_schema.sql  0002_security.sql  0003_storage.sql   (Supabase CLI: --workdir server)
  supabase/test-fixtures/  staging-only test helpers (never applied to production)
  test/
  .env.example
/.github/workflows/ci.yml   build + lint + server tests against the hosted staging project
/.env.example               frontend (public VITE_ values only)
```

**Round 4: everything server-side lives in `server/`.** The original project has **no server-side code** (Base44 hosted it), so nothing existing has to move. The Express API, its tests, the migration scripts and the Supabase migrations are all created inside `server/`. The frontend reaches it only through `VITE_API_URL`.

- **Frontend changes are mechanical** for about 22 files: `import { base44 } from '@/api/base44Client'` becomes `import { api } from '@/api/client'`, and `base44.` becomes `api.`. The call signatures stay the same. Only these files change logic: `SaleTerninal`, `ReturnModal`, `returns.js`, `InventoryManager`, `MyShift`, `ShiftCloseModal`, `shiftReport.js`, `stockAlerts.js`, `CreateUserForm`, `RestockAdvisor`, `AuthContext`, the 4 auth pages, `SocialAuthButtons`, `AppLayout`, `Sidebar` and `PageNotFound`. UI markup and styling are untouched.

---

## 3. API specification

**Base URL:** `VITE_API_URL`, which is the Railway service URL (`https://<service>-<env>.up.railway.app`) or, optionally, a custom API domain you add later. Every `/api/*` route requires `Authorization: Bearer <supabase access token>` unless marked public.

**Record format.** Records use the same field names as Base44: `id`, `created_date`, `updated_date`, `created_by_id`, plus the entity fields. `Transaction` and `Return` records include `items: [...]` with the original item keys. Money fields are returned as JSON numbers with at most 2 decimals (quantities at most 3), written from the exact decimal value. The pg NUMERIC parser is **not** overridden (see "Money precision" below).

**Money precision (correction, round 3).** No monetary value is ever computed with JavaScript floating point, on the server or in the browser.
- **Database:** money stays `numeric(12,2)` and quantities `numeric(12,3)`. `pg` returns NUMERIC as **strings** (default parser kept).
- **Server:** `server/src/lib/money.js` parses those strings straight into **integer minor units** (cents as `BigInt`; quantities as thousandths), without passing through a float. All sale, discount, tax, cost, profit, return, margin, shift-balance and variance arithmetic runs on these integers. The result is written back as an exact decimal string. Totals that can be done in SQL (`SUM`, relative shift updates) stay in `numeric`.
- **Rounding:** each line rounds once to 2 dp, half away from zero, the same as Postgres `ROUND(numeric, 2)`. Totals are sums of already-rounded lines, so a receipt always adds up.
- **Browser:** `src/lib/money.js` (`toCents`, `fromCents`, `sumMoney`, `mulMoney`, `formatMoney`) replaces the float sums and multiplications in the ~37 files that compute money today: dashboards, margins, wholesale analytics, cart previews, PDFs, CSV export. `toCents` reads the 2-dp value through its decimal string, never `x * 100` on an unrounded float. Browser figures are display only; the server values are authoritative.
- **Import:** the preflight reads exported money as text. Any value with more than 2 decimals (float residue such as `12.3400000001`), and any transaction whose stored totals don't equal the sum of its lines, is **reported, not silently fixed**. Reconciliation compares exact decimal sums.
- **Tests:** unit tests on `money.js` (e.g. `0.1 + 0.2`, 3-dp quantities, half-way rounding, 10¹⁰-scale totals), plus T21 in the checklist.

**Errors.** Errors return `{ "error": { "code": "STRING", "message": "Human text", "details": {...}? } }`.

| Status | Meaning |
|---|---|
| 400 | Validation (`details` lists the fields) |
| 401 | No token, or invalid token |
| 403 | `FORBIDDEN`, or `USER_NOT_REGISTERED` (no `app_users` row) |
| 404 | Not found |
| 409 | Conflict |
| 413 | Upload too large |
| 429 | Rate limited |
| 500 | Server error (no stack trace in production) |

The client shim throws an `Error` carrying `message` and `status`, so existing `err.message` toasts keep working.

### 3.1 Generic entity endpoints

| Method | Path | Notes |
|---|---|---|
| GET | `/api/entities/:Entity` | Returns a bare array. `sort` is `field` or `-field` (whitelisted; `id` is a tiebreaker). `limit` and `skip` are integers. Any other whitelisted query parameter is an equality filter (`true`/`false` strings are cast for booleans). |
| GET | `/api/entities/:Entity/:id` | One record or 404 |
| POST | `/api/entities/:Entity` | Create; the body is validated by the entity's zod schema |
| PATCH | `/api/entities/:Entity/:id` | Partial update (zod `.partial()`, unknown keys rejected) |
| DELETE | `/api/entities/:Entity/:id` | Returns `204` |

`:Entity` is one of `User`, `Category`, `Supplier`, `Product`, `Transaction`, `Return`, `Shift`, `StockAdjustment`. Any other value returns 404.

**Limits:**
- Reference tables (`Product`, `Category`, `Supplier`, `User`): no default limit, hard cap 10,000.
- Activity tables (`Transaction`, `Return`, `Shift`, `StockAdjustment`): default 500, max 2,000. Every current call already passes a limit.

`shortcut: no cursor pagination; add it if one table outgrows the cap.`

**Permissions** (enforced in the API; "own" means `cashier_email` or `user_email` is forced to the caller's email):

| Entity | Read (admin / cashier) | Create, update, delete |
|---|---|---|
| User | all / own row only | admin: PATCH `full_name`, `display_name`, `role` only. Nobody can change their own role, and the last remaining admin can't be demoted or deleted (`409 LAST_ADMIN`). Creation goes through `POST /api/users` (§3.2). Cashiers can't write user rows at all. |
| Category | all / all | admin |
| Supplier | all / — | admin |
| Product | all / `is_active = true` forced | admin. A PATCH that changes `stock_quantity` locks the row and writes a `stock_adjustments` row in the same transaction (D3). DELETE keeps sale lines and the audit log (FK set null). |
| Transaction | all / own | **No generic writes.** Use `/api/sales`. |
| Return | all / own | **No generic writes.** Use `/api/returns`. |
| Shift | all / own | **No generic writes.** Use `/api/shifts/*`. |
| StockAdjustment | all / — | **No generic writes.** Server-generated only. |

**Filter and sort whitelist** (everything the app uses today, plus the obvious columns):
- Product: `is_active`, `category`, `supplier_id`, `sku`, `barcode`; sort `created_date`, `name`
- Transaction: `sale_type`, `shift_id`, `cashier_email`, `status`; sort `created_date`
- Shift: `status`, `cashier_email`; sort `created_date`, `start_time`
- Return: `cashier_email`, `status`; sort `created_date`
- StockAdjustment: `product_id`; sort `created_date`
- Category: sort `name`
- Supplier: `is_active`; sort `created_date`, `name`
- User: `role`; sort `created_date`, `email`

### 3.2 Auth and users

| Method | Path | Body | Response |
|---|---|---|---|
| GET | `/api/auth/me` | – | `{id, email, full_name, display_name, role, created_date}`. Returns 403 `USER_NOT_REGISTERED` if the token is valid but no `app_users` row is linked (the existing `UserNotRegisteredError` screen shows). |
| POST | `/api/users` (admin, rate-limited) | `{full_name, email, password, role: 'admin'\|'user'}` | `201 {user}`, without the password. Validates every field (password policy §4), returns `409 USER_EXISTS` for a duplicate email, creates the Auth account with `auth.admin.createUser({email, password, email_confirm: true})`, then inserts `app_users` with `auth_user_id` and `must_change_password = true`. If the insert fails, the Auth user is deleted, so no incomplete account is left. Cashiers get 403. |
| POST | `/api/auth/change-password` (any signed-in user, rate-limited) | `{current_password, new_password}` | `204`. Verifies the current password, applies the policy (new ≠ current), sets the password through the Auth Admin API, clears `must_change_password`, and signs other sessions out. `400` for a weak password, `401` for a wrong current password. |

**Round 5 removes** `/api/users/invite` and `/api/users/:id/resend-invite`: there are no invitation emails. `GET /api/auth/me` also returns `must_change_password`. While it's `true`, every other API route answers `403 PASSWORD_CHANGE_REQUIRED` (§4).

### 3.3 Shifts

| Method | Path | Body | Behaviour |
|---|---|---|---|
| POST | `/api/shifts/start` | – | Creates an open shift for the caller with server time and zero totals. Returns `201 {shift}`. If one is already open it returns `409 SHIFT_ALREADY_OPEN` with `details.shift`, enforced by a partial unique index. |
| POST | `/api/shifts/:id/close` | `{declared_cash?: decimal ≥ 0}` | Allowed for the owner or an admin. In one transaction: lock the shift, require `open`, set `status='closed'`, `end_time=now()` and `declared_cash` (S14, the cashier's own cash count, the only figure taken from the browser). Returns `{shift}`. Returns `409 SHIFT_NOT_OPEN` if it's already closed. |
| POST | `/api/shifts/:id/report` | `{store?: {name, address, phone, email}}` (display text only, each ≤ 200 chars) | Allowed for the owner or an admin, on a closed shift only. **The server generates the official PDF**, from database values only (shift totals, its transactions and items, `declared_cash`, variance computed server-side). It stores the PDF in the private `shift-reports` bucket at `{shift_id}/{timestamp}.pdf` and sets `shifts.report_path` (S13). It sends the email, built from the same database values with the PDF attached, to every `app_users.role='admin'` email. Returns `{report_path}`. Rate limit: 5 per shift per hour. |
| GET | `/api/shifts/:id/report-url` | – | Owner or admin. Returns a signed URL that **expires after 10 minutes**, issued fresh on each call. `404` if there is no report. |

**Report integrity (correction, round 3).** The browser no longer builds or uploads the report. `generateShiftPDF` moves from `src/utils/shiftReport.js` to `server/src/reports/shiftReportPdf.js` with the same layout (jsPDF runs in Node), so it reads only server data. The browser's "Download PDF" fetches the stored official PDF through `report-url`. The store header fields live in each device's `localStorage` today, so they are sent as plain display text, escaped and length-limited. They carry no numbers, and the server takes no financial value from the browser.

### 3.4 Sales (retail and wholesale), atomic

`POST /api/sales`

```json
{ "client_request_id": "uuid", "sale_type": "retail|wholesale",
  "items": [{ "product_id": "…", "quantity": 2 }],
  "discount_amount": 0, "payment_method": "cash|card|electronic",
  "amount_paid": 20.00, "customer_name": "optional, wholesale only, ≤ 200 chars" }
```

The server does all of this in **one database transaction**:
1. **Replay check.** If `client_request_id` was already used, return the original transaction with `200`. This guards against double taps and network retries.
2. **Lock the shift.** `SELECT … FROM shifts WHERE cashier_email = $me AND status = 'open' FOR UPDATE`. If none is open, return `409 NO_OPEN_SHIFT`.
3. **Lock the products.** `SELECT … FROM products WHERE id = ANY($ids) AND is_active ORDER BY id FOR UPDATE`. The fixed lock order prevents deadlocks.
4. **Check stock.** Each line's quantity must be ≤ `stock_quantity`. Otherwise return `409 INSUFFICIENT_STOCK` with `details: [{product_id, available}]` (D4).
5. **Price from the database, never from the browser.**
   - Retail unit price is `selling_price`.
   - Wholesale unit price is `wholesale_price` when it is > 0, otherwise `selling_price` (the same rule as `utils/wholesale.js`).
   - `tax_amount = unit × qty × tax_rate / 100`.
   - `line_total = unit × qty + tax`.
   - `cost_price` is snapshotted from the product.
   - `0 ≤ discount_amount ≤ subtotal + tax`.
   - `grand_total`, `total_cost`, `gross_profit` and `change_given = max(0, amount_paid − grand_total)` follow today's formulas.
   - All of this runs in integer cents (`money.js`). Each line rounds once to 2 dp, half away from zero; no floats are used.
6. **Write the sale.** Insert `transactions` (number `TX-`/`WS-` + base36 time + 4 random characters, unique) and `transaction_items` (with `line_no`).
7. **Decrement stock.** `UPDATE products SET stock_quantity = stock_quantity − qty`. A `CHECK (stock_quantity >= 0)` constraint is the backstop.
8. **Update the shift.** `UPDATE shifts SET total_<method>_sales += …, total_revenue += …, total_transactions += 1, total_cost += …, total_profit += …`. These are relative updates, so there is no read-modify-write.
9. **Commit.** Then compute low-stock crossings: the product was above its threshold before the sale and is at or below it after, the same rule as `stockAlerts.js`. Email the admins in the background; an email failure is logged and never fails the sale.

Response `201`:

```json
{ "transaction": {…, "items": [...]}, "low_stock_alerts": [{ "id": "…", "name": "…", "newQty": 3, "threshold": 10 }] }
```

The existing toast "Low stock alert sent…" uses `low_stock_alerts`.

### 3.5 Returns, atomic (admin, D2)

`POST /api/returns`

```json
{ "items": [{ "product_id": "…", "quantity": 1, "unit_price": 9.99, "condition": "good|damaged" }],
  "refund_method": "cash|card|electronic|store_credit",
  "reason": "optional ≤ 1000", "original_transaction_number": "optional ≤ 50" }
```

The server does this in one transaction:
- Lock the products (ordered by id) and snapshot `product_name`, `sku` and `cost_price` from the database.
- Compute `refund_amount`, `cost_recovered`, `cost_lost` and `profit_impact` with today's `calcReturnItem` formulas.
- Insert `returns` and `return_items`.
- For `good` items, `stock_quantity += qty`.
- Insert one `stock_adjustments` row per item, with the same reason text as today, including `delta 0` for damaged items.

Response `201 {return, restocked_units, written_off_units}`.

### 3.6 Inventory, atomic (admin)

| Path | Body | Behaviour |
|---|---|---|
| `POST /api/inventory/update` | `{reason?, updates: [{product_id, stock_quantity?, selling_price?, wholesale_price?, cost_price?, low_stock_threshold?}]}` (≤ 500 rows) | `reason` is required when any stock value changes. Locks every row, reads `previous_quantity` from the database (not the browser's stale copy), applies all patches and logs every stock change. All rows commit or none do. Returns `{updated_count}`. |
| `POST /api/inventory/bulk-stock` | `{product_ids: [...], mode: 'set'\|'add'\|'subtract', value: int ≥ 0, reason}` | Same locking. `add` and `subtract` are clamped at 0, as today. Returns `{updated_count}`. |

### 3.7 Uploads

`POST /api/uploads/product-image` (admin), multipart `file`:
- `image/jpeg|png|webp|gif`, ≤ 5 MB. The type is checked by magic bytes, not just the header.
- Stored at `product-images/{uuid}.{ext}`.
- Returns `{file_url}` (public URL), the same shape the UI already reads.

### 3.8 Health (public)

`GET /health` returns `200 {status: 'ok', db: 'ok'}` after a `SELECT 1`, or `503` if the database is unreachable. Railway uses it as the health check.

### 3.9 AI Restock Advisor (admin)

`POST /api/restock-advisor/chat`

- **Request:** `{messages: [{role: 'user'|'assistant', content: string}]}`, at most 40 messages, each ≤ 4,000 characters.
- **Response:** `{message: {role: 'assistant', content, tool_calls: [{name, arguments_string, status: 'completed'|'failed', results}]}}`.

These are the fields `MessageBubble` already renders: `tool_calls[].name`, `status`, `arguments_string` and `results`.

**Optional integration (round 5, implemented):**
- Without `ANTHROPIC_API_KEY`, or with a `YOUR_…` placeholder, the server starts normally and only the advisor is disabled.
- `GET /api/restock-advisor/status` returns `{enabled: false, reason: 'not_configured'}`, the admin page shows "AI Restock Advisor is not configured" with a setup hint, and chat returns `503 AI_NOT_CONFIGURED`.
- With a valid key on Railway, the advisor turns on automatically at the next deploy. The key exists only in Railway (and optionally in the GitHub `staging` environment for the opt-in AI tests).

How the server runs it:
- Anthropic TypeScript SDK with the Tool Runner. The model is **configurable through the server environment** (`ANTHROPIC_MODEL`), with a default of `claude-opus-5-5`. That ID was checked on 2026-11-05 against Anthropic's models overview, which lists it as a current model retiring no sooner than 2027-09-22.
- **Verified before use:** on startup, the server calls the Models API (`models.retrieve(ANTHROPIC_MODEL)`) with its own key. If the model isn't available to that key, only `/api/restock-advisor/chat` is disabled; it returns `503 AI_MODEL_UNAVAILABLE` and the error is logged. The rest of the API keeps running. `npm run check:model` runs the same check by hand on staging.
- Adaptive thinking at effort `medium`, with server-side refusal `fallbacks: "default"` enabled.
- Non-streaming, `max_tokens` about 16000.

**Tools** (read-only, admin data only):
- `get_inventory`: all products with name, SKU, category, stock, threshold, cost, selling price, active flag and supplier name.
- `get_sales_velocity(days)`: units sold per product over the last N days, from `transaction_items`.

**Conversation state** lives in the page, as today. Today a new conversation starts on every load and on Refresh, and nothing is persisted, so no table is needed.

**Rate limit:** 20 requests per minute per user.

**Limitation (documented, not invented).** The original `restock_advisor` agent's instructions and tool list are **not in this export**. The new system prompt is written only from what the UI shows:
- the page subtitle, "AI-powered inventory analysis & reorder suggestions";
- the 5 suggested prompts (reorder now, out of stock, below 50% of threshold, restock cost, group by category).

Answers will not match the old agent word for word. If you can export the agent config from Base44, I will use it.

---

## 4. Authentication: email and password only (round 5)

**Firm requirement (round 5):**
- Supabase Auth with **email and password only**.
- There is **no social login of any kind**: no Google, Apple, Facebook, Microsoft or other OAuth provider. That means no OAuth callback routes, no OAuth components, no provider buttons, and no OAuth client IDs, secrets or redirect URLs.
- Social login is **not** kept as a future option.
- There is **no public registration**: only an administrator creates accounts.

**Supabase project settings** (staging and production alike):
- **Email provider: on.** "Allow new users to sign up": **off**. Every **other provider: off**, and none is configured.
- **Password policy:** minimum length 10, requiring letters and digits. The backend validates the same rule, so a weak password fails before Supabase is called.
- **Secure password change: on.** It makes Supabase require recent authentication to change a password.
- **Auth rate limits** (Authentication → Rate Limits) for **sign-in** and **password-reset email** requests per IP and per hour. Login and reset go from the browser straight to Supabase Auth, so this is where they are limited. Our own auth endpoints (account creation and password change) have their own Express rate limits.
- **URL configuration:**
  - Staging: Site URL is the staging Vercel URL; Redirect URLs are that URL `/**` plus the preview pattern `https://*-<vercel-team>.vercel.app/**`.
  - Production: Site URL and Redirect URL are `https://YOUR_PRODUCTION_DOMAIN` only.
  - These are used **only** for password-reset links.
- **Custom SMTP through Resend** for the reset emails.
- **Asymmetric JWT signing keys.**
- Passwords are hashed and verified **by Supabase Auth only**. No application table stores a password or a password hash, ever.

| Flow | Implementation |
|---|---|
| Login screen | Email address, password, **Sign in** button and a **Forgot password?** link. Nothing else: no social buttons, no sign-up link. `signInWithPassword`, then `safeReturnTo()`. A wrong password shows one generic "Invalid email or password" message (no account enumeration). |
| Session | `supabase-js` stores the session and refreshes it. `src/api/client.js` sends `session.access_token` with every request. |
| AuthContext | Same context shape as today, so `ProtectedRoute` and `AdminRoute` stay unchanged. It loads `GET /api/auth/me`, which returns the role, display name and `must_change_password`. |
| Backend verification | `requireAuth` verifies the token with `getClaims` (JWKS), then loads `app_users` by `auth_user_id = sub`. Roles come **only** from `app_users.role`, never from token metadata. `requireAdmin` checks `role = 'admin'`. A signed-in Auth user without an `app_users` row gets `403 USER_NOT_REGISTERED`. |
| **Admin creates an account** | User Management → "Create user", with full name, email, initial password and role (Admin or Cashier). This calls **`POST /api/users`** (admin only, rate-limited). The backend steps are listed below the table. |
| **Temporary password, first login** | The initial password is temporary (`app_users.must_change_password = true`, S15). While it is set, `requireAuth` answers **`403 PASSWORD_CHANGE_REQUIRED`** to every API route except `GET /api/auth/me` and `POST /api/auth/change-password`. The frontend sends the user to **`/change-password`**, and no other page loads until the password is changed. |
| **Change password** (first login or any time later) | `/change-password` asks for the current and new password, then calls **`POST /api/auth/change-password`** (rate-limited). The backend steps are listed below the table. Users reach the page any time from the account menu. |
| Password recovery | `/forgot-password` → `supabase.auth.resetPasswordForEmail(email, {redirectTo: APP_URL + '/reset-password'})`, with the same message whether or not the account exists. `/reset-password` waits for the `PASSWORD_RECOVERY` session and calls `updateUser({password})`. On the next `/api/auth/me` the server clears `must_change_password`, because the owner of the mailbox chose this password. Expired or reused links show "invalid link". |
| Email verification | Accounts are created by an administrator with `email_confirm: true`: the admin vouches for the address and no confirmation email is sent. Ownership of the mailbox is proven whenever the person uses password recovery. Users can't change their email address themselves. |
| Logout | `supabase.auth.signOut()` then `/login`. |
| `/register` | Kept as an information page: "Accounts are created by your store administrator." It has no form, and no page links to it. |
| Existing (imported) users | Passwords can't be exported from Base44. The administrator either creates each user's initial password in User Management, or `scripts/create-accounts.js` (approval only) creates accounts with a random password that is never shown and sends each person a password-reset email. |

**`POST /api/users`: what the backend does when an admin creates an account:**
1. Verifies that the caller is an admin, from `app_users.role`; otherwise 403. Cashiers can't create any account, admins included.
2. Validates the body: `full_name` (1–200 characters), `email` (normalised), `password` (policy above) and `role` (`admin` or `user`). Unknown fields are rejected.
3. Rejects a duplicate email: `409 USER_EXISTS` if it's already in `app_users` or in Supabase Auth.
4. Creates the Auth account with the **Supabase Auth Admin API**: `auth.admin.createUser({email, password, email_confirm: true})`, using the secret key on Railway only.
5. Inserts `app_users` with the full name, role, `must_change_password = true`, and `auth_user_id` = the new Auth user id.
   - **Linking:** `app_users.id` stays the text primary key (S1). Imported Base44 ids must be preserved, because sales, shifts and returns reference them.
   - So the link is the unique `app_users.auth_user_id` column, referencing `auth.users(id)`, rather than reusing `auth.users.id` as `app_users.id`.
   - This gives the same one-to-one guarantee without rewriting historical ids.
6. **Failure handling:** if step 5 fails, the Auth user from step 4 is deleted at once, so no half-created account remains. If step 4 fails, nothing was written. If the cleanup itself fails, the error is logged as an orphaned auth id (no password in the log), and the next attempt for that email returns 409 until it's resolved.
7. Logging: request bodies of auth routes are never logged; pino redacts `password` and `current_password`.

**`POST /api/auth/change-password`: what the backend does:**
1. Verifies the current password with a Supabase sign-in on the server.
2. Checks the new password against the policy, and that it differs from the current one.
3. Updates it with `auth.admin.updateUserById`.
4. Sets `must_change_password = false`.
5. Signs the user's other sessions out.
6. Never logs either password.

**Roles and permissions:**
- Only admins create accounts and assign roles.
- Cashiers can't create accounts or change any role.
- Nobody can change their **own** role.
- The **last remaining admin** can't be demoted or deleted (`409 LAST_ADMIN`), so the store can never lose administrator access.

---

## 5. Database schema (changes against `docs/schema/schema.sql`)

The 10 tables, their columns, CHECK constraints and indexes are reused as written, except for the changes below. Each change is documented so `schema.sql` can be updated alongside it.

| # | Change | Reason |
|---|---|---|
| S1 | `id text PRIMARY KEY DEFAULT gen_random_uuid()::text` on every table | Imported rows keep their Base44 text ids. New rows get UUID strings. |
| S2 | `app_users.auth_user_id uuid UNIQUE REFERENCES auth.users(id) ON DELETE SET NULL` | Links app users to Supabase Auth while keeping the Base44 id, which `created_by_id` references. |
| S3 | Trigger `set_updated_date()` on every table | `updated_date` used to be set by Base44 automatically. |
| S4 | `UNIQUE INDEX shifts(cashier_email) WHERE status = 'open'` | One open shift per cashier; stops duplicate starts. |
| S5 | `transactions.client_request_id text UNIQUE` (nullable) | Makes a sale safe to retry. |
| S6 | `CHECK (stock_quantity >= 0)` on products | Database-level backstop against overselling. |
| S7 | `returns.original_transaction_number`: **drop the FK**, keep the index | Today it's free text typed by a person. An FK would reject typos and receipts from other systems, a behaviour change and an import failure. |
| S8 | `stock_adjustments.product_id`: nullable with `ON DELETE SET NULL` (was `CASCADE`) | Deleting a product must not erase its audit history. `product_name` and `sku` snapshots remain. |
| S9 | `transaction_items` and `return_items` stay **normalized** (as in `schema.sql`) | The API rebuilds `items[]` with the original keys in `line_no` order, so the UI is unchanged and analytics can query lines. Nothing is lost: the import maps every documented item key to a column and **aborts with a report** if it finds an undocumented key. |
| S10 | `sale_type` NULL in imported data becomes `'retail'` | Matches `utils/wholesale.js` ("older records have no sale_type"). |
| S11 | RLS **enabled on all 10 tables**, no policies; `REVOKE ALL` on these tables from `anon` and `authenticated` | Data access is through the API only (§2). Supabase stopped auto-exposing new tables to the Data API in 2026, and the revoke makes it explicit. |
| S13 | `shifts.report_path text` (nullable) | Links the stored official PDF (new or migrated) to its shift. |
| S14 | `shifts.declared_cash numeric(12,2)` (nullable, `CHECK >= 0`) | The cashier's count is stored, so the server can compute the variance for the PDF and email. Previously it only existed in the browser. |
| S15 | `app_users.must_change_password boolean NOT NULL DEFAULT false` (round 5) | Set to `true` when an admin creates an account with a temporary password. Cleared by `POST /api/auth/change-password`, or by a completed email password reset. While it's `true`, the API refuses everything except `/api/auth/me` and the password change. The table never holds a password or hash. |
| S12 | Extra indexes: `transactions(cashier_email, created_date DESC)`, `transactions(sale_type, created_date DESC)`, `shifts(created_date DESC)`, `stock_adjustments(created_date DESC)` | These match the actual query patterns in §1.1. |

**Kept as is:**
- Email-based FKs to `app_users(email) ON UPDATE CASCADE`. The import preflight reports orphan emails before anything is written.
- `products.category` → `categories(name)` with `ON UPDATE CASCADE ON DELETE SET NULL`. The UI already blocks deleting a category that is in use.

**Migration files:**
- `server/supabase/migrations/0001_schema.sql` (tables + S1–S10, S12–S14)
- `0002_security.sql` (S11)
- `0003_storage.sql` (buckets and policies)

They are created with `supabase migration new` and applied with `supabase db push --linked` (no Docker needed). The order is **staging, then production. Production only with your approval.** Because there's no throwaway local database, a mistake on staging is corrected with a new forward migration. Staging may be reset with `supabase db reset --linked`, which runs behind the same target guard (staging ref only) and is refused for production. `supabase db diff`/`pull` need Docker, so they aren't used; migrations are hand-written and reviewed.

**Atomic operations** run as parameterized SQL inside `BEGIN … COMMIT` in Express, with `pg` on the Supavisor **session** pooler (port 5432, IPv4, which Railway needs). This keeps all business rules in one testable codebase, with no `SECURITY DEFINER` functions. Isolation is READ COMMITTED with explicit row locks (§3.4).

---

## 6. Data migration strategy

1. **Export** every Base44 entity as JSON (preferred) or CSV. You do this. I need the files, but no credentials.
2. **Preflight** with `node server/scripts/import-base44.js --dir ./exports --dry-run`. It reports, and writes nothing:
   - row counts per entity;
   - orphan cashier and user emails;
   - product categories missing from `Category`;
   - more than one open shift per cashier;
   - enum values outside the CHECK lists;
   - negative stock;
   - duplicate `transaction_number` or `return_number`;
   - unknown keys inside `items[]`;
   - suppliers that products reference but that don't exist.
   - money values with more than 2 decimals, and stored totals that don't equal the sum of their lines (exact decimal comparison).
3. **Fix** anything reported, with your decision for each case. The script never "repairs" data silently.

**Target protection (correction, round 3).** These rules apply to every script that writes: `import-base44.js`, `migrate-images.js`, `migrate-reports.js` and `create-accounts.js`.
- **Dry-run is the default.** Writing needs `--commit`.
- `--target staging|production` is **required**, and so is `--expect-ref <project-ref>`.
- The script reads the **actual** project ref from the connection itself: the `DATABASE_URL` pooler user (`postgres.<ref>`) or host (`db.<ref>.supabase.co`), and the `SUPABASE_URL` host (`<ref>.supabase.co`). It runs `SELECT current_database(), inet_server_addr()` and prints all of them. It aborts unless every source agrees and equals `--expect-ref`.
- It also aborts unless that ref matches the ref recorded for the chosen target in `server/scripts/targets.json`. That file is committed, holds project refs only and no secrets, and must list two **different** refs.
- **Production needs a separate, explicit authorization.** That is `--target production` plus `--i-have-approval-for-production=<ref>`, plus typing the ref again at an interactive prompt. With no TTY (CI) it refuses.
- Any host other than `*.supabase.co` or `*.pooler.supabase.com` is refused. A mismatch or a missing flag exits non-zero **before** any connection opens a write transaction.
- Every run writes a log file (target, ref, mode, counts) to `server/scripts/logs/`, which is git-ignored.
4. **Import into staging** in **one transaction**, in FK order: `app_users` → `categories` → `suppliers` → `products` → `shifts` → `transactions` + items → `returns` + items → `stock_adjustments`.
   - Original `id`, `created_date`, `updated_date` and `created_by_id` are preserved.
   - The `updated_date` trigger is disabled for the import session only.
5. **Reconcile.** Row counts and money totals (sum of `grand_total`, `total_refund`, shift totals, stock per product) must match the export exactly. The script prints both sides.
6. **Images** (§7), then **user accounts**. Either the admin sets initial passwords in User Management, or `create-accounts.js` runs (dry-run first): it creates an Auth account for each imported user, with a random password never shown, and sends a password-reset email so each person chooses their own. That sends real emails, so it runs only on your go-ahead.
7. **Cutover:**
   - Freeze sales on Base44 and take the final export.
   - Repeat steps 2–5 on the **production** Supabase project (only with your approval).
   - You switch DNS; the user accounts are then created (step 6).
   - Keep Base44 read-only until you sign off.

---

## 7. Storage

| Bucket | Access | Contents |
|---|---|---|
| `product-images` | **Publicly viewable** via its public object URL. Direct client **upload, update, delete** and listing are blocked for `anon` and `authenticated`: there are no `storage.objects` policies for this bucket. The only writer is the API (`POST /api/uploads/product-image`, admin, secret key). | Product photos |
| `shift-reports` | **Private.** No public URL and no client policies. Reachable only through `GET /api/shifts/:id/report-url`, which is owner or admin only and issues a 10-minute signed URL. | Official shift PDFs (server-generated or migrated) |

**Migrating existing files:**
- `scripts/migrate-images.js` scans `products.image_url`.
- For each URL on a Base44 storage host (the host list is confirmed from your export), it downloads the file, checks it is an image ≤ 5 MB, uploads it to `product-images/{product_id}/{sha1}.{ext}` and rewrites `image_url`. It runs dry-run first.
- URLs that admins pasted from other sites are left as they are.
- Shift report PDFs: `scripts/migrate-reports.js` imports the files or links you can supply (checklist A3), maps each file to its shift by its `shift-report-{shift_id}.pdf` name or its contents, and sets `report_path`. Files that can't be retrieved are listed. **Links in old report emails stop working once Base44 is shut down.**

---

## 8. Security design

- **Secrets:**
  - Only Railway holds `SUPABASE_SECRET_KEY`, `DATABASE_URL`, `RESEND_API_KEY` and `ANTHROPIC_API_KEY`.
  - The browser gets only the Supabase **publishable** key, the Supabase URL and the API URL.
  - `.env*` stays git-ignored; `.env.example` files hold placeholders only.
  - `.gitignore` also excludes key and certificate files, service-account JSON, Supabase CLI temp folders, the Base44 **data exports** (they contain customer and staff personal data), migration logs and local backups.
  - Secret scan: a dependency-free `scripts/check-secrets.mjs` (key patterns: Anthropic, Resend, Supabase secret, JWT, private keys, Postgres URLs with passwords) runs over the staged files as a git pre-commit hook, and again over the whole history before the first push to GitHub. A hit blocks the commit.
  - The baseline commit was scanned before it was made: no `.env`, key files or credential strings.
- **AuthN and AuthZ:**
  - Every `/api` route sits behind `requireAuth`, plus `requireAdmin` where the matrix in §3.1 says so.
  - Own-record scoping is forced on the server and never trusted from query parameters.
  - Roles come from the database, never from JWT user metadata.
- **Business integrity:**
  - Prices, costs, stock and shift totals are computed on the server.
  - Row locks, the stock CHECK, the unique open-shift index and idempotent sales are all in place.
  - Cashiers have no write path to products, at all.
- **Input:**
  - zod validates every body and query, and unknown keys are rejected.
  - Sort and filter fields are whitelisted.
  - SQL is parameterized only.
  - JSON body limit is 100 kB; uploads are checked by size and magic bytes.
- **XSS and CSRF:**
  - React escapes output.
  - Email templates moved to the server **HTML-escape every interpolated value**. Today product names and store settings are inserted raw.
  - Auth uses a bearer header, not cookies, so CSRF does not apply.
- **HTTP:**
  - `helmet` is on.
  - CORS allows only `FRONTEND_ORIGINS` (app domain + Vercel preview pattern).
  - `express-rate-limit` covers the general API (300/min/IP), AI (20/min/user), reports, account creation (30/hour/admin) and password change (5 per 15 min per user).
  - Login and password-reset requests go straight to Supabase Auth, and are limited by its Auth rate limits (§4).
  - `trust proxy` is set for Railway.
- **Logging:**
  - `pino-http` logs a request id, user id, route, status and latency.
  - Tokens, passwords and bodies of auth calls are never logged.
  - One central error handler maps zod, pg (unique → 409, check → 400/409) and auth errors, and hides internals in production.
- **Supabase checklist:** RLS on everywhere, no `SECURITY DEFINER` in `public`, no `user_metadata` authorization, and signups disabled. I'll run `supabase db advisors` before each migration is committed.

---

## 9. Deployment design

**Vercel (frontend):**
- Framework: Vite. Install: `npm ci`. Build: `npm run build`. Output: `dist`.
- `vercel.json` rewrites everything to `/index.html` for SPA routes.
- `@base44/vite-plugin` and `@base44/sdk` are removed. `vite.config.js` keeps React plus the `@` alias.
- The favicon becomes a local file.
- Environment variables: the full list, with placeholders, is in `/.env.example` and README → "Environment variables". All of them are public `VITE_` values; no secret ever gets a `VITE_` prefix.

**Railway (backend):**
- Root directory `server`, Node 22 (`engines`). supabase-js dropped Node 20.
- Start: `node src/index.js`, listening on `process.env.PORT` and `0.0.0.0`.
- Health check: `/health`.
- Start command, health check and restart policy are set in the Railway service settings (docs/deploy/DEPLOYMENT.md). Railway's `railway.json` (Config as Code) was checked on 2026-11-06 and is deprecated: new services can't opt in, and files stop being read on 2026-12-01. So no `railway.json` is used.
- Environment variables: the full list is in `server/.env.example` and README → "Environment variables". The server refuses to start if a required one is missing or still a `YOUR_…` placeholder.
- Two Railway environments, `staging` and `production`, each with its own variables. The backend URL is Railway's generated `*.up.railway.app` domain, so no DNS is needed.

**Supabase:**
- Two projects: **staging** and **production**.
- Migrations via the CLI; Auth settings as in §4; buckets via `0003_storage.sql`.

**DNS:**

| Record | Purpose |
|---|---|
| `app` CNAME → Vercel | Frontend |
| `api` CNAME → Railway target | Backend |
| Resend SPF / DKIM / DMARC TXT records | Email for reports, alerts and Supabase auth emails |

**Round 4: you do all DNS work yourself.** I make no DNS changes and configure no domain. The table only lists what you will add:
- the Vercel domain records shown in the Vercel dashboard;
- Resend's sending-domain records;
- optionally an `api` CNAME, which isn't needed because the Railway URL works as-is.

Until then, Railway and Vercel generated URLs are used. README → "After adding your domain" lists every variable and redirect setting to update.

**Environments:**
- Vercel preview + Railway staging + Supabase staging for testing.
- Production is deployed only with your approval.

**Source control:**
- `git init`, the current files committed as the **untouched baseline** on `main`, and all work on `migration/supabase`.
- Pushed to a GitHub repository that you create.

---

## 10. Credentials and external configuration you will need to provide

Enter these in the dashboards, never in code or chat:

| Item | Where it goes |
|---|---|
| Supabase staging + production projects: URL, publishable key, secret key, DB password / session-pooler URL | Vercel (URL + publishable key only), Railway (the rest) |
| Resend API key + verified sending domain | Railway; Supabase Auth → SMTP |
| Anthropic API key | Railway |
| GitHub repository | Vercel + Railway connect to it |
| Domain registrar or DNS access | DNS records (§9) |
| Base44 data export (JSON/CSV per entity) and, if obtainable, the `restock_advisor` agent config | Given to me as files |

---

## 11. Phase 3 build order (after approval)

1. Set up git: baseline commit, then branch `migration/supabase`. Fix the 4 build blockers (§1.4) and confirm `npm run build` passes.
2. Supabase migrations 0001–0003 on the **hosted staging** project (`supabase db push --linked`), then run the advisors. No Docker or local Supabase.
3. Express skeleton: config, `pg` pool (NUMERIC kept as strings) plus `money.js`, auth middleware, error handler, logging, `/health`.
4. Generic entity routes plus the permission matrix, with tests.
5. Atomic routes: sales, returns, inventory, shifts. Tests include a **concurrency test** (two parallel sales on stock 1: exactly one succeeds) and an idempotency test.
6. Admin-created users and password change, uploads, the email templates (escaped), the optional Restock Advisor.
7. Frontend: `src/api/client.js`, `supabase.js`, AuthContext and the auth pages, then the mechanical call-site swap, then the logic changes listed in §2.
8. Import, image, report and account-creation scripts, tested against a sample export.
9. Deployment config, `.env.example` files, README, API docs.
10. Phase 6 grep audit for `base44`. Then, **on `migration/supabase` only**, delete `src/pages/OAuthConsent.jsx` and `src/lib/app-params.js` (decision B.4, round 3), and remove the Base44 packages. This happens only after a grep shows no remaining imports or references and the build, lint and tests pass. The originals stay in the ZIP and in `original-base44`.

**Tests (round 4, cloud only):** `node:test` + `supertest` in `server/test`.
- They run against the **hosted staging Supabase project**, from GitHub Actions (`ubuntu-latest`, Node 22) and, optionally, from this machine with a git-ignored `server/.env.staging`.
- Every test run is guarded: it refuses unless `SUPABASE_PROJECT_ID` equals the staging ref in `targets.json` and `APP_ENV=staging`.
- Each run creates its own data under a unique run prefix (`t_<runid>_`): test users, products and shifts. It deletes that data afterwards, and a sweep removes leftovers from crashed runs that are older than 24 h.
- CI serializes runs (one at a time) so tests never collide.
- Frontend: `npm run lint` and `npm run build` in CI on Linux, plus a Vercel preview build per pull request.
- Then manual and browser checks of every route on the staging deployment.
- Details are in checklist section D.

**Currency (round 4).**
- One store currency per deployment: `CURRENCY` on the server and `VITE_CURRENCY` in the browser, which must match (the server reports its value in `/api/auth/me`).
- The minor unit comes from ISO 4217 via `Intl.NumberFormat(…).resolvedOptions().maximumFractionDigits`.
- The schema stores money as `numeric(12,2)`, so currencies with **0 or 2** minor digits are supported (USD, EUR, GBP, NGN, JPY, …). For 0-digit currencies, the server rejects amounts with fractions.
- 3-digit currencies (KWD, BHD, …) are refused at boot. Supporting them would need a schema change.
- `formatMoney` uses `Intl.NumberFormat` with that currency, replacing the hard-coded `$`.
