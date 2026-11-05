import React from 'react';

export default function WholesalePaymentMix({ mix = [] }) {
  return (
    <div>
      <h3 className="text-sm font-semibold text-foreground mb-3">Payment Methods</h3>

      {mix.length === 0 ? (
        <p className="text-xs text-muted-foreground py-6 text-center">No wholesale orders in this period.</p>
      ) : (
        <div className="space-y-3">
          {mix.map(p => (
            <div key={p.method} className="space-y-1">
              <div className="flex items-center justify-between text-sm">
                <span className="capitalize font-medium">{p.method}</span>
                <span className="font-semibold">
                  ${p.amount.toFixed(2)} <span className="text-muted-foreground font-normal">· {p.share.toFixed(1)}%</span>
                </span>
              </div>
              <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                <div className="h-full bg-primary rounded-full" style={{ width: `${Math.min(p.share, 100)}%` }} />
              </div>
              <p className="text-[11px] text-muted-foreground">
                {p.orders} {p.orders === 1 ? 'order' : 'orders'}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}