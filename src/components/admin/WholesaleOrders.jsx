import React from 'react';
import { format } from 'date-fns';

export default function WholesaleOrders({ transactions = [] }) {
  const orders = transactions.slice(0, 10);

  return (
    <div className="bg-card rounded-xl border border-border">
      <div className="p-5 border-b border-border">
        <h2 className="text-base font-semibold">Recent Wholesale Orders</h2>
        <p className="text-xs text-muted-foreground mt-0.5">Latest bulk orders</p>
      </div>
      <div className="divide-y divide-border">
        {orders.length === 0 && (
          <div className="p-8 text-center text-sm text-muted-foreground">No wholesale orders yet</div>
        )}
        {orders.map(order => (
          <div key={order.id} className="flex items-center justify-between gap-3 px-5 py-3 hover:bg-muted/50 transition-colors">
            <div className="min-w-0">
              <p className="text-sm font-medium truncate">{order.customer_name || 'Wholesale customer'}</p>
              <p className="text-[11px] text-muted-foreground truncate">
                {order.transaction_number} · {order.items?.length || 0} lines
                {order.created_date ? ` · ${format(new Date(order.created_date), 'MMM d, h:mm a')}` : ''}
              </p>
            </div>
            <span className="text-sm font-semibold shrink-0">${(order.grand_total || 0).toFixed(2)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}