import React from 'react';
import { cn } from '@/lib/utils';

export default function TransactionSummary({ transactions = [] }) {
  const active = transactions.filter(t => t.status !== 'voided');
  const revenue = active.reduce((sum, t) => sum + (t.grand_total || 0), 0);
  const profit = active.reduce((sum, t) => sum + (t.gross_profit || 0), 0);
  const units = active.reduce(
    (sum, t) => sum + (t.items || []).reduce((q, i) => q + (i.quantity || 0), 0),
    0
  );

  const cells = [
    { label: 'Transactions', value: active.length },
    { label: 'Revenue', value: `$${revenue.toFixed(2)}` },
    { label: 'Gross Profit', value: `$${profit.toFixed(2)}`, accent: true },
    { label: 'Units Sold', value: units },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 bg-card rounded-xl border border-border divide-x divide-y lg:divide-y-0 divide-border overflow-hidden">
      {cells.map(c => (
        <div key={c.label} className="px-4 py-3">
          <p className="text-[11px] text-muted-foreground uppercase tracking-wide">{c.label}</p>
          <p className={cn('text-lg font-bold mt-0.5', c.accent && 'text-green-600')}>{c.value}</p>
        </div>
      ))}
    </div>
  );
}