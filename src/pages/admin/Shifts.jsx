import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { format } from 'date-fns';
import { Badge } from '@/components/ui/badge';
import { Clock, DollarSign } from 'lucide-react';

export default function Shifts() {
  const { data: shifts = [] } = useQuery({
    queryKey: ['shifts-all'],
    queryFn: () => base44.entities.Shift.list('-created_date', 50),
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Cashier Shifts</h1>
        <p className="text-sm text-muted-foreground">Track all cashier sessions and sales</p>
      </div>

      <div className="bg-card rounded-xl border border-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Cashier</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Started</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Status</th>
                <th className="text-right px-4 py-3 font-medium text-muted-foreground">Cash</th>
                <th className="text-right px-4 py-3 font-medium text-muted-foreground">Card</th>
                <th className="text-right px-4 py-3 font-medium text-muted-foreground">E-Pay</th>
                <th className="text-right px-4 py-3 font-medium text-muted-foreground">Revenue</th>
                <th className="text-right px-4 py-3 font-medium text-muted-foreground">Profit</th>
                <th className="text-right px-4 py-3 font-medium text-muted-foreground">Sales</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {shifts.map(s => (
                <tr key={s.id} className="hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary">
                        {(s.cashier_name || 'C')[0]}
                      </div>
                      <span className="font-medium">{s.cashier_name || s.cashier_email}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground text-xs">
                    {s.start_time ? format(new Date(s.start_time), 'MMM d, h:mm a') : '-'}
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant={s.status === 'open' ? 'default' : 'secondary'}>
                      {s.status === 'open' ? '● Active' : 'Closed'}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-right">${(s.total_cash_sales || 0).toFixed(2)}</td>
                  <td className="px-4 py-3 text-right">${(s.total_card_sales || 0).toFixed(2)}</td>
                  <td className="px-4 py-3 text-right">${(s.total_electronic_sales || 0).toFixed(2)}</td>
                  <td className="px-4 py-3 text-right font-semibold">${(s.total_revenue || 0).toFixed(2)}</td>
                  <td className="px-4 py-3 text-right font-semibold text-green-600">${(s.total_profit || 0).toFixed(2)}</td>
                  <td className="px-4 py-3 text-right">{s.total_transactions || 0}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {shifts.length === 0 && (
          <div className="p-12 text-center text-muted-foreground text-sm">No shifts recorded yet</div>
        )}
      </div>
    </div>
  );
}