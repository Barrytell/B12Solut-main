// D3 stock auditing, returns (D2), inventory endpoints, T6 mixed concurrency (staging).
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanup, createProduct, createUser, productRow, sale, setup, startShift } from './helpers.js';

let ctx; let admin; let cashier;

before(async () => {
  ctx = await setup('stock');
  admin = await createUser(ctx, 'admin');
  cashier = await createUser(ctx, 'user');
  await startShift(ctx, cashier.token);
});
after(() => cleanup(ctx));

const audits = async (productId) => (await ctx.db.query(
  'SELECT previous_quantity, new_quantity, delta, reason, user_email FROM public.stock_adjustments WHERE product_id = $1 ORDER BY created_date, id',
  [productId])).rows;

test('D3: product create and product-form stock edits are audited', async () => {
  const created = await ctx.api('post', '/api/entities/Product', admin.token)
    .send({ name: `${ctx.P}form`, sku: `${ctx.P}F`, selling_price: '2.00', stock_quantity: 7 });
  assert.equal(created.status, 201, JSON.stringify(created.body));
  assert.equal(created.body.stock_quantity, 7);
  const edit = await ctx.api('patch', `/api/entities/Product/${created.body.id}`, admin.token).send({ stock_quantity: 4, name: `${ctx.P}form2` });
  assert.equal(edit.status, 200);
  assert.deepEqual((await audits(created.body.id)).map((a) => [a.previous_quantity, a.new_quantity, a.delta, a.reason]), [
    ['0.000', '7.000', '7.000', 'Initial stock (product created)'],
    ['7.000', '4.000', '-3.000', 'Stock edited in product form'],
  ]);
  const badCat = await ctx.api('post', '/api/entities/Product', admin.token).send({ name: `${ctx.P}x`, sku: 'x', selling_price: 1, category: `${ctx.P}nope` });
  assert.equal(badCat.status, 400);
  assert.equal(badCat.body.error.code, 'UNKNOWN_CATEGORY');
});

test('inventory update: reason required for stock changes, all-or-nothing, audited', async () => {
  const a = await createProduct(ctx, { name: 'invA', stock: '5', price: '1.00' });
  const b = await createProduct(ctx, { name: 'invB', stock: '5', price: '1.00' });
  const noReason = await ctx.api('post', '/api/inventory/update', admin.token).send({ updates: [{ product_id: a.id, stock_quantity: 9 }] });
  assert.equal(noReason.status, 400);
  const missing = await ctx.api('post', '/api/inventory/update', admin.token)
    .send({ reason: 'count', updates: [{ product_id: a.id, stock_quantity: 9 }, { product_id: `${ctx.P}missing`, stock_quantity: 1 }] });
  assert.equal(missing.status, 404);
  assert.equal((await productRow(ctx, a.id)).stock_quantity, '5.000', 'partial update was committed');

  const ok = await ctx.api('post', '/api/inventory/update', admin.token)
    .send({ reason: 'Stock count', updates: [{ product_id: a.id, stock_quantity: 9, selling_price: '1.25' }, { product_id: b.id, cost_price: '0.40' }] });
  assert.equal(ok.status, 200);
  assert.equal((await productRow(ctx, a.id)).selling_price, '1.25');
  assert.equal((await productRow(ctx, b.id)).cost_price, '0.40');
  assert.deepEqual((await audits(a.id)).map((r) => [r.delta, r.reason, r.user_email]), [['4.000', 'Stock count', admin.email]]);
  assert.equal((await audits(b.id)).length, 0, 'price-only change was logged as a stock change');
});

test('bulk stock: set / add / subtract (clamped at 0), audited', async () => {
  const p = await createProduct(ctx, { name: 'bulkA', stock: '3' });
  const q = await createProduct(ctx, { name: 'bulkB', stock: '10' });
  const sub = await ctx.api('post', '/api/inventory/bulk-stock', admin.token).send({ product_ids: [p.id, q.id], mode: 'subtract', value: 5, reason: 'shrink' });
  assert.equal(sub.status, 200);
  assert.equal((await productRow(ctx, p.id)).stock_quantity, '0.000');
  assert.equal((await productRow(ctx, q.id)).stock_quantity, '5.000');
  await ctx.api('post', '/api/inventory/bulk-stock', admin.token).send({ product_ids: [p.id], mode: 'set', value: 12, reason: 'recount' });
  assert.equal((await productRow(ctx, p.id)).stock_quantity, '12.000');
  assert.equal((await audits(p.id)).length, 2);
  assert.equal((await ctx.api('post', '/api/inventory/bulk-stock', admin.token).send({ product_ids: [p.id], mode: 'set', value: 1 })).status, 400);
});

test('returns (admin only): good items restocked, damaged written off, every line audited', async () => {
  const good = await createProduct(ctx, { name: 'retGood', stock: '2', cost: '4.00' });
  const bad = await createProduct(ctx, { name: 'retBad', stock: '2', cost: '3.00' });
  const body = {
    items: [
      { product_id: good.id, quantity: 2, unit_price: '9.99', condition: 'good' },
      { product_id: bad.id, quantity: 1, unit_price: '5.00', condition: 'damaged' },
    ],
    refund_method: 'cash', reason: 'faulty', original_transaction_number: 'TX-TYPO',
  };
  assert.equal((await ctx.api('post', '/api/returns', cashier.token).send(body)).status, 403);
  const res = await ctx.api('post', '/api/returns', admin.token).send(body);
  assert.equal(res.status, 201, JSON.stringify(res.body));
  assert.equal(res.body.return.total_refund, 24.98);
  assert.equal(res.body.return.profit_impact, -16.98);
  assert.equal(res.body.restocked_units, 2);
  assert.equal(res.body.written_off_units, 1);
  assert.equal((await productRow(ctx, good.id)).stock_quantity, '4.000');
  assert.equal((await productRow(ctx, bad.id)).stock_quantity, '2.000');
  assert.match((await audits(good.id))[0].reason, /^Customer return restocked \(RT-/);
  const written = (await audits(bad.id))[0];
  assert.equal(written.delta, '0.000');
  assert.match(written.reason, /written off/);
});

test('T6: concurrent sales + bulk add + return on one product end at the exact expected stock', async () => {
  const p = await createProduct(ctx, { name: 'mixed', stock: '100', price: '1.00' });
  const ops = [
    ...Array.from({ length: 10 }, () => ctx.api('post', '/api/sales', cashier.token).send(sale([{ product_id: p.id, quantity: 2 }]))),
    ctx.api('post', '/api/inventory/bulk-stock', admin.token).send({ product_ids: [p.id], mode: 'add', value: 30, reason: 'delivery' }),
    ctx.api('post', '/api/returns', admin.token).send({ items: [{ product_id: p.id, quantity: 5, unit_price: '1.00', condition: 'good' }], refund_method: 'cash' }),
  ];
  const results = await Promise.all(ops);
  assert.ok(results.every((r) => r.status < 300), results.map((r) => `${r.status}:${r.body?.error?.code ?? ''}`).join(' '));
  assert.equal((await productRow(ctx, p.id)).stock_quantity, '115.000'); // 100 - 20 + 30 + 5
  const rows = await audits(p.id);
  assert.equal(rows.length, 2); // bulk add + return; sales are recorded as transaction lines
  for (const r of rows) assert.equal(Number(r.new_quantity) - Number(r.previous_quantity), Number(r.delta));
});

test('categories: delete blocked while in use', async () => {
  const cat = await ctx.api('post', '/api/entities/Category', admin.token).send({ name: `${ctx.P}tea` });
  assert.equal(cat.status, 201);
  await ctx.api('post', '/api/entities/Product', admin.token).send({ name: `${ctx.P}teabag`, sku: `${ctx.P}T`, selling_price: 1, category: `${ctx.P}tea` });
  const del = await ctx.api('delete', `/api/entities/Category/${cat.body.id}`, admin.token);
  assert.equal(del.status, 409);
  assert.equal(del.body.error.code, 'CATEGORY_IN_USE');
});
