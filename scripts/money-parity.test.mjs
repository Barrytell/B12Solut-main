// The cart total the cashier sees (src/lib/money.js priceCart) must equal what
// the server charges (server/src/routes/sales.js priceSale), or cash payments
// would be refused as short. Random carts, compared exactly.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { priceCart } from '../src/lib/money.js';
import { priceSale } from '../server/src/routes/sales.js';
import { createMoney } from '../server/src/lib/money.js';

const money = createMoney('USD');
let seed = 42;
const rand = (n) => { seed = (seed * 1103515245 + 12345) % 2 ** 31; return seed % n; };
const cents = (max) => (rand(max * 100) / 100).toFixed(2);

test('browser cart pricing equals server sale pricing (2000 random carts)', () => {
  for (let run = 0; run < 2000; run++) {
    const products = new Map();
    const lines = [];
    const cart = [];
    const count = 1 + rand(6);
    for (let i = 0; i < count; i++) {
      const p = {
        id: `p${i}`, name: `P${i}`, sku: `S${i}`,
        selling_price: cents(200), wholesale_price: '0.00', cost_price: cents(100),
        tax_rate: [0, 5, 7.5, 12.5, 15, 20][rand(6)].toFixed(2), stock_quantity: '1000.000',
      };
      const qty = 1 + rand(9);
      products.set(p.id, p);
      lines.push({ product_id: p.id, quantity: `${qty}.000` });
      cart.push({ product_id: p.id, quantity: qty, unit_price: Number(p.selling_price), cost_price: Number(p.cost_price), tax_rate: Number(p.tax_rate) });
    }
    const browser = priceCart(cart, 0);
    const server = priceSale({ money, saleType: 'retail', lines, products, discount: '0', paymentMethod: 'card' }).totals;
    assert.equal(browser.grandTotal, Number(server.grand_total), `run ${run}`);
    assert.equal(browser.subtotal, Number(server.subtotal), `run ${run}`);
    assert.equal(browser.taxTotal, Number(server.tax_total), `run ${run}`);
    assert.equal(browser.totalCost, Number(server.total_cost), `run ${run}`);
  }
});
