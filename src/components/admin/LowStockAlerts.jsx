import React from 'react';
import { AlertTriangle } from 'lucide-react';

export default function LowStockAlerts({ products }) {
  return (
    <div className="bg-card rounded-xl border border-border">
      <div className="p-5 border-b border-border flex items-center gap-2">
        <AlertTriangle className="w-4 h-4 text-orange-500" />
        <h2 className="text-base font-semibold">Low Stock Alerts</h2>
      </div>
      <div className="divide-y divide-border">
        {products.length === 0 && (
          <div className="p-8 text-center text-sm text-muted-foreground">All products well stocked</div>
        )}
        {products.slice(0, 8).map(p => (
          <div key={p.id} className="flex items-center justify-between px-5 py-3">
            <div>
              <p className="text-sm font-medium">{p.name}</p>
              <p className="text-[11px] text-muted-foreground">SKU: {p.sku}</p>
            </div>
            <div className="text-right">
              <p className="text-sm font-bold text-destructive">{p.stock_quantity || 0}</p>
              <p className="text-[10px] text-muted-foreground">/ {p.low_stock_threshold || 10} min</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}