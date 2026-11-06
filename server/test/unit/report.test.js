import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMoney } from '../../src/lib/money.js';
import { createFormat, esc, percent } from '../../src/lib/format.js';
import { buildReportData, renderShiftPdf, shiftReportEmail } from '../../src/reports/shiftReport.js';
import { lowStockEmail } from '../../src/email.js';

const money = createMoney('USD');
const fmt = createFormat({ currency: 'USD', timeZone: 'Africa/Lagos' });
const shift = {
  id: 'shift-abc123', cashier_email: 'c@x.test', cashier_name: 'Cal <b>', status: 'closed',
  start_time: new Date('2026-11-06T08:00:00Z'), end_time: new Date('2026-11-06T16:30:00Z'),
  total_cash_sales: '100.10', total_card_sales: '50.00', total_electronic_sales: '0.00',
  total_revenue: '150.10', total_transactions: 3, total_cost: '90.00', total_profit: '60.10',
  declared_cash: '100.00', report_path: null,
};
const transactions = [
  { id: 't1', transaction_number: 'TX-1', payment_method: 'cash', grand_total: '100.10', created_date: new Date('2026-11-06T09:00:00Z') },
  { id: 't2', transaction_number: 'TX-2', payment_method: 'card', grand_total: '50.00', created_date: new Date('2026-11-06T10:00:00Z') },
];
const items = [
  { transaction_id: 't1', product_name: 'Rice', sku: 'R', quantity: '2.000', line_total: '100.10', cost_price: '30.00' },
  { transaction_id: 't2', product_name: 'Oil', sku: 'O', quantity: '1.000', line_total: '50.00', cost_price: '30.00' },
];

test('report figures come only from the database rows, exactly', () => {
  const d = buildReportData(money, shift, transactions, items);
  assert.equal(d.summary.variance, '-0.10'); // declared 100.00 vs expected 100.10
  assert.equal(d.summary.margin, '40.0%');   // 60.10 / 150.10
  assert.equal(d.summary.avgTransaction, '50.03'); // 150.10 / 3 = 50.0333
  assert.equal(d.summary.durationMins, 510);
  assert.deepEqual(d.topProducts.map((p) => [p.name, p.revenue, p.cost, p.profit]), [['Rice', '100.10', '60.00', '40.10'], ['Oil', '50.00', '30.00', '20.00']]);
  assert.equal(d.transactions[0].itemCount, 1);
});

test('PDF renders in Node (jsPDF) and is a real PDF', () => {
  const pdf = renderShiftPdf(buildReportData(money, shift, transactions, items), { storeName: 'B12 Store', storeAddress: '1 Road' }, fmt);
  assert.ok(Buffer.isBuffer(pdf));
  assert.equal(pdf.subarray(0, 5).toString(), '%PDF-');
  assert.ok(pdf.length > 2000);
});

test('emails escape every interpolated value (XSS)', () => {
  const store = { storeName: '<script>alert(1)</script>', storeAddress: '"><img src=x onerror=alert(1)>' };
  const { html } = shiftReportEmail(buildReportData(money, shift, transactions, items), store, fmt, 'https://app.example');
  assert.ok(!html.includes('<script>alert(1)</script>'));
  assert.ok(!html.includes('<img src=x'));
  assert.ok(html.includes('Cal &lt;b&gt;'));
  assert.ok(html.includes('Short by') === false && html.includes('-$0.10 short'));
  const low = lowStockEmail([{ name: '<b>Tea</b>', sku: 'T&1', newQty: 2, threshold: 10 }], 'https://app.example');
  assert.ok(low.html.includes('&lt;b&gt;Tea&lt;/b&gt;') && low.html.includes('T&amp;1'));
});

test('format helpers', () => {
  assert.equal(esc(`<a href="x">'&'</a>`), '&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;');
  assert.equal(percent('1.00', '3.00'), '33.3%');
  assert.equal(percent('-1.00', '8.00'), '-12.5%');
  assert.equal(percent('5.00', '0.00'), '0.0%');
  assert.equal(fmt.money('1234.5'), '$1,234.50');
  assert.equal(fmt.time('2026-11-06T08:00:00Z'), '9:00 AM'); // Lagos = UTC+1
});
