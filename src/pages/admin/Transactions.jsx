import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/api/client';
import { format } from 'date-fns';
import { Search, Receipt, ChevronDown, ChevronUp } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { isRetail, isWholesale } from '@/utils/wholesale';
import TransactionSaleTypeFilter from '@/components/admin/TransactionSaleTypeFilter';
import TransactionSummary from '@/components/admin/TransactionSummary';
import TransactionPrintActions from '@/components/pos/TransactionPrintActions';

const methodColors = {
  cash: 'bg-green-100 text-green-700',
  card: 'bg-blue-100 text-blue-700',
  electronic: 'bg-purple-100 text-purple-700',
};

export default function Transactions() {
  const [search, setSearch] = useState('');
  const [expandedId, setExpandedId] = useState(null);
  const [saleTypeFilter, setSaleTypeFilter] = useState('retail');

  const { data: transactions = [] } = useQuery({
    queryKey: ['transactions-all'],
    queryFn: () => api.entities.Transaction.list('-created_date', 200),
  });

  // Wholesale orders also have their own dashboard; this view can show either type.
  const scoped = transactions.filter(t => {
    if (saleTypeFilter === 'wholesale') return isWholesale(t);
    if (saleTypeFilter === 'retail') return isRetail(t);
    return true;
  });

  const filtered = scoped.filter(t =>
    !search ||
    t.transaction_number?.toLowerCase().includes(search.toLowerCase()) ||
    t.cashier_name?.toLowerCase().includes(search.toLowerCase()) ||
    t.customer_name?.toLowerCase().includes(search.toLowerCase())
  );

  const heading = saleTypeFilter === 'wholesale'
    ? 'Wholesale Transactions'
    : saleTypeFilter === 'all'
      ? 'All Transactions'
      : 'Retail Transactions';

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{heading}</h1>
        <p className="text-sm text-muted-foreground">
          {scoped.length}{' '}
          {saleTypeFilter === 'wholesale'
            ? 'wholesale orders'
            : saleTypeFilter === 'retail'
              ? 'retail transactions'
              : 'transactions'}
        </p>
      </div>

      <TransactionSummary transactions={scoped} />

      <div className="flex flex-wrap items-center gap-3">
        <TransactionSaleTypeFilter value={saleTypeFilter} onChange={setSaleTypeFilter} />
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Search by TX#, cashier or customer..." value={search} onChange={e => setSearch(e.target.value)} className="pl-10" />
        </div>
      </div>

      <div className="bg-card rounded-xl border border-border divide-y divide-border">
        {filtered.length === 0 && (
          <div className="p-12 text-center text-muted-foreground text-sm">No transactions found</div>
        )}
        {filtered.map(tx => (
          <div key={tx.id}>
            <button
              onClick={() => setExpandedId(expandedId === tx.id ? null : tx.id)}
              className="w-full flex items-center justify-between px-5 py-4 hover:bg-muted/30 transition-colors text-left"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                  <Receipt className="w-4 h-4 text-primary" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium">{tx.transaction_number}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {tx.customer_name ? `${tx.customer_name} · ` : ''}
                    {tx.cashier_name} · {tx.created_date ? format(new Date(tx.created_date), 'MMM d, h:mm a') : ''}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <Badge variant="outline">{isWholesale(tx) ? 'Wholesale' : 'Retail'}</Badge>
                <Badge className={methodColors[tx.payment_method]}>{tx.payment_method}</Badge>
                <span className="text-sm font-bold">${(tx.grand_total || 0).toFixed(2)}</span>
                {expandedId === tx.id ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
              </div>
            </button>
            {expandedId === tx.id && (
              <div className="px-5 pb-4 bg-muted/20">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3 text-xs">
                  <div><span className="text-muted-foreground">Subtotal:</span> <span className="font-medium">${(tx.subtotal || 0).toFixed(2)}</span></div>
                  <div><span className="text-muted-foreground">Tax:</span> <span className="font-medium">${(tx.tax_total || 0).toFixed(2)}</span></div>
                  <div><span className="text-muted-foreground">Discount:</span> <span className="font-medium">${(tx.discount_amount || 0).toFixed(2)}</span></div>
                  <div><span className="text-muted-foreground">Profit:</span> <span className="font-medium text-green-600">${(tx.gross_profit || 0).toFixed(2)}</span></div>
                </div>
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