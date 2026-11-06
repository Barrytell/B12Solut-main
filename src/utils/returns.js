import { fromCents, lineAmount, sumBy } from '@/lib/money';

// Return preview calculations (exact cents). The server recomputes the same
// figures from database costs when the return is processed (POST /api/returns),
// and applies the stock changes and audit rows itself.

export function calcReturnItem(item) {
  const quantity = item.quantity || 0;
  const refund = lineAmount(item.unit_price || 0, quantity);
  const cost = lineAmount(item.cost_price || 0, quantity);
  const restocked = item.condition === 'good';
  const costRecovered = restocked ? cost : 0n;
  const costLost = restocked ? 0n : cost;

  // Good stock goes back on the shelf, so only the sale's profit is reversed.
  // Damaged stock is written off, so the refund and the cost of the goods are both lost.
  const profitImpact = -(refund - costRecovered);

  return {
    ...item,
    refund_amount: fromCents(refund),
    restocked,
    cost_recovered: fromCents(costRecovered),
    cost_lost: fromCents(costLost),
    profit_impact: fromCents(profitImpact),
  };
}

export function calcReturnTotals(items) {
  return {
    total_refund: sumBy(items, (i) => i.refund_amount),
    total_cost_recovered: sumBy(items, (i) => i.cost_recovered),
    total_cost_lost: sumBy(items, (i) => i.cost_lost),
    profit_impact: sumBy(items, (i) => i.profit_impact),
  };
}

export function makeReturnItem(product) {
  return calcReturnItem({
    product_id: product.id,
    product_name: product.name,
    sku: product.sku || '',
    quantity: 1,
    unit_price: product.selling_price || 0,
    cost_price: product.cost_price || 0,
    condition: 'good',
  });
}
