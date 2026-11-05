import React from 'react';

export default function WholesaleTopCustomers({ customers = [] }) {
  return (
    <div>
      <h3 className="text-sm font-semibold text-foreground mb-3">Top Wholesale Customers</h3>

      {customers.length === 0 ? (
        <p className="text-xs text-muted-foreground py-6 text-center">No wholesale orders in this period.</p>
      ) : (
        <div className="space-y-2.5">
          {customers.map(c => (
            <div key={c.name} className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">{c.name}</p>
                <p className="text-[11px] text-muted-foreground">
                  {c.orders} {c.orders === 1 ? 'order' : 'orders'} · {c.units} units
                </p>
              </div>
              <div className="text-right shrink-0">
                <p className="text-sm font-semibold">${c.revenue.toFixed(2)}</p>
                <p className="text-[11px] text-muted-foreground">{c.share.toFixed(1)}% of revenue</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}