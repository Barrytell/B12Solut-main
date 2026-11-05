import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { format, subDays, differenceInCalendarDays } from 'date-fns';
import { DollarSign, TrendingUp, ShoppingBag, Package, Download } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import StatCard from '@/components/shared/StatCard';
import SalesTrendChart from '@/components/admin/SalesTrendChart';
import WholesaleFilterBar from '@/components/admin/WholesaleFilterBar';
import WholesaleProductTable from '@/components/admin/WholesaleProductTable';
import WholesaleOrders from '@/components/admin/WholesaleOrders';
import WholesaleAnalyticsReport from '@/components/admin/WholesaleAnalyticsReport';
import WholesaleInventoryTurnover from '@/components/admin/WholesaleInventoryTurnover';
import {
  summarizeWholesale,
  wholesaleAnalytics,
  buildSupplierIndex,
  wholesaleSupplierOptions,
  filterOrdersByDateRange,
  filterOrdersBySupplier,
  scopeOrdersToSupplier,
  dateRangeLabel,
} from '@/utils/wholesale';
import { buildWholesaleOrdersCsv, downloadCsv } from '@/utils/wholesaleCsv';

const defaultRange = () => ({ from: subDays(new Date(), 29), to: new Date() });

export default function WholesaleDashboard() {
  const [range, setRange] = useState(defaultRange);
  const [supplier, setSupplier] = useState('all');

  const { data: transactions = [], isLoading } = useQuery({
    queryKey: ['transactions-wholesale'],
    queryFn: () => base44.entities.Transaction.filter({ sale_type: 'wholesale' }, '-created_date', 500),
  });
  const { data: products = [] } = useQuery({
    queryKey: ['products-admin'],
    queryFn: () => base44.entities.Product.list('-created_date'),
  });
  const { data: suppliers = [] } = useQuery({
    queryKey: ['suppliers'],
    queryFn: () => base44.entities.Supplier.list('-created_date'),
  });

  const supplierIndex = useMemo(() => buildSupplierIndex(products, suppliers), [products, suppliers]);
  const supplierOptions = useMemo(
    () => wholesaleSupplierOptions(transactions, supplierIndex, suppliers),
    [transactions, supplierIndex, suppliers]
  );

  // Orders in the selected period, then narrowed to the selected supplier (full orders).
  const orders = useMemo(
    () => filterOrdersBySupplier(filterOrdersByDateRange(transactions, range), supplierIndex, supplier),
    [transactions, range, supplierIndex, supplier]
  );
  // Same orders reduced to the selected supplier's own lines, for performance figures.
  const scopedOrders = useMemo(
    () => scopeOrdersToSupplier(orders, supplierIndex, supplier),
    [orders, supplierIndex, supplier]
  );

  const stats = summarizeWholesale(scopedOrders);
  const analytics = useMemo(() => wholesaleAnalytics(scopedOrders), [scopedOrders]);
  const periodLabel = dateRangeLabel(range);
  const periodDays = range?.from
    ? Math.max(1, differenceInCalendarDays(range.to || new Date(), range.from) + 1)
    : 30;

  const handleExport = () => {
    const csv = buildWholesaleOrdersCsv(orders, supplierIndex);
    const slug = (supplier === 'all' ? 'all-suppliers' : supplier)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
    const from = range?.from ? format(range.from, 'yyyy-MM-dd') : 'start';
    const to = range?.to ? format(range.to, 'yyyy-MM-dd') : 'today';

    downloadCsv(`wholesale-orders-${slug}-${from}-to-${to}.csv`, csv);
    toast.success(`Exported ${orders.length} wholesale ${orders.length === 1 ? 'order' : 'orders'}`);
  };

  if (isLoading) {
    return <div className="p-12 text-center text-sm text-muted-foreground">Loading wholesale data…</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Wholesale Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Bulk orders tracked separately from retail sales
          </p>
        </div>
        <Button onClick={handleExport} disabled={orders.length === 0} className="gap-2">
          <Download className="w-4 h-4" />
          Export CSV
        </Button>
      </div>

      <WholesaleFilterBar
        suppliers={supplierOptions}
        supplier={supplier}
        onSupplierChange={setSupplier}
        range={range}
        onRangeChange={setRange}
        orderCount={orders.length}
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Wholesale Revenue"
          value={`$${stats.revenue.toFixed(2)}`}
          subtitle={`${stats.orders} orders`}
          icon={DollarSign}
        />
        <StatCard
          title="Wholesale Profit"
          value={`$${stats.profit.toFixed(2)}`}
          subtitle={stats.revenue > 0 ? `${stats.margin.toFixed(1)}% margin` : 'No orders in period'}
          icon={TrendingUp}
        />
        <StatCard
          title="Avg Order Value"
          value={`$${stats.avgOrder.toFixed(2)}`}
          subtitle="Per wholesale order"
          icon={Package}
        />
        <StatCard
          title="Units Sold"
          value={stats.units}
          subtitle={periodLabel}
          icon={ShoppingBag}
        />
      </div>

      <WholesaleAnalyticsReport analytics={analytics} periodLabel={periodLabel} />

      <SalesTrendChart
        transactions={scopedOrders}
        range={range}
        title="Daily Wholesale Sales"
      />

      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <WholesaleProductTable transactions={scopedOrders} periodLabel={periodLabel} />
        </div>
        <div>
          <WholesaleOrders transactions={orders} />
        </div>
      </div>

      <WholesaleInventoryTurnover
        transactions={scopedOrders}
        products={products}
        periodDays={periodDays}
        periodLabel={periodLabel}
      />
    </div>
  );
}