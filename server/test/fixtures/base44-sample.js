// Synthetic Base44 export shared by the unit and staging import tests.
/** A small, internally consistent export in Base44's shape. */
export function sampleExport() {
  return {
    User: [
      { id: 'u1', email: 'Owner@Shop.test', full_name: 'Owner', role: 'admin', created_date: '2026-01-01T09:00:00.000Z' },
      { id: 'u2', email: 'cash@shop.test', full_name: 'Cal', display_name: 'Cal', role: 'user', created_date: '2026-01-02T09:00:00.000Z' },
    ],
    Category: [{ id: 'c1', name: 'drinks' }],
    Supplier: [{ id: 's1', name: 'Acme', email: 'acme@x.test' }],
    Product: [
      { id: 'p1', name: 'Cola', sku: 'COLA', category: 'drinks', selling_price: 2.5, cost_price: 1.2, stock_quantity: 40, tax_rate: 10, supplier_id: 's1' },
      { id: 'p2', name: 'Water', sku: 'H2O', selling_price: 1, stock_quantity: 0 },
    ],
    Shift: [{ id: 'sh1', cashier_email: 'cash@shop.test', start_time: '2026-02-01T08:00:00Z', end_time: '2026-02-01T16:00:00Z', status: 'closed',
      total_cash_sales: 5.5, total_card_sales: 0, total_electronic_sales: 0, total_revenue: 5.5, total_transactions: 1, total_cost: 2.4, total_profit: 3.1 }],
    Transaction: [{
      id: 't1', transaction_number: 'TX-1', cashier_email: 'cash@shop.test', shift_id: 'sh1', payment_method: 'cash',
      items: [{ product_id: 'p1', product_name: 'Cola', sku: 'COLA', quantity: 2, unit_price: 2.5, cost_price: 1.2, tax_rate: 10, tax_amount: 0.5, line_total: 5.5 }],
      subtotal: 5, tax_total: 0.5, discount_amount: 0, grand_total: 5.5, total_cost: 2.4, gross_profit: 3.1, amount_paid: 10, change_given: 4.5,
    }],
    Return: [{
      id: 'r1', return_number: 'RT-1', cashier_email: 'owner@shop.test', refund_method: 'cash',
      items: [{ product_id: 'p1', product_name: 'Cola', quantity: 1, unit_price: 2.5, cost_price: 1.2, refund_amount: 2.5, condition: 'good', restocked: true, cost_recovered: 1.2, cost_lost: 0, profit_impact: -1.3 }],
      total_refund: 2.5, total_cost_recovered: 1.2, total_cost_lost: 0, profit_impact: -1.3,
    }],
    StockAdjustment: [{ id: 'a1', product_id: 'p1', product_name: 'Cola', previous_quantity: 41, new_quantity: 40, reason: 'count', user_email: 'owner@shop.test' }],
  };
}
