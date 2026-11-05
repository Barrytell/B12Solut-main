/**
 * Demand forecasting utilities using weighted moving average over weekly buckets.
 * More recent weeks are weighted more heavily.
 */

/**
 * Groups transaction items by product and week, then computes:
 * - avg weekly demand (weighted, recent weeks 3x heavier)
 * - trend (growing / stable / declining)
 * - suggested reorder threshold (buffer = 1.5x avg weekly demand)
 */
export function computeForecast(transactions, products) {
  // Build a map of productId -> { weekKey -> totalQtySold }
  const salesMap = {}; // { productId: { weekKey: qty } }

  for (const tx of transactions) {
    if (!tx.items || tx.status === 'voided' || tx.status === 'refunded') continue;
    const txDate = tx.created_date ? new Date(tx.created_date) : null;
    if (!txDate) continue;
    const weekKey = getWeekKey(txDate);

    for (const item of tx.items) {
      if (!item.product_id) continue;
      if (!salesMap[item.product_id]) salesMap[item.product_id] = {};
      salesMap[item.product_id][weekKey] =
        (salesMap[item.product_id][weekKey] || 0) + (item.quantity || 0);
    }
  }

  const now = new Date();
  // Generate last 8 week keys (most recent first)
  const recentWeeks = Array.from({ length: 8 }, (_, i) => {
    const d = new Date(now);
    d.setDate(d.getDate() - i * 7);
    return getWeekKey(d);
  });

  const results = [];

  for (const product of products) {
    if (product.is_active === false) continue;
    const productSales = salesMap[product.id] || {};

    // Collect weekly quantities for the past 8 weeks (index 0 = most recent)
    const weeklySales = recentWeeks.map(wk => productSales[wk] || 0);

    // Weighted moving average: recent weeks get higher weight
    // weights: [8,7,6,5,4,3,2,1] (index 0 = most recent week, weight 8)
    const weights = [8, 7, 6, 5, 4, 3, 2, 1];
    const totalWeight = weights.reduce((s, w) => s + w, 0);
    const weightedAvg = weeklySales.reduce((sum, qty, i) => sum + qty * weights[i], 0) / totalWeight;

    // Trend: compare first 4 weeks vs last 4 weeks
    const recentHalf = weeklySales.slice(0, 4).reduce((s, v) => s + v, 0);
    const olderHalf = weeklySales.slice(4).reduce((s, v) => s + v, 0);
    let trend = 'stable';
    if (olderHalf > 0) {
      const changeRatio = (recentHalf - olderHalf) / olderHalf;
      if (changeRatio > 0.2) trend = 'growing';
      else if (changeRatio < -0.2) trend = 'declining';
    } else if (recentHalf > 0) {
      trend = 'growing';
    }

    // Suggested threshold = ceil(avg weekly demand * 1.5), min 5, max 200
    const suggestedThreshold = Math.min(200, Math.max(5, Math.ceil(weightedAvg * 1.5)));
    const currentThreshold = product.low_stock_threshold || 10;
    const totalSold = weeklySales.reduce((s, v) => s + v, 0);
    const hasData = totalSold > 0;

    results.push({
      product,
      weeklySales,          // [most recent ... oldest]
      weightedAvgPerWeek: weightedAvg,
      trend,
      suggestedThreshold,
      currentThreshold,
      hasData,
      totalSold,
      thresholdDelta: suggestedThreshold - currentThreshold,
    });
  }

  // Sort: products with data first, then by abs delta desc
  results.sort((a, b) => {
    if (a.hasData !== b.hasData) return a.hasData ? -1 : 1;
    return Math.abs(b.thresholdDelta) - Math.abs(a.thresholdDelta);
  });

  return results;
}

function getWeekKey(date) {
  // ISO week: year-W## format
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}