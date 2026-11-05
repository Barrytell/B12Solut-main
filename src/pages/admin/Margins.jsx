import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { TrendingUp, DollarSign, Percent, Package, Calendar } from 'lucide-react';
import StatCard from '@/components/shared/StatCard';
import { cn } from '@/lib/utils';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { subDays, subWeeks, subMonths, subYears, isAfter } from 'date-fns';
import { isRetail } from '@/utils/wholesale';

const COLORS = ['hsl(221, 83%, 53%)', 'hsl(160, 84%, 39%)', 'hsl(30, 92%, 58%)', 'hsl(280, 68%, 60%)', 'hsl(340, 75%, 55%)', '#94a3b8'];

const TIME_PERIODS = [
  { value: 'day',   label: 'Day',   getStart: () => subDays(new Date(), 1) },
  { value: 'week',  label: 'Week',  getStart: () => subWeeks(new Date(), 1) },
  { value: 'month', label: 'Month', getStart: () => subMonths(new Date(), 1) },
  { value: 'year',  label: 'Year',  getStart: () => subYears(new Date(), 1) },
];

export default function Margins() {
  const [timePeriod, setTimePeriod] = useState('month');

  const { data: products = [] } = useQuery({
    queryKey: ['products-admin'],
    queryFn: () => base44.entities.Product.list(),
  });

  const { data: transactions = [] } = useQuery({
    queryKey: ['transactions'],
    queryFn: () => base44.entities.Transaction.list('-created_date', 500),
  });

  // Filter transactions by selected time period
  const filteredTransactions = useMemo(() => {
    const period = TIME_PERIODS.find(p => p.value === timePeriod);
    const start = period.getStart();
    return transactions.filter(t => isRetail(t) && t.created_date && isAfter(new Date(t.created_date), start));
  }, [transactions, timePeriod]);

  const totalRevenue = filteredTransactions.reduce((sum, t) => sum + (t.grand_total || 0), 0);
  const totalCost = filteredTransactions.reduce((sum, t) => sum + (t.total_cost || 0), 0);
  const totalProfit = totalRevenue - totalCost;
  const avgMargin = totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0;

  // Product performance (scoped to period)
  const productSales = useMemo(() => {
    const map = {};
    filteredTransactions.forEach(tx => {
      tx.items?.forEach(item => {
        if (!map[item.product_name]) {
          map[item.product_name] = { name: item.product_name, revenue: 0, cost: 0, quantity: 0 };
        }
        map[item.product_name].revenue += item.line_total || 0;
        map[item.product_name].cost += (item.cost_price || 0) * (item.quantity || 0);
        map[item.product_name].quantity += item.quantity || 0;
      });
    });
    return map;
  }, [filteredTransactions]);

  const topProducts = useMemo(() =>
    Object.values(productSales)
      .map(p => ({ ...p, profit: p.revenue - p.cost, margin: p.revenue > 0 ? ((p.revenue - p.cost) / p.revenue) * 100 : 0 }))
      .sort((a, b) => b.profit - a.profit)
      .slice(0, 10),
  [productSales]);

  // Category breakdown (scoped to period)
  const categoryData = useMemo(() => {
    const map = {};
    filteredTransactions.forEach(tx => {
      tx.items?.forEach(item => {
        const product = products.find(p => p.id === item.product_id);
        const cat = product?.category || 'other';
        if (!map[cat]) map[cat] = { name: cat, value: 0 };
        map[cat].value += item.line_total || 0;
      });
    });
    return Object.values(map).sort((a, b) => b.value - a.value);
  }, [filteredTransactions, products]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Product Margin Analysis</h1>
          <p className="text-sm text-muted-foreground">Retail profitability and product performance</p>
        </div>

        {/* Time period selector */}
        <div className="flex items-center gap-2">
          <Calendar className="w-4 h-4 text-muted-foreground shrink-0" />
          <div className="flex rounded-lg border border-border overflow-hidden text-sm">
            {TIME_PERIODS.map(p => (
              <button
                key={p.value}
                onClick={() => setTimePeriod(p.value)}
                className={cn(
                  "px-4 py-1.5 transition-colors font-medium",
                  timePeriod === p.value
                    ? "bg-primary text-primary-foreground"
                    : "bg-background text-muted-foreground hover:bg-muted"
                )}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="Total Revenue" value={`$${totalRevenue.toFixed(2)}`} icon={DollarSign} />
        <StatCard title="Total COGS" value={`$${totalCost.toFixed(2)}`} icon={Package} />
        <StatCard title="Gross Profit" value={`$${totalProfit.toFixed(2)}`} icon={TrendingUp} />
        <StatCard title="Avg Margin" value={`${avgMargin.toFixed(1)}%`} icon={Percent} />
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Top Products Chart */}
        <div className="lg:col-span-2 bg-card rounded-xl border border-border p-5">
          <h2 className="text-base font-semibold mb-4">Top Products by Profit <span className="text-xs font-normal text-muted-foreground ml-1">· Past {TIME_PERIODS.find(p => p.value === timePeriod)?.label}</span></h2>
          {topProducts.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={topProducts} layout="vertical" margin={{ left: 80 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(220, 13%, 91%)" />
                <XAxis type="number" tickFormatter={v => `$${v}`} />
                <YAxis type="category" dataKey="name" width={80} tick={{ fontSize: 11 }} />
                <Tooltip formatter={v => `$${v.toFixed(2)}`} />
                <Bar dataKey="profit" fill="hsl(221, 83%, 53%)" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[300px] flex items-center justify-center text-muted-foreground text-sm">No sales data yet</div>
          )}
        </div>

        {/* Category Pie */}
        <div className="bg-card rounded-xl border border-border p-5">
          <h2 className="text-base font-semibold mb-4">Revenue by Category</h2>
          {categoryData.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie data={categoryData} cx="50%" cy="50%" outerRadius={100} dataKey="value" label={({ name }) => name}>
                  {categoryData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip formatter={v => `$${v.toFixed(2)}`} />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[300px] flex items-center justify-center text-muted-foreground text-sm">No data yet</div>
          )}
        </div>
      </div>

      {/* Product Margin Table */}
      <div className="bg-card rounded-xl border border-border">
        <div className="p-5 border-b border-border flex items-center justify-between">
          <h2 className="text-base font-semibold">Product Margin Analysis</h2>
          <span className="text-xs text-muted-foreground bg-muted px-2.5 py-1 rounded-full">
            Past {TIME_PERIODS.find(p => p.value === timePeriod)?.label}
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Product</th>
                <th className="text-right px-4 py-3 font-medium text-muted-foreground">Qty Sold</th>
                <th className="text-right px-4 py-3 font-medium text-muted-foreground">Revenue</th>
                <th className="text-right px-4 py-3 font-medium text-muted-foreground">COGS</th>
                <th className="text-right px-4 py-3 font-medium text-muted-foreground">Profit</th>
                <th className="text-right px-4 py-3 font-medium text-muted-foreground">Margin</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {topProducts.map(p => (
                <tr key={p.name} className="hover:bg-muted/30">
                  <td className="px-4 py-3 font-medium">{p.name}</td>
                  <td className="px-4 py-3 text-right">{p.quantity}</td>
                  <td className="px-4 py-3 text-right">${p.revenue.toFixed(2)}</td>
                  <td className="px-4 py-3 text-right">${p.cost.toFixed(2)}</td>
                  <td className="px-4 py-3 text-right font-semibold text-green-600">${p.profit.toFixed(2)}</td>
                  <td className="px-4 py-3 text-right">
                    <span className={cn("font-semibold", p.margin >= 30 ? "text-green-600" : p.margin >= 15 ? "text-yellow-600" : "text-red-500")}>
                      {p.margin.toFixed(1)}%
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {topProducts.length === 0 && (
          <div className="p-12 text-center text-muted-foreground text-sm">No sales data to analyze</div>
        )}
      </div>
    </div>
  );
}