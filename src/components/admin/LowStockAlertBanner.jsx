import React, { useState } from 'react';
import { AlertTriangle, X, ArrowRight, ChevronDown, ChevronUp } from 'lucide-react';
import { Link } from 'react-router-dom';
import { cn } from '@/lib/utils';

export default function LowStockAlertBanner({ products }) {
  const [dismissed, setDismissed] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const lowStock = products.filter(p => (p.stock_quantity || 0) <= (p.low_stock_threshold ?? 10));

  if (lowStock.length === 0 || dismissed) return null;

  const critical = lowStock.filter(p => (p.stock_quantity || 0) === 0);
  const warning = lowStock.filter(p => (p.stock_quantity || 0) > 0);

  return (
    <div className={cn(
      "rounded-xl border overflow-hidden transition-all",
      critical.length > 0 ? "border-red-200 bg-red-50" : "border-orange-200 bg-orange-50"
    )}>
      {/* Header row */}
      <div className="flex items-center gap-3 px-4 py-3">
        <div className={cn(
          "w-8 h-8 rounded-lg flex items-center justify-center shrink-0",
          critical.length > 0 ? "bg-red-100" : "bg-orange-100"
        )}>
          <AlertTriangle className={cn("w-4 h-4", critical.length > 0 ? "text-red-600" : "text-orange-600")} />
        </div>

        <div className="flex-1 min-w-0">
          <p className={cn("text-sm font-semibold", critical.length > 0 ? "text-red-800" : "text-orange-800")}>
            {critical.length > 0
              ? `${critical.length} product${critical.length > 1 ? 's' : ''} out of stock · ${warning.length} running low`
              : `${lowStock.length} product${lowStock.length > 1 ? 's' : ''} running low on stock`}
          </p>
          <p className={cn("text-xs mt-0.5", critical.length > 0 ? "text-red-600" : "text-orange-600")}>
            Admin email alerts sent automatically when thresholds were crossed.
          </p>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <Link
            to="/admin/products"
            className={cn(
              "flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors",
              critical.length > 0
                ? "bg-red-600 text-white hover:bg-red-700"
                : "bg-orange-600 text-white hover:bg-orange-700"
            )}
          >
            Restock <ArrowRight className="w-3 h-3" />
          </Link>
          <button
            onClick={() => setExpanded(e => !e)}
            className={cn("p-1.5 rounded-lg transition-colors", critical.length > 0 ? "hover:bg-red-100 text-red-700" : "hover:bg-orange-100 text-orange-700")}
          >
            {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
          <button
            onClick={() => setDismissed(true)}
            className={cn("p-1.5 rounded-lg transition-colors", critical.length > 0 ? "hover:bg-red-100 text-red-400" : "hover:bg-orange-100 text-orange-400")}
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Expanded product list */}
      {expanded && (
        <div className={cn("border-t divide-y", critical.length > 0 ? "border-red-200 divide-red-200" : "border-orange-200 divide-orange-200")}>
          {lowStock.map(p => {
            const isOut = (p.stock_quantity || 0) === 0;
            return (
              <div key={p.id} className="flex items-center justify-between px-4 py-2.5">
                <div className="min-w-0">
                  <p className={cn("text-sm font-medium truncate", critical.length > 0 ? "text-red-900" : "text-orange-900")}>
                    {p.name}
                  </p>
                  <p className={cn("text-xs", critical.length > 0 ? "text-red-500" : "text-orange-500")}>
                    SKU: {p.sku}
                  </p>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <div className="text-right">
                    <p className={cn("text-sm font-bold", isOut ? "text-red-600" : "text-orange-600")}>
                      {isOut ? 'Out of stock' : `${p.stock_quantity} left`}
                    </p>
                    <p className="text-xs text-muted-foreground">min: {p.low_stock_threshold ?? 10}</p>
                  </div>
                  <Link
                    to="/admin/products"
                    className={cn(
                      "text-xs font-medium underline underline-offset-2",
                      isOut ? "text-red-600 hover:text-red-700" : "text-orange-600 hover:text-orange-700"
                    )}
                  >
                    Update
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}