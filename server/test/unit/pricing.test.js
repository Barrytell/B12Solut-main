import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMoney } from '../../src/lib/money.js';
import { priceSale, saleSchema } from '../../src/routes/sales.js';
import { priceReturn } from '../../src/routes/returns.js';

const usd = createMoney('USD');
const products = new Map([
  ['a', { id: 'a', name: 'Apple', sku: 'A1', selling_price: '2.99', wholesale_price: '0.00', cost_price: '1.20', tax_rate: '7.50', stock_quantity: '10.000' }],
  ['b', { id: 'b', name: 'Bread', sku: 'B1', selling_price: '2.00', wholesale_price: '1.50', cost_price: '1.00', tax_rate: '0.00', stock_quantity: '10.000' }],
]);
const lines = [{ product_id: 'a', quantity: '3.000' }, { product_id: 'b', quantity: '2.000' }];

test('retail sale: database prices, per-line rounding, exact totals', () => {
  const { items, totals } = priceSale({ money: usd, saleType: 'retail', lines, products, discount: '0.64', paymentMethod: 'cash', amountPaid: '20.00' });
  assert.deepEqual(items[0], {
    line_no: 1, product_id: 'a', product_name: 'Apple', sku: 'A1', quantity: '3.000', unit_price: '2.99',
    cost_price: '1.20', tax_rate: '7.50', tax_amount: '0.67', line_total: '9.64',
  });
  assert.equal(items[1].unit_price, '2.00'); // retail ignores the wholesale price
  assert.deepEqual(totals, {
    subtotal: '12.97', tax_total: '0.67', discount_amount: '0.64', grand_total: '13.00',
    total_cost: '5.60', gross_profit: '7.40', amount_paid: '20.00', change_given: '7.00',
  });
});

test('wholesale uses wholesale_price when set, otherwise the retail price', () => {
  const { items, totals } = priceSale({ money: usd, saleType: 'wholesale', lines, products, discount: '0', paymentMethod: 'card' });
  assert.equal(items[0].unit_price, '2.99'); // no wholesale price -> retail
  assert.equal(items[1].unit_price, '1.50');
  assert.equal(totals.grand_total, '12.64'); // 8.97 + 0.67 + 3.00
  assert.equal(totals.amount_paid, '12.64'); // card is charged exactly the total
  assert.equal(totals.change_given, '0.00');
});

test('cash short and oversized discount are refused', () => {
  assert.throws(() => priceSale({ money: usd, saleType: 'retail', lines, products, discount: '0', paymentMethod: 'cash', amountPaid: '13.63' }), /less than the total/);
  assert.throws(() => priceSale({ money: usd, saleType: 'retail', lines, products, discount: '0', paymentMethod: 'cash' }), /cash received/);
  assert.throws(() => priceSale({ money: usd, saleType: 'retail', lines, products, discount: '13.65', paymentMethod: 'card' }), /Discount/);
});

test('sale body accepts no prices, costs or totals from the browser (T9)', () => {
  const schema = saleSchema(usd);
  const base = {
    client_request_id: '7c9e6679-7425-40de-944b-e07fc1f90ae7', sale_type: 'retail',
    items: [{ product_id: 'a', quantity: 1 }], payment_method: 'card',
  };
  assert.ok(schema.safeParse(base).success);
  for (const tampered of [
    { ...base, items: [{ product_id: 'a', quantity: 1, unit_price: 0.01 }] },
    { ...base, items: [{ product_id: 'a', quantity: 1, cost_price: 0 }] },
    { ...base, grand_total: 0.01 },
    { ...base, subtotal: 1 },
    { ...base, items: [{ product_id: 'a', quantity: 0 }] },
    { ...base, items: [{ product_id: 'a', quantity: -1 }] },
    { ...base, discount_amount: -5 },
    { ...base, client_request_id: 'not-a-uuid' },
  ]) assert.equal(schema.safeParse(tampered).success, false, JSON.stringify(tampered));
});

test('returns: refund, cost recovered/lost and profit impact (utils/returns.js formulas)', () => {
  const p = new Map([
    ['x', { id: 'x', name: 'Shirt', sku: 'S', cost_price: '4.00' }],
    ['y', { id: 'y', name: 'Mug', sku: 'M', cost_price: '3.00' }],
  ]);
  const { items, totals } = priceReturn(usd, [
    { product_id: 'x', quantity: '2.000', unit_price: '9.99', condition: 'good' },
    { product_id: 'y', quantity: '1.000', unit_price: '5.00', condition: 'damaged' },
  ], p);
  assert.equal(items[0].refund_amount, '19.98');
  assert.equal(items[0].cost_recovered, '8.00');
  assert.equal(items[0].profit_impact, '-11.98');
  assert.equal(items[0].restocked, true);
  assert.equal(items[1].cost_lost, '3.00');
  assert.equal(items[1].profit_impact, '-5.00');
  assert.deepEqual(totals, { total_refund: '24.98', total_cost_recovered: '8.00', total_cost_lost: '3.00', profit_impact: '-16.98' });
});
