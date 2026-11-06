// T19 (synthetic part): the real import runs in one transaction against staging,
// reconciles exactly, keeps original ids/dates, and rolls back completely when
// anything fails. The rehearsal with your real Base44 export is a separate,
// approved step (it contains personal data).
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanup, setup } from './helpers.js';
import { preflight, planTotals } from '../../scripts/lib/base44-export.js';
import { conflicts, importPlan } from '../../scripts/import-base44.js';
import { sampleExport } from '../fixtures/base44-sample.js';

let ctx; let client;

/** The unit-test sample with every id, email, name and number prefixed for this run. */
function prefixed(P) {
  const d = sampleExport();
  const pid = (v) => (v ? `${P}${v}` : v);
  const pem = (v) => (v ? `${P}${v}`.toLowerCase().replace('@shop.test', '@example.com') : v);
  for (const rows of Object.values(d)) for (const r of rows) r.id = pid(r.id);
  for (const u of d.User) u.email = pem(u.email);
  for (const c of d.Category) c.name = pid(c.name);
  for (const s of d.Supplier) { s.name = pid(s.name); s.email = pem(s.email); }
  for (const p of d.Product) { p.name = pid(p.name); p.sku = pid(p.sku); p.category = pid(p.category); p.supplier_id = pid(p.supplier_id); }
  for (const s of d.Shift) s.cashier_email = pem(s.cashier_email);
  for (const t of d.Transaction) {
    t.transaction_number = pid(t.transaction_number); t.cashier_email = pem(t.cashier_email); t.shift_id = pid(t.shift_id);
    for (const i of t.items) { i.product_id = pid(i.product_id); i.product_name = pid(i.product_name); }
  }
  for (const r of d.Return) {
    r.return_number = pid(r.return_number); r.cashier_email = pem(r.cashier_email);
    for (const i of r.items) { i.product_id = pid(i.product_id); i.product_name = pid(i.product_name); }
  }
  for (const a of d.StockAdjustment) { a.product_id = pid(a.product_id); a.product_name = pid(a.product_name); a.user_email = pem(a.user_email); }
  return d;
}

before(async () => {
  ctx = await setup('imp');
  client = await ctx.db.connect();
});
after(async () => { client?.release(); await cleanup(ctx); });

test('import commits in one transaction, reconciles exactly and keeps Base44 ids and dates', async () => {
  const { problems, plan } = preflight(prefixed(ctx.P));
  assert.deepEqual(problems, []);
  assert.deepEqual(await conflicts(client, plan), []);

  const result = await importPlan(client, plan);
  assert.deepEqual(result.totals, planTotals(plan));
  assert.equal(result.counts.Transaction, 1);

  const user = (await ctx.db.query('SELECT id, created_date, auth_user_id FROM public.app_users WHERE id = $1', [`${ctx.P}u1`])).rows[0];
  assert.equal(user.created_date.toISOString(), '2026-01-01T09:00:00.000Z');
  assert.equal(user.auth_user_id, null); // linked later by create-accounts.js
  const items = await ctx.db.query('SELECT line_no, line_total FROM public.transaction_items WHERE transaction_id = $1', [`${ctx.P}t1`]);
  assert.deepEqual(items.rows, [{ line_no: 1, line_total: '5.50' }]);
  const tx = (await ctx.db.query('SELECT sale_type FROM public.transactions WHERE id = $1', [`${ctx.P}t1`])).rows[0];
  assert.equal(tx.sale_type, 'retail'); // S10 default

  const again = await conflicts(client, plan);
  assert.ok(again.length > 0, 'a second import of the same data is not detected');
});

test('any failure rolls the whole import back', async () => {
  const d = prefixed(`${ctx.P}b_`);
  const { problems, plan } = preflight(d);
  assert.deepEqual(problems, []);
  plan.StockAdjustment[0].user_email = 'nobody-in-app-users@example.com'; // FK violation on the LAST table
  await assert.rejects(importPlan(client, plan));
  const n = await ctx.db.query('SELECT count(*)::int AS n FROM public.app_users WHERE id LIKE $1', [`${ctx.P}b\\_%`]);
  assert.equal(n.rows[0].n, 0, 'rows from the failed import remained');
});
