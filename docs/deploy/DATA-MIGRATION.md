# Data migration runbook (Base44 → Supabase)

All scripts live in `server/scripts/` and run from the `server/` folder.

**Every script:**
- refuses to run unless `--target` and `--expect-ref` match the real connection and `scripts/targets.json`;
- is **dry-run by default**, and writes only with `--commit`;
- reads credentials from the environment, never from arguments. Use a git-ignored `server/.env.staging`, with `node --env-file=.env.staging ...`.

**Production** additionally needs `--i-have-approval-for-production=<project-id>` plus typing the ID at a prompt. It refuses without a terminal (CI). Production runs happen only with your explicit approval, after staging passes.

## 0. Export from Base44 (you)

- Export every entity as JSON, one file per entity: `User.json`, `Category.json`, `Supplier.json`, `Product.json`, `Shift.json`, `Transaction.json`, `Return.json`, `StockAdjustment.json`.
- Each file holds an array of records (or `{"data": [...]}`).
- Keep the files **outside the repository**, or in `exports/`, which is git-ignored. They contain staff and customer personal data.
- If your export is CSV instead, tell me before running anything. The importer reads JSON only, and I'd add CSV once I've seen the real files rather than guess their layout.

## 1. Pre-import check (dry-run)

```bash
node --env-file=.env.staging scripts/import-base44.js --dir=../exports --target=staging --expect-ref=<staging-id>
```

It checks every record and **repairs nothing silently**. It reports:
- missing ids or required fields, duplicates, values outside the allowed lists;
- **money with more than 2 decimals** (float residue such as `12.340000000001`), quantities with more than 3, negative stock;
- **totals that don't add up**: subtotal + tax ≠ sum of lines, grand total ≠ subtotal + tax − discount, return totals ≠ their lines, stock `delta` ≠ new − previous;
- broken links: unknown cashier emails, categories, suppliers or shifts, more than one open shift per cashier;
- fields the new schema doesn't have. The import stops rather than lose them; drop them knowingly with `--ignore-keys=a,b`;
- lines that point at deleted products. Keep them without the link with `--null-missing-product-refs`; the name and SKU stay on the line.

The only automatic changes are documented defaults, and each is counted in the report:
- missing `sale_type` becomes `retail` (S10);
- other missing status fields take their Base44 default;
- a missing `delta` is computed exactly;
- a missing `created_date` becomes the import time;
- emails are lower-cased.

The script also checks the target database read-only for records that already exist. A full JSON report goes to `scripts/logs/`, which is git-ignored. **Fix each reported problem in Base44 (or decide it with me), export again, and repeat until the dry-run passes.**

## 2. Import (staging rehearsal, needs your approval because it's real personal data)

```bash
node --env-file=.env.staging scripts/import-base44.js --dir=../exports --target=staging --expect-ref=<staging-id> --commit
```

- One transaction, in FK order: users → categories → suppliers → products → shifts → transactions + lines → returns + lines → stock adjustments.
- Original Base44 ids and `created_date` / `updated_date` are kept.
- Before committing, the script compares record counts and **exact decimal totals** (sales, cost, refunds, shift revenue, stock, number of lines) with the export. Any difference rolls **everything** back.

## 3. Product images

```bash
node --env-file=.env.staging scripts/migrate-images.js --target=staging --expect-ref=<staging-id> --hosts=<base44-image-host>
```

- `--hosts` is required: the storage hosts Base44 used, read from `image_url` values in your export.
- Each file is downloaded, checked to be a real PNG, JPEG, WebP or GIF of at most 5 MB, copied to `product-images/{product_id}/…`, and `image_url` is rewritten.
- Images hosted elsewhere are left unchanged. Failures are listed.

## 4. Old shift-report PDFs

```bash
node --env-file=.env.staging scripts/migrate-reports.js --target=staging --expect-ref=<staging-id> --dir=<pdf-folder> [--urls=links.txt] [--map=map.json]
```

- Files named `shift-report-{shift_id}.pdf` are matched automatically.
- For renamed files, `map.json` maps a file name or URL to a shift id, e.g. `{"report (3).pdf": "abc123"}`.
- The script never overwrites an existing report. Unmatched or unreadable files are listed; nothing is invented.

## 5. Invitations (real emails, only with your explicit approval)

```bash
node --env-file=.env.staging scripts/invite-users.js --target=staging --expect-ref=<staging-id> [--only=a@x.com] [--delay-ms=2000]
```

- The dry-run lists the users without a sign-in account. `--commit` emails each one an invitation and links the account.
- Passwords can't be exported from Base44, so everyone sets a new password from the email (or signs in with Google using the same address).

## 6. Production cutover (Stage 11, each step with your approval)

1. Freeze sales on Base44 and take the final export.
2. Repeat steps 1–4 with `--target=production --expect-ref=<prod-id> --i-have-approval-for-production=<prod-id>`.
3. Run step 5, then switch over. Keep Base44 read-only until you sign off.
