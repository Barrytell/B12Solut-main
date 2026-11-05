import React, { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { useOutletContext } from 'react-router-dom';
import { format } from 'date-fns';
import { Badge } from '@/components/ui/badge';
import { Receipt, ChevronDown, ChevronUp } from 'lucide-react';
import { isWholesale } from '@/utils/wholesale';
import TransactionPrintActions from '@/components/pos/TransactionPrintActions';

const methodColors = {
  cash: 'bg-green-100 text-green-700',
  card: 'bg-blue-100 text-blue-700',
  electronic: 'bg-purple-100 text-purple-700',
};

export default function SalesHistory() {
  const { user } = useOutletContext();
  const [expandedId, setExpandedId] = useState(null);

  const { data: transactions = [] } = useQuery({
    queryKey: ['my-transactions', user?.email],
    queryFn: () => base44.entities.Transaction.filter({ cashier_email: user?.email }, '-created_date', 50),
    enabled: !!user?.email,
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">My Sales</h1>
        <p className="text-sm text-muted-foreground">{transactions.length} transactions</p>
      </div>

      <div className="bg-card rounded-xl border border-border divide-y divide-border">
        {transactions.length === 0 && (
          <div className="p-12 text-center text-muted-foreground text-sm">No sales yet</div>
        )}
        {transactions.map(tx => (
          <div key={tx.id}>
            <button
              onClick={() => setExpandedId(expandedId === tx.id ? null : tx.id)}
              className="w-full flex items-center justify-between px-5 py-4 hover:bg-muted/30 transition-colors text-left"
            >
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
                  <Receipt className="w-4 h-4 text-primary" />
                </div>
                <div>
                  <p className="text-sm font-medium">{tx.transaction_number}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {tx.created_date ? format(new Date(tx.created_date), 'MMM d, h:mm a') : ''} · {tx.items?.length || 0} items
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Badge variant="outline">{isWholesale(tx) ? 'Wholesale' : 'Retail'}</Badge>
                <Badge className={methodColors[tx.payment_method]}>{tx.payment_method}</Badge>
                <span className="text-sm font-bold">${(tx.grand_total || 0).toFixed(2)}</span>
                {expandedId === tx.id ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </div>
            </button>
            {expandedId === tx.id && (
              <div className="px-5 pb-4 bg-muted/20">
                <table className="w-full text-xs">
                  <thead><tr className="border-b border-border text-muted-foreground">
                    <th className="text-left py-1.5">Item</th>
                    <th className="text-right py-1.5">Qty</th>
                    <th className="text-right py-1.5">Price</th>
                    <th className="text-right py-1.5">Total</th>
                  </tr></thead>
                  <tbody>
                    {tx.items?.map((item, i) => (
                      <tr key={i} className="border-b border-border/50">
                        <td className="py-1.5">{item.product_name}</td>
                        <td className="text-right">{item.quantity}</td>
                        <td className="text-right">${(item.unit_price || 0).toFixed(2)}</td>
                        <td className="text-right font-medium">${(item.line_total || 0).toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <TransactionPrintActions transaction={tx} className="mt-3" />
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}