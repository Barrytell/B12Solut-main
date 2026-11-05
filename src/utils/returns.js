import { base44 } from '@/api/base44Client';
import { getUserName } from '@/utils/userName';

// Shared calculations for processing product returns.

export function calcReturnItem(item) {
  const quantity = item.quantity || 0;
  const unitPrice = item.unit_price || 0;
  const costPrice = item.cost_price || 0;

  const refundAmount = unitPrice * quantity;
  const restocked = item.condition === 'good';
  const costRecovered = restocked ? costPrice * quantity : 0;
  const costLost = restocked ? 0 : costPrice * quantity;

  // Good stock goes back on the shelf, so only the sale's profit is reversed.
  // Damaged stock is written off, so the refund and the cost of the goods are both lost.
  const profitImpact = -(refundAmount - costRecovered);

  return {
    ...item,
    refund_amount: refundAmount,
    restocked,
    cost_recovered: costRecovered,
    cost_lost: costLost,
    profit_impact: profitImpact,
  };
}

export function calcReturnTotals(items) {
  return items.reduce(
    (totals, item) => ({
      total_refund: totals.total_refund + (item.refund_amount || 0),
      total_cost_recovered: totals.total_cost_recovered + (item.cost_recovered || 0),
      total_cost_lost: totals.total_cost_lost + (item.cost_lost || 0),
      profit_impact: totals.profit_impact + (item.profit_impact || 0),
    }),
    { total_refund: 0, total_cost_recovered: 0, total_cost_lost: 0, profit_impact: 0 }
  );
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

export function makeReturnNumber() {
  return `RT-${Date.now().toString(36).toUpperCase()}`;
}

// Applies a processed return to inventory:
// good items go back on the shelf (+quantity), damaged items are written off
// and the stock count is left untouched. Stock is read live so counts never drift.
export async function applyReturnStock(items, { returnNumber, user }) {
  let restockedUnits = 0;
  let writtenOffUnits = 0;

  for (const item of items) {
    const product = await base44.entities.Product.get(item.product_id);
    const previous = product?.stock_quantity || 0;
    const restock = item.condition === 'good';
    const next = restock ? previous + item.quantity : previous;

    if (restock) {
      await base44.entities.Product.update(item.product_id, { stock_quantity: next });
      restockedUnits += item.quantity;
    } else {
      writtenOffUnits += item.quantity;
    }

    await base44.entities.StockAdjustment.create({
      product_id: item.product_id,
      product_name: item.product_name,
      sku: item.sku,
      previous_quantity: previous,
      new_quantity: next,
      delta: restock ? item.quantity : 0,
      reason: restock
        ? `Customer return restocked (${returnNumber})`
        : `Customer return written off — damaged, not restocked (${returnNumber})`,
      user_email: user?.email,
      user_name: getUserName(user),
    });
  }

  return { restockedUnits, writtenOffUnits };
}