import React, { useMemo } from 'react';
import { format, subDays, startOfDay, addDays } from 'date-fns';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import { addMoney, sumBy } from '@/lib/money';

/**
 * Visual trend line of total daily sales volume over the last `days` days.
 */
export default function SalesTrendChart({ transactions = [], days = 30, range, title }) {
  const data = useMemo(() => {
    const today = startOfDay(new Date());
    const end = range?.to ? startOfDay(range.to) : today;
    const start = range?.from ? startOfDay(range.from) : subDays(end, days - 1);
    const buckets = {};
    for (let day = start; day <= end; day = addDays(day, 1)) {
      buckets[format(day, 'yyyy-MM-dd')] = 0;
    }
    transactions.forEach((t) => {
      if (!t.created_date) return;
      const key = t.created_date.slice(0, 10);
      if (key in buckets && t.status !== 'voided' && t.status !== 'refunded') {
        buckets[key] = addMoney(buckets[key], t.grand_total || 0);
      }
    });
    return Object.entries(buckets).map(([date, total]) => ({
      date,
      label: format(new Date(date), 'MMM d'),
      total,
    }));
  }, [transactions, days, range?.from, range?.to]);

  const peak = data.reduce((max, d) => Math.max(max, d.total), 0);
  const total30 = sumBy(data, d => d.total);
  const heading = title || `Daily Sales — Last ${days} Days`;

  return (
    <div className="bg-card rounded-xl border border-border p-5">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-base font-semibold text-foreground flex items-center gap-2">
            <span className="w-1.5 h-4 rounded-full bg-primary inline-block" />
            {heading}
          </h3>
          <p className="text-xs text-muted-foreground mt-1">
            Total ${total30.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ·
            Peak day ${peak.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </p>
        </div>
      </div>

      <div className="h-64 -ml-2">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 5, right: 10, bottom: 0, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
            <XAxis
              dataKey="label"
              stroke="hsl(var(--muted-foreground))"
              tick={{ fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              interval={Math.ceil(data.length / 8)}
            />
            <YAxis
              stroke="hsl(var(--muted-foreground))"
              tick={{ fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v) => `$${v}`}
              width={48}
            />
            <Tooltip
              contentStyle={{
                background: 'hsl(var(--card))',
                border: '1px solid hsl(var(--border))',
                borderRadius: '0.5rem',
                fontSize: '12px',
              }}
              labelStyle={{ color: 'hsl(var(--muted-foreground))' }}
              formatter={(value) => [`$${Number(value).toFixed(2)}`, 'Sales']}
              labelFormatter={(label, payload) => {
                const raw = payload?.[0]?.payload?.date;
                return raw ? format(new Date(raw), 'EEE, MMM d, yyyy') : label;
              }}
            />
            <Line
              type="monotone"
              dataKey="total"
              stroke="hsl(var(--primary))"
              strokeWidth={2.5}
              dot={false}
              activeDot={{ r: 4, fill: 'hsl(var(--primary))' }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}