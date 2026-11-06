import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/api/client';
import { DollarSign, AlertTriangle, TrendingUp, Users, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { format } from 'date-fns';
import StatCard from '@/components/shared/StatCard';
import RecentTransactions from '@/components/admin/RecentTransactions';
import LowStockAlerts from '@/components/admin/LowStockAlerts';
import LowStockAlertBanner from '@/components/admin/LowStockAlertBanner';
import SalesTrendChart from '@/components/admin/SalesTrendChart';
import DailyPerformance from '@/components/admin/DailyPerformance';
import ReturnModal from '@/components/returns/ReturnModal';
import { isRetail } from '@/utils/wholesale';
import { addMoney, sumBy } from '@/lib/money';

export default function Dashboard() {
  const [showReturn, setShowReturn] = useState(false);

  const { data: transactions = [] } = useQuery({
    queryKey: ['transactions'],
    queryFn: () => api.entities.Transaction.list('-created_date', 500),
  });

  const { data: products = [] } = useQuery({
    queryKey: ['products'],
    queryFn: () => api.entities.Product.list(),
  });

  const { data: shifts = [] } = useQuery({
    queryKey: ['shifts'],
    queryFn: () => api.entities.Shift.list('-created_date', 20),
  });

  const { data: returns = [] } = useQuery({
    queryKey: ['returns'],
    queryFn: () => api.entities.Return.list('-created_date', 200),
  });

  // Retail analytics only — wholesale orders are reported on the Wholesale dashboard
  const retailTransactions = transactions.filter(isRetail);

  const today = format(new Date(), 'yyyy-MM-dd');
  const todayTransactions = retailTransactions.filter(t => 
    t.created_date && t.created_date.startsWith(today)
  );

  const todayReturns = returns.filter(r => r.created_date && r.created_date.startsWith(today));
  const todayRevenue = sumBy(todayTransactions, t => t.grand_total || 0);
  const todayProfit = addMoney(
    sumBy(todayTransactions, t => t.gross_profit || 0),
    sumBy(todayReturns, r => r.profit_impact || 0),
  );
  const lowStockProducts = products.filter(p => p.stock_quantity <= (p.low_stock_threshold || 10) && p.is_active !== false);
  const activeShifts = shifts.filter(s => s.status === 'open');

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {format(new Date(), 'EEEE, MMMM d, yyyy')} · Retail only
          </p>
        </div>
        <Button onClick={() => setShowReturn(true)} className="rounded-xl gap-2 w-full sm:w-auto">
          <RotateCcw className="w-4 h-4" /> Process Return
        </Button>
      </div>

      <LowStockAlertBanner products={products} />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Today's Revenue"
          value={`$${todayRevenue.toFixed(2)}`}
          subtitle={`${todayTransactions.length} transactions`}
          icon={DollarSign}
        />
        <StatCard
          title="Today's Profit"
          value={`$${todayProfit.toFixed(2)}`}
          subtitle={todayRevenue > 0 ? `${((todayProfit / todayRevenue) * 100).toFixed(1)}% margin` : 'No sales yet'}
          icon={TrendingUp}
        />
        <StatCard
          title="Low Stock Items"
          value={lowStockProducts.length}
          subtitle="Need restocking"
          icon={AlertTriangle}
        />
        <StatCard
          title="Active Shifts"
          value={activeShifts.length}
          subtitle="Cashiers on duty"
          icon={Users}
        />
      </div>

      <DailyPerformance transactions={retailTransactions} />

      <SalesTrendChart transactions={retailTransactions} days={30} />

      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <RecentTransactions transactions={retailTransactions.slice(0, 10)} />
        </div>
        <div>
          <LowStockAlerts products={lowStockProducts} />
        </div>
      </div>

      {showReturn && (
        <ReturnModal
          products={products}
          onClose={() => setShowReturn(false)}
          onComplete={() => setShowReturn(false)}
        />
      )}
    </div>
  );
}