import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/api/client';
import { format } from 'date-fns';
import { History, ArrowUp, ArrowDown } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

export default function StockAdjustmentLog({ limit = 25 }) {
  const { data: adjustments = [], isLoading } = useQuery({
    queryKey: ['stock-adjustments'],
    queryFn: () => api.entities.StockAdjustment.list('-created_date', limit),
  });

  return (
    <div className="bg-card rounded-xl border border-border overflow-hidden">
      <div className="flex items-center gap-2 px-5 py-4 border-b border-border">
        <History className="w-4 h-4 text-primary" />
        <h3 className="text-base font-semibold text-foreground">Stock Adjustment Log</h3>
        <span className="text-xs text-muted-foreground ml-auto">Manual stock changes</span>
      </div>

      {isLoading ? (
        <div className="p-10 text-center text-sm text-muted-foreground">Loading…</div>
      ) : adjustments.length === 0 ? (
        <div className="p-10 text-center text-sm text-muted-foreground">No manual stock adjustments recorded yet.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">When</th>
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">User</th>
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Product</th>
                <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">Change</th>
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Reason</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {adjustments.map(a => {
                const delta = a.delta ?? 0;
                const positive = delta > 0;
                const neutral = delta === 0;
                return (
                  <tr key={a.id} className="hover:bg-muted/30">
                    <td className="px-4 py-2.5 text-muted-foreground whitespace-nowrap">
                      {a.created_date ? format(new Date(a.created_date), 'MMM d, h:mm a') : '—'}
                    </td>
                    <td className="px-4 py-2.5">
                      <span className="font-medium">{a.user_name || a.user_email || '—'}</span>
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="font-medium">{a.product_name || '—'}</div>
                      {a.sku && <div className="text-[11px] text-muted-foreground">{a.sku}</div>}
                    </td>
                    <td className="px-4 py-2.5 text-right whitespace-nowrap">
                      <span className="text-muted-foreground">{a.previous_quantity ?? 0}</span>
                      <span className="mx-1 text-muted-foreground">→</span>
                      <span className="font-medium">{a.new_quantity ?? 0}</span>
                      <Badge
                        variant="outline"
                        className={
                          'ml-2 text-[10px] ' + (
                            neutral ? 'text-muted-foreground'
                            : positive ? 'border-green-200 text-green-700 bg-green-50'
                            : 'border-red-200 text-red-700 bg-red-50'
                          )
                        }
                      >
                        {neutral ? '±' : positive ? <ArrowUp className="w-3 h-3 inline -mt-0.5" /> : <ArrowDown className="w-3 h-3 inline -mt-0.5" />}
                        {neutral ? '0' : Math.abs(delta)}
                      </Badge>
                    </td>
                    <td className="px-4 py-2.5 text-muted-foreground max-w-xs truncate" title={a.reason}>
                      {a.reason || '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}