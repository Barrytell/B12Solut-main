import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { loadExport, planTotals, preflight } from '../../scripts/lib/base44-export.js';
import { sampleExport } from '../fixtures/base44-sample.js';

const clone = () => structuredClone(sampleExport());
const issues = (data, opts) => preflight(data, opts).problems.map((p) => `${p.entity} ${p.id}: ${p.issue}`);

test('a consistent export passes with documented defaults only', () => {
  const r = preflight(clone());
  assert.deepEqual(r.problems, []);
  assert.equal(r.notes['Transaction.sale_type missing -> default "retail" (S10: older records have no sale_type)'], 1);
  assert.equal(r.notes['StockAdjustment.delta missing -> new - previous (exact)'], 1);
  assert.equal(r.plan.User[0].email, 'owner@shop.test'); // emails normalised
  assert.equal(r.plan.Return[0].cashier_email, 'owner@shop.test');
  assert.equal(r.plan.Product[0].selling_price, '2.50');
  assert.equal(r.plan.Product[1].wholesale_price, '0.00');
  assert.equal(r.plan.StockAdjustment[0].delta, '-1.000');
  assert.equal(r.plan.Transaction[0].items[0].line_no, 1);
  assert.deepEqual(planTotals(r.plan), {
    transactions_grand_total: '5.50', transactions_total_cost: '2.40', transaction_lines: '1',
    returns_total_refund: '2.50', return_lines: '1', shifts_total_revenue: '5.50', products_stock: '40.000',
  });
});

test('float residue and too many decimals are reported, not rounded', () => {
  const d = clone();
  d.Product[0].selling_price = 0.1 + 0.2; // 0.30000000000000004
  d.Transaction[0].grand_total = 5.499999999999999;
  const all = issues(d).join('\n');
  assert.match(all, /Product p1: selling_price has more decimals/);
  assert.match(all, /Transaction t1: grand_total has more decimals/);
});

test('totals that do not add up are reported', () => {
  const d = clone();
  d.Transaction[0].subtotal = 5.01;
  d.Return[0].total_refund = 3;
  d.StockAdjustment[0].delta = 5;
  const all = issues(d).join('\n');
  assert.match(all, /subtotal \+ tax .* != sum of lines/);
  assert.match(all, /total_refund 3.00 != sum of lines 2.50/);
  assert.match(all, /delta 5.000 != new_quantity - previous_quantity/);
});

test('broken references and duplicates are reported', () => {
  const d = clone();
  d.Transaction[0].cashier_email = 'ghost@shop.test';
  d.Product[0].category = 'snacks';
  d.Product[0].supplier_id = 's9';
  d.Transaction[0].shift_id = 'sh9';
  d.User.push({ id: 'u3', email: 'OWNER@shop.test', role: 'user' });
  d.Shift.push({ ...d.Shift[0], id: 'sh2', status: 'open' }, { ...d.Shift[0], id: 'sh3', status: 'open' });
  const all = issues(d).join('\n');
  for (const re of [/cashier_email ghost@shop.test is not a user/, /category "snacks" is not in Category/, /supplier_id s9 does not exist/,
    /shift_id sh9 does not exist/, /duplicate email "owner@shop.test"/, /2 open shifts for one cashier/]) assert.match(all, re);
});

test('unknown fields stop the import unless explicitly ignored', () => {
  const d = clone();
  d.Product[0].colour = 'red';
  d.Transaction[0].items[0].serial = 'X1';
  assert.match(issues(d).join('\n'), /unknown fields: colour/);
  assert.match(issues(d).join('\n'), /unknown item fields: serial/);
  assert.deepEqual(issues(d, { ignoreKeys: ['colour', 'serial'] }), []);
});

test('lines of deleted products: a problem unless --null-missing-product-refs', () => {
  const d = clone();
  d.Transaction[0].items[0].product_id = 'p-deleted';
  assert.match(issues(d).join('\n'), /product_id p-deleted does not exist/);
  const r = preflight(d, { nullMissingProductRefs: true });
  assert.deepEqual(r.problems, []);
  assert.equal(r.plan.Transaction[0].items[0].product_id, null);
  assert.equal(r.plan.Transaction[0].items[0].product_name, 'Cola');
});

test('bad enums, negative stock, missing required fields', () => {
  const d = clone();
  d.Transaction[0].payment_method = 'bitcoin';
  d.Product[1].stock_quantity = -3;
  delete d.Product[1].sku;
  d.Category.push({ name: 'no id' });
  const all = issues(d).join('\n');
  for (const re of [/payment_method "bitcoin"/, /stock_quantity is negative/, /missing required field sku/, /missing or non-text id/]) assert.match(all, re);
});

test('loadExport reads <Entity>.json arrays or {data:[...]}; missing files mean no rows', () => {
  const dir = mkdtempSync(join(tmpdir(), 'b12-export-'));
  writeFileSync(join(dir, 'Product.json'), JSON.stringify([{ id: 'p1' }]));
  writeFileSync(join(dir, 'User.json'), JSON.stringify({ data: [{ id: 'u1' }] }));
  const d = loadExport(dir);
  assert.equal(d.Product.length, 1);
  assert.equal(d.User.length, 1);
  assert.deepEqual(d.Return, []);
  writeFileSync(join(dir, 'Shift.json'), JSON.stringify({ nope: true }));
  assert.throws(() => loadExport(dir), /expected a JSON array/);
});
