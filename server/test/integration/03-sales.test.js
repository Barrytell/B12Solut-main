// T5 concurrent sales, T8 idempotency, T9 price integrity, T21 money at volume (staging).
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanup, createProduct, createUser, productRow, sale, setup, startShift } from './helpers.js';

let ctx; let cashierA; let cashierB;

before(async () => {
  ctx = await setup('sales');
  cashierA = await createUser(ctx, 'user');
  cashierB = await createUser(ctx, 'user');
  await startShift(ctx, cashierA.token);
  await startShift(ctx, cashierB.token);
});
after(() => cleanup(ctx));

const shiftOf = async (email) => (await ctx.db.query("SELECT * FROM public.shifts WHERE cashier_email = $1 AND status = 'open'", [email])).rows[0];

test('T5: 20 parallel sales of 1 unit against stock 5 -> exactly 5 succeed, stock never negative', async () => {
  const p = await createProduct(ctx, { name: 'scarce', stock: '5', price: '3.10', cost: '1.25', tax: '7.50' });
  const results = await Promise.all(Array.from({ length: 20 }, (_, i) =>
    ctx.api('post', '/api/sales', i % 2 ? cashierB.token : cashierA.token)
      .send(sale([{ product_id: p.id, quantity: 1 }]))));

  const ok = results.filter((r) => r.status === 201);
  const refused = results.filter((r) => r.status === 409);
  assert.equal(ok.length, 5, `statuses: ${results.map((r) => r.status).join(',')}`);
  assert.equal(refused.length, 15);
  assert.ok(refused.every((r) => r.body.error.code === 'INSUFFICIENT_STOCK'));
  assert.equal((await productRow(ctx, p.id)).stock_quantity, '0.000');

  const tx = await ctx.db.query(
    `SELECT t.* FROM public.transactions t JOIN public.transaction_items i ON i.transaction_id = t.id WHERE i.product_id = $1`, [p.id]);
  assert.equal(tx.rowCount, 5);
  // 3.10 + 7.5% tax (0.2325 -> 0.23) = 3.33 per sale
  assert.ok(tx.rows.every((t) => t.grand_total === '3.33'));
  const sums = await ctx.db.query(
    `SELECT s.cashier_email, s.total_revenue, s.total_transactions,
            (SELECT COALESCE(SUM(grand_total), 0) FROM public.transactions WHERE shift_id = s.id) AS tx_sum
       FROM public.shifts s WHERE s.cashier_email = ANY($1) AND s.status = 'open'`, [[cashierA.email, cashierB.email]]);
  for (const s of sums.rows) assert.equal(s.total_revenue, s.tx_sum, `shift total drifted for ${s.cashier_email}`);
});

test('T8: the same checkout sent twice (sequential and concurrent) is charged once', async () => {
  const p = await createProduct(ctx, { name: 'idem', stock: '10', price: '4.00' });
  const body = sale([{ product_id: p.id, quantity: 2 }]);
  const first = await ctx.api('post', '/api/sales', cashierA.token).send(body);
  const again = await ctx.api('post', '/api/sales', cashierA.token).send(body);
  assert.equal(first.status, 201);
  assert.equal(again.status, 200);
  assert.equal(again.body.replayed, true);
  assert.equal(again.body.transaction.id, first.body.transaction.id);
  assert.equal((await productRow(ctx, p.id)).stock_quantity, '8.000');

  const twin = sale([{ product_id: p.id, quantity: 1 }]);
  const pair = await Promise.all([1, 2].map(() => ctx.api('post', '/api/sales', cashierA.token).send(twin)));
  assert.deepEqual(pair.map((r) => r.status).sort(), [200, 201]);
  assert.equal(pair[0].body.transaction.id, pair[1].body.transaction.id);
  assert.equal((await productRow(ctx, p.id)).stock_quantity, '7.000');

  const stolen = await ctx.api('post', '/api/sales', cashierB.token).send(body);
  assert.equal(stolen.status, 409);
  assert.equal(stolen.body.error.code, 'REQUEST_ID_CONFLICT');
});

test('T9: prices, costs and totals come from the database, never the request', async () => {
  const p = await createProduct(ctx, { name: 'tamper', stock: '10', price: '9.99', cost: '5.00' });
  for (const bad of [
    sale([{ product_id: p.id, quantity: 1, unit_price: 0.01 }]),
    sale([{ product_id: p.id, quantity: 1 }], { grand_total: 0.01 }),
    sale([{ product_id: p.id, quantity: 1 }], { discount_amount: 20 }),
    sale([{ product_id: p.id, quantity: 1 }], { payment_method: 'cash', amount_paid: 1 }),
  ]) {
    const res = await ctx.api('post', '/api/sales', cashierA.token).send(bad);
    assert.ok([400, 409].includes(res.status), `${JSON.stringify(bad)} -> ${res.status}`);
  }
  const ok = await ctx.api('post', '/api/sales', cashierA.token).send(sale([{ product_id: p.id, quantity: 1 }], { payment_method: 'cash', amount_paid: 20 }));
  assert.equal(ok.status, 201);
  assert.equal(ok.body.transaction.grand_total, 9.99);
  assert.equal(ok.body.transaction.change_given, 10.01);
  assert.equal(ok.body.transaction.items[0].cost_price, 5);
  assert.equal((await productRow(ctx, p.id)).stock_quantity, '9.000');
});

test('wholesale price rule and low-stock alert after commit', async () => {
  const p = await createProduct(ctx, { name: 'bulk', stock: '12', price: '5.00', wholesale: '4.00', threshold: '10' });
  const res = await ctx.api('post', '/api/sales', cashierA.token)
    .send(sale([{ product_id: p.id, quantity: 3 }], { sale_type: 'wholesale', customer_name: 'Acme' }));
  assert.equal(res.status, 201);
  assert.match(res.body.transaction.transaction_number, /^WS-/);
  assert.equal(res.body.transaction.grand_total, 12);
  assert.equal(res.body.transaction.customer_name, 'Acme');
  assert.deepEqual(res.body.low_stock_alerts.map((a) => [a.name, a.newQty]), [[p.name, 9]]);
});

test('no open shift -> 409', async () => {
  const lone = await createUser(ctx, 'user');
  const p = await createProduct(ctx, { name: 'noshift' });
  const res = await ctx.api('post', '/api/sales', lone.token).send(sale([{ product_id: p.id, quantity: 1 }]));
  assert.equal(res.status, 409);
  assert.equal(res.body.error.code, 'NO_OPEN_SHIFT');
});

test('T21: many random sales stay exact (lines, totals and shift balances checked in SQL)', { timeout: 30 * 60_000 }, async () => {
  const count = Number(process.env.TEST_SALES_COUNT || 1000);
  const workers = await Promise.all(Array.from({ length: 5 }, () => createUser(ctx, 'user')));
  await Promise.all(workers.map((w) => startShift(ctx, w.token)));
  const products = await Promise.all([
    createProduct(ctx, { name: 'm1', stock: '1000000', price: '0.10', cost: '0.03', tax: '7.50' }),
    createProduct(ctx, { name: 'm2', stock: '1000000', price: '19.99', cost: '12.49', tax: '12.50' }),
    createProduct(ctx, { name: 'm3', stock: '1000000', price: '3.33', cost: '1.11', tax: '0' }),
  ]);
  let seed = 7;
  const rand = (n) => { seed = (seed * 1103515245 + 12345) % 2 ** 31; return seed % n; };

  await Promise.all(workers.map(async (w, wi) => {
    for (let i = wi; i < count; i += workers.length) {
      const items = products.filter(() => rand(2)).map((p) => ({ product_id: p.id, quantity: 1 + rand(3) }));
      if (!items.length) items.push({ product_id: products[0].id, quantity: 1 });
      const res = await ctx.api('post', '/api/sales', w.token).send(sale(items, { payment_method: ['cash', 'card', 'electronic'][rand(3)], amount_paid: 1000 }));
      assert.equal(res.status, 201, JSON.stringify(res.body));
    }
  }));

  const emails = workers.map((w) => w.email);
  const lineErrors = await ctx.db.query(
    `SELECT i.id FROM public.transaction_items i JOIN public.transactions t ON t.id = i.transaction_id
      WHERE t.cashier_email = ANY($1)
        AND (i.tax_amount <> ROUND(i.unit_price * i.quantity * i.tax_rate / 100, 2)
          OR i.line_total <> ROUND(i.unit_price * i.quantity, 2) + i.tax_amount)`, [emails]);
  assert.equal(lineErrors.rowCount, 0, 'line rounding differs from Postgres ROUND');
  const totalErrors = await ctx.db.query(
    `SELECT t.id FROM public.transactions t
      WHERE t.cashier_email = ANY($1)
        AND (t.subtotal + t.tax_total <> (SELECT SUM(line_total) FROM public.transaction_items WHERE transaction_id = t.id)
          OR t.grand_total <> t.subtotal + t.tax_total - t.discount_amount
          OR t.gross_profit <> t.grand_total - t.total_cost
          OR t.change_given <> t.amount_paid - t.grand_total)`, [emails]);
  assert.equal(totalErrors.rowCount, 0, 'transaction totals do not add up');
  const shiftErrors = await ctx.db.query(
    `SELECT s.id FROM public.shifts s
      WHERE s.cashier_email = ANY($1) AND (
        s.total_revenue <> (SELECT COALESCE(SUM(grand_total), 0) FROM public.transactions WHERE shift_id = s.id)
        OR s.total_cost <> (SELECT COALESCE(SUM(total_cost), 0) FROM public.transactions WHERE shift_id = s.id)
        OR s.total_cash_sales <> (SELECT COALESCE(SUM(grand_total), 0) FROM public.transactions WHERE shift_id = s.id AND payment_method = 'cash')
        OR s.total_transactions <> (SELECT count(*) FROM public.transactions WHERE shift_id = s.id))`, [emails]);
  assert.equal(shiftErrors.rowCount, 0, 'shift balances drifted');
  const n = await ctx.db.query('SELECT count(*)::int AS n FROM public.transactions WHERE cashier_email = ANY($1)', [emails]);
  assert.equal(n.rows[0].n, count);
});
