import { format, startOfDay, endOfDay } from 'date-fns';

// Shared helpers for keeping wholesale (bulk) orders separate from retail sales.

// Wholesale unit price, falling back to the retail price when no wholesale price is set.
export const wholesaleUnitPrice = (product) =>
  product?.wholesale_price > 0 ? product.wholesale_price : (product?.selling_price || 0);

export const isWholesale = (tx) => tx?.sale_type === 'wholesale';

// Anything that isn't explicitly wholesale counts as retail (older records have no sale_type).
export const isRetail = (tx) => !isWholesale(tx);

// Headline totals for a set of wholesale orders.
export function summarizeWholesale(transactions = []) {
  const orders = transactions.filter(t => t.status !== 'voided');
  const revenue = orders.reduce((sum, t) => sum + (t.grand_total || 0), 0);
  const profit = orders.reduce((sum, t) => sum + (t.gross_profit || 0), 0);
  const units = orders.reduce(
    (sum, t) => sum + (t.items || []).reduce((q, i) => q + (i.quantity || 0), 0),
    0
  );

  return {
    orders: orders.length,
    revenue,
    profit,
    units,
    avgOrder: orders.length > 0 ? revenue / orders.length : 0,
    margin: revenue > 0 ? (profit / revenue) * 100 : 0,
  };
}

// Per-product wholesale performance, best sellers first.
export function wholesaleProductTotals(transactions = []) {
  const map = {};
  transactions.forEach(tx => {
    (tx.items || []).forEach(item => {
      const key = item.product_name || '—';
      if (!map[key]) map[key] = { name: key, quantity: 0, revenue: 0, cost: 0 };
      map[key].quantity += item.quantity || 0;
      map[key].revenue += item.line_total || 0;
      map[key].cost += (item.cost_price || 0) * (item.quantity || 0);
    });
  });

  return Object.values(map)
    .map(p => ({
      ...p,
      profit: p.revenue - p.cost,
      margin: p.revenue > 0 ? ((p.revenue - p.cost) / p.revenue) * 100 : 0,
    }))
    .sort((a, b) => b.revenue - a.revenue);
}

// --- Supplier attribution -------------------------------------------------

// product_id -> supplier name, so order lines can be credited to a supplier.
export function buildSupplierIndex(products = [], suppliers = []) {
  const names = {};
  suppliers.forEach(s => { names[s.id] = s.name; });
  const index = {};
  products.forEach(p => { index[p.id] = names[p.supplier_id] || 'Unassigned'; });
  return index;
}

export const supplierNameForItem = (item, supplierIndex) =>
  supplierIndex[item?.product_id] || 'Unassigned';

// Every supplier appearing in wholesale orders, plus all registered suppliers.
export function wholesaleSupplierOptions(transactions = [], supplierIndex = {}, suppliers = []) {
  const set = new Set(suppliers.map(s => s.name).filter(Boolean));
  transactions.forEach(tx =>
    (tx.items || []).forEach(item => set.add(supplierNameForItem(item, supplierIndex)))
  );
  return Array.from(set).sort((a, b) => a.localeCompare(b));
}

// --- Filtering ------------------------------------------------------------

export function filterOrdersByDateRange(transactions = [], range) {
  if (!range?.from) return transactions;
  const from = startOfDay(range.from);
  const to = endOfDay(range.to || new Date());
  return transactions.filter(t => {
    if (!t.created_date) return false;
    const date = new Date(t.created_date);
    return date >= from && date <= to;
  });
}

export function filterOrdersBySupplier(transactions = [], supplierIndex = {}, supplier = 'all') {
  if (!supplier || supplier === 'all') return transactions;
  return transactions.filter(tx =>
    (tx.items || []).some(item => supplierNameForItem(item, supplierIndex) === supplier)
  );
}

// A supplier's share of each order: order totals are recalculated from their own
// lines so performance figures aren't inflated by other suppliers in the same order.
export function scopeOrdersToSupplier(transactions = [], supplierIndex = {}, supplier = 'all') {
  if (!supplier || supplier === 'all') return transactions;
  return transactions
    .map(tx => {
      const items = (tx.items || []).filter(item => supplierNameForItem(item, supplierIndex) === supplier);
      if (items.length === 0) return null;
      const grand_total = items.reduce((sum, i) => sum + (i.line_total || 0), 0);
      const total_cost = items.reduce((sum, i) => sum + (i.cost_price || 0) * (i.quantity || 0), 0);
      return { ...tx, items, grand_total, total_cost, gross_profit: grand_total - total_cost };
    })
    .filter(Boolean);
}

export function dateRangeLabel(range) {
  if (!range?.from) return 'All dates';
  const from = format(range.from, 'MMM d, yyyy');
  return range.to ? `${from} – ${format(range.to, 'MMM d, yyyy')}` : `From ${from}`;
}

// --- Analytics report -----------------------------------------------------

// Deeper figures for a set of wholesale orders: order size, customers, payment mix.
export function wholesaleAnalytics(transactions = []) {
  const orders = transactions.filter(t => t.status !== 'voided');
  const customers = {};
  const payments = {};
  let units = 0;
  let revenue = 0;
  let profit = 0;
  let largestOrder = 0;

  orders.forEach(tx => {
    const total = tx.grand_total || 0;
    const orderUnits = (tx.items || []).reduce((q, i) => q + (i.quantity || 0), 0);

    revenue += total;
    profit += tx.gross_profit || 0;
    units += orderUnits;
    if (total > largestOrder) largestOrder = total;

    const name = (tx.customer_name || '').trim() || 'Unnamed customer';
    if (!customers[name]) customers[name] = { name, orders: 0, units: 0, revenue: 0 };
    customers[name].orders += 1;
    customers[name].units += orderUnits;
    customers[name].revenue += total;

    const method = (tx.payment_method || 'other').toLowerCase();
    if (!payments[method]) payments[method] = { method, orders: 0, amount: 0 };
    payments[method].orders += 1;
    payments[method].amount += total;
  });

  return {
    orders: orders.length,
    units,
    revenue,
    profit,
    largestOrder,
    avgUnitsPerOrder: orders.length > 0 ? units / orders.length : 0,
    uniqueCustomers: Object.keys(customers).filter(n => n !== 'Unnamed customer').length,
    profitPerUnit: units > 0 ? profit / units : 0,
    topCustomers: Object.values(customers)
      .map(c => ({ ...c, share: revenue > 0 ? (c.revenue / revenue) * 100 : 0 }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 5),
    paymentMix: Object.values(payments)
      .map(p => ({ ...p, share: revenue > 0 ? (p.amount / revenue) * 100 : 0 }))
      .sort((a, b) => b.amount - a.amount),
  };
}

// --- Inventory turnover ---------------------------------------------------

// product id / name -> catalogue product, so sales lines can be matched to stock.
export function buildProductIndex(products = []) {
  const byId = {};
  const byName = {};
  products.forEach(p => {
    byId[p.id] = p;
    if (p.name) byName[p.name.toLowerCase()] = p;
  });
  return { byId, byName };
}

// Turnover of stocked items through wholesale sales. Stock history isn't stored,
// so stock on hand is the base for the period's units sold.
export function wholesaleTurnover(transactions = [], products = [], periodDays = 30) {
  const index = buildProductIndex(products);
  const map = {};

  transactions.forEach(tx => {
    (tx.items || []).forEach(item => {
      const product = index.byId[item.product_id] || index.byName[(item.product_name || '').toLowerCase()];
      const key = item.product_id || item.product_name || '—';
      if (!map[key]) {
        map[key] = {
          name: item.product_name || '—',
          sku: item.sku || product?.sku || '',
          unitsSold: 0,
          revenue: 0,
          cost: 0,
          costPrice: item.cost_price || product?.cost_price || 0,
          stock: product ? (product.stock_quantity || 0) : null,
        };
      }
      map[key].unitsSold += item.quantity || 0;
      map[key].revenue += item.line_total || 0;
      map[key].cost += (item.cost_price || 0) * (item.quantity || 0);
    });
  });

  const days = Math.max(periodDays, 1);
  const rows = Object.values(map)
    .map(r => {
      const stockUnits = r.stock ?? 0;
      const dailyRate = r.unitsSold / days;
      return {
        ...r,
        profit: r.revenue - r.cost,
        margin: r.revenue > 0 ? ((r.revenue - r.cost) / r.revenue) * 100 : 0,
        turnover: stockUnits > 0 ? r.unitsSold / stockUnits : null,
        daysOfSupply: stockUnits > 0 && dailyRate > 0 ? stockUnits / dailyRate : null,
        stockValue: stockUnits * (r.costPrice || 0),
      };
    })
    .sort((a, b) => (b.turnover ?? -1) - (a.turnover ?? -1) || b.revenue - a.revenue);

  const unitsSold = rows.reduce((sum, r) => sum + r.unitsSold, 0);
  const stockUnits = rows.reduce((sum, r) => sum + (r.stock ?? 0), 0);

  return {
    rows,
    totals: {
      unitsSold,
      stockUnits,
      stockValue: rows.reduce((sum, r) => sum + r.stockValue, 0),
      overallTurnover: stockUnits > 0 ? unitsSold / stockUnits : null,
    },
  };
}