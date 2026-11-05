import React from 'react';
import { Badge } from '@/components/ui/badge';

const methodColors = {
  cash: 'bg-green-100 text-green-700 border-green-200',
  card: 'bg-blue-100 text-blue-700 border-blue-200',
  electronic: 'bg-purple-100 text-purple-700 border-purple-200',
};

export default function RecentTransactions({ transactions }) {
  return (
    <div className="bg-card rounded-xl border border-border">
      <div className="p-5 border-b border-border">
        <h2 className="text-base font-semibold">Recent Transactions</h2>
        <p className="text-xs text-muted-foreground mt-0.5">Real-time sales feed</p>
      </div>
      <div className="divide-y divide-border">
        {transactions.length === 0 && (
          <div className="p-8 text-center text-sm text-muted-foreground">No transactions yet</div>
        )}
        {transactions.map(tx => (
          <div key={tx.id} className="flex items-center justify-between px-5 py-3 hover:bg-muted/50 transition-colors">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary shrink-0">
                {(tx.cashier_name || 'C')[0]}
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">{tx.transaction_number}</p>
                <p className="text-[11px] text-muted-foreground">{tx.cashier_name || tx.cashier_email} · {tx.items?.length || 0} items</p>
              </div>
            </div>
            <div className="flex items-center gap-3 shrink-0">
              <Badge variant="outline" className={methodColors[tx.payment_method] || ''}>
                {tx.payment_method}
              </Badge>
              <span className="text-sm font-semibold">${(tx.grand_total || 0).toFixed(2)}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}