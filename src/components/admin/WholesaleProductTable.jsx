import React from 'react';
import { cn } from '@/lib/utils';
import { wholesaleProductTotals } from '@/utils/wholesale';

export default function WholesaleProductTable({ transactions = [], periodLabel = 'Last 30 days' }) {
  const products = wholesaleProductTotals(transactions).slice(0, 10);

  return (
    <div className="bg-card rounded-xl border border-border">
      <div className="p-5 border-b border-border flex items-center justify-between">
        <h2 className="text-base font-semibold">Top Wholesale Products</h2>
        <span className="text-xs text-muted-foreground bg-muted px-2.5 py-1 rounded-full whitespace-nowrap">
          {periodLabel}
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/50">
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Product</th>
              <th className="text-right px-4 py-3 font-medium text-muted-foreground">Qty Sold</th>
              <th className="text-right px-4 py-3 font-medium text-muted-foreground">Revenue</th>
              <th className="text-right px-4 py-3 font-medium text-muted-foreground">Profit</th>
              <th className="text-right px-4 py-3 font-medium text-muted-foreground">Margin</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {products.map(p => (
              <tr key={p.name} className="hover:bg-muted/30">
                <td className="px-4 py-3 font-medium">{p.name}</td>
                <td className="px-4 py-3 text-right">{p.quantity}</td>
                <td className="px-4 py-3 text-right">${p.revenue.toFixed(2)}</td>
                <td className="px-4 py-3 text-right font-semibold text-green-600">${p.profit.toFixed(2)}</td>
                <td className="px-4 py-3 text-right">
                  <span className={cn('font-semibold', p.margin >= 30 ? 'text-green-600' : p.margin >= 15 ? 'text-yellow-600' : 'text-red-500')}>
                    {p.margin.toFixed(1)}%
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {products.length === 0 && (
        <div className="p-12 text-center text-muted-foreground text-sm">No wholesale orders yet</div>
      )}
    </div>
  );
}