// T7 full rollback: a staging-only trigger (supabase/test-fixtures) makes the
// LAST write of each atomic operation fail, for rows marked __force_rollback__
// only. Afterwards nothing may have changed anywhere.
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { cleanup, createProduct, createUser, productRow, sale, setup, startShift } from './helpers.js';

const FIXTURES = join(import.meta.dirname, '../../supabase/test-fixtures');
const MARK = '__force_rollback__';
let ctx; let admin; let marked; let normal;

before(async () => {
  ctx = await setup('rb');
  await ctx.db.query(readFileSync(join(FIXTURES, 'force-rollback.sql'), 'utf8'));
  admin = await createUser(ctx, 'admin');
  marked = await createUser(ctx, 'user', { name: `${ctx.P}${MARK}` }); // their shift row carries the marker
  normal = await createProduct(ctx, { name: 'rbNormal', stock: '10', price: '2.00' });
  await startShift(ctx, marked.token);
});
after(async () => {
  try {
    if (ctx) await ctx.db.query(readFileSync(join(FIXTURES, 'remove-force-rollback.sql'), 'utf8'));
  } finally {
    await cleanup(ctx);
  }
});

const count = async (sql, params) => (await ctx.db.query(sql, params)).rows[0].n;
const assertFailedSafely = (res) => {
  assert.equal(res.status, 500, JSON.stringify(res.body));
  assert.equal(res.body.error.code, 'INTERNAL');
  assert.ok(!JSON.stringify(res.body).includes('b12_test'), 'database error text leaked');
};

test('sale: shift update fails last -> no transaction, no items, stock and shift unchanged', async () => {
  const shiftBefore = (await ctx.db.query("SELECT * FROM public.shifts WHERE cashier_email = $1 AND status = 'open'", [marked.email])).rows[0];
  const res = await ctx.api('post', '/api/sales', marked.token).send(sale([{ product_id: normal.id, quantity: 3 }]));
  assertFailedSafely(res);
  assert.equal((await productRow(ctx, normal.id)).stock_quantity, '10.000');
  assert.equal(await count('SELECT count(*)::int AS n FROM public.transactions WHERE cashier_email = $1', [marked.email]), 0);
  assert.equal(await count('SELECT count(*)::int AS n FROM public.transaction_items WHERE product_id = $1', [normal.id]), 0);
  const shiftAfter = (await ctx.db.query('SELECT * FROM public.shifts WHERE id = $1', [shiftBefore.id])).rows[0];
  assert.equal(shiftAfter.total_revenue, shiftBefore.total_revenue);
  assert.equal(shiftAfter.total_transactions, shiftBefore.total_transactions);
});

test('shift close: the update fails -> the shift stays open', async () => {
  const shift = (await ctx.db.query("SELECT id FROM public.shifts WHERE cashier_email = $1 AND status = 'open'", [marked.email])).rows[0];
  assertFailedSafely(await ctx.api('post', `/api/shifts/${shift.id}/close`, marked.token).send({ declared_cash: '5.00' }));
  const after = (await ctx.db.query('SELECT status, declared_cash, end_time FROM public.shifts WHERE id = $1', [shift.id])).rows[0];
  assert.deepEqual(after, { status: 'open', declared_cash: null, end_time: null });
});

test('return: audit insert fails last -> no return, no restock', async () => {
  const p = await createProduct(ctx, { name: `ret${MARK}`, stock: '4' });
  const res = await ctx.api('post', '/api/returns', admin.token).send({
    items: [{ product_id: normal.id, quantity: 1, unit_price: '2.00', condition: 'good' }, { product_id: p.id, quantity: 2, unit_price: '1.00', condition: 'good' }],
    refund_method: 'cash',
  });
  assertFailedSafely(res);
  assert.equal(await count('SELECT count(*)::int AS n FROM public.returns WHERE cashier_email = $1', [admin.email]), 0);
  assert.equal((await productRow(ctx, p.id)).stock_quantity, '4.000');
  assert.equal((await productRow(ctx, normal.id)).stock_quantity, '10.000', 'the first line was committed');
  assert.equal(await count('SELECT count(*)::int AS n FROM public.stock_adjustments WHERE product_id = ANY($1)', [[p.id, normal.id]]), 0);
});

test('inventory update: one failing row undoes every row, prices included', async () => {
  const p = await createProduct(ctx, { name: `inv${MARK}`, stock: '4', price: '3.00' });
  const res = await ctx.api('post', '/api/inventory/update', admin.token).send({
    reason: 'count',
    updates: [{ product_id: normal.id, stock_quantity: 50, selling_price: '9.00' }, { product_id: p.id, stock_quantity: 9, selling_price: '7.00' }],
  });
  assertFailedSafely(res);
  const [n, m] = [await productRow(ctx, normal.id), await productRow(ctx, p.id)];
  assert.deepEqual([n.stock_quantity, n.selling_price, m.stock_quantity, m.selling_price], ['10.000', '2.00', '4.000', '3.00']);
});

test('bulk stock and product PATCH: audit insert fails -> nothing changes', async () => {
  const p = await createProduct(ctx, { name: `bulk${MARK}`, stock: '4' });
  assertFailedSafely(await ctx.api('post', '/api/inventory/bulk-stock', admin.token)
    .send({ product_ids: [normal.id, p.id], mode: 'add', value: 5, reason: 'delivery' }));
  assert.equal((await productRow(ctx, normal.id)).stock_quantity, '10.000');
  assert.equal((await productRow(ctx, p.id)).stock_quantity, '4.000');

  assertFailedSafely(await ctx.api('patch', `/api/entities/Product/${p.id}`, admin.token).send({ stock_quantity: 1, selling_price: '0.50' }));
  const after = await productRow(ctx, p.id);
  assert.deepEqual([after.stock_quantity, after.selling_price], ['4.000', '2.50']);
});
