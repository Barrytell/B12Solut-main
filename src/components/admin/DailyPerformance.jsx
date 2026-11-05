import React, { useMemo } from 'react';
import { format } from 'date-fns';
import { CalendarDays, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { cn } from '@/lib/utils';

function pctChange(curr, prev) {
  if (prev === 0) return curr === 0 ? 0 : 100;
  return ((curr - prev) / prev) * 100;
}

function MetricColumn({ label, value, count }) {
  return (
    <div className="flex-1 text-center px-2">
      <p className="text-xs text-muted-foreground font-medium mb-1">{label}</p>
      <p className="text-2xl font-bold text-foreground tabular-nums">{value}</p>
      <p className="text-xs text-muted-foreground mt-0.5">{count} sales</p>
    </div>
  );
}

export default function DailyPerformance({ transactions }) {
  const { today, yesterday, revenuePct, salesPct } = useMemo(() => {
    const tDate = format(new Date(), 'yyyy-MM-dd');
    const yDate = format(new Date(Date.now() - 86400000), 'yyyy-MM-dd');

    const todays = transactions.filter(t => t.created_date && t.created_date.startsWith(tDate));
    const yesterdays = transactions.filter(t => t.created_date && t.created_date.startsWith(yDate));

    const todayRevenue = todays.reduce((s, t) => s + (t.grand_total || 0), 0);
    const yesterdayRevenue = yesterdays.reduce((s, t) => s + (t.grand_total || 0), 0);

    return {
      today: { revenue: todayRevenue, count: todays.length },
      yesterday: { revenue: yesterdayRevenue, count: yesterdays.length },
      revenuePct: pctChange(todayRevenue, yesterdayRevenue),
      salesPct: pctChange(todays.length, yesterdays.length),
    };
  }, [transactions]);

  const renderDelta = (delta) => {
    const up = delta > 0;
    const flat = delta === 0;
    const Icon = flat ? Minus : up ? TrendingUp : TrendingDown;
    const color = flat ? 'text-muted-foreground' : up ? 'text-green-600' : 'text-destructive';
    return (
      <span className={cn('inline-flex items-center gap-0.5 text-xs font-semibold', color)}>
        <Icon className="w-3 h-3" />
        {flat ? '0%' : `${up ? '+' : ''}${delta.toFixed(1)}%`}
      </span>
    );
  };

  return (
    <div className="bg-card rounded-xl border border-border p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <CalendarDays className="w-4 h-4 text-primary" />
          <h3 className="text-base font-semibold text-foreground">Daily Performance</h3>
        </div>
        <span className="text-xs text-muted-foreground">vs yesterday</span>
      </div>

      <div className="grid grid-cols-2 gap-4">
        {/* Revenue comparison */}
        <div className="rounded-lg bg-muted/40 p-4">
          <p className="text-xs font-medium text-muted-foreground mb-3">Total Revenue</p>
          <div className="flex items-stretch divide-x divide-border">
            <MetricColumn
              label="Today"
              value={`$${today.revenue.toFixed(2)}`}
              count={today.count}
            />
            <MetricColumn
              label="Yesterday"
              value={`$${yesterday.revenue.toFixed(2)}`}
              count={yesterday.count}
            />
          </div>
          <div className="mt-3 pt-3 border-t border-border text-center">
            {renderDelta(revenuePct)}
          </div>
        </div>

        {/* Sales count comparison */}
        <div className="rounded-lg bg-muted/40 p-4">
          <p className="text-xs font-medium text-muted-foreground mb-3">Sales Count</p>
          <div className="flex items-stretch divide-x divide-border">
            <MetricColumn
              label="Today"
              value={today.count}
              count={today.count}
            />
            <MetricColumn
              label="Yesterday"
              value={yesterday.count}
              count={yesterday.count}
            />
          </div>
          <div className="mt-3 pt-3 border-t border-border text-center">
            {renderDelta(salesPct)}
          </div>
        </div>
      </div>
    </div>
  );
}