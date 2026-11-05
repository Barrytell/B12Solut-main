import React, { useState } from 'react';
import { Minus, Plus, Trash2, PackageCheck, PackageX } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

export default function ReturnItemRow({ item, onChange, onRemove }) {
  const [priceText, setPriceText] = useState(item.unit_price ? String(item.unit_price) : '');

  const priceValue = parseFloat(priceText) || 0;
  const lineRefund = priceValue * item.quantity;

  const commitPrice = () => {
    onChange({ ...item, unit_price: priceValue });
    setPriceText(priceValue ? String(priceValue) : '');
  };

  return (
    <div className="rounded-xl border border-border bg-background p-3 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-medium truncate">{item.product_name}</p>
          <p className="text-[11px] text-muted-foreground font-mono">{item.sku || '—'}</p>
        </div>
        <button
          onClick={onRemove}
          title="Remove item"
          className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-destructive transition-colors"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>

      <div className="flex items-center gap-2">
        <div className="flex items-center rounded-lg border border-border shrink-0">
          <button
            onClick={() => onChange({ ...item, quantity: Math.max(1, item.quantity - 1) })}
            className="p-2 hover:bg-muted rounded-l-lg"
          >
            <Minus className="w-3.5 h-3.5" />
          </button>
          <span className="w-8 text-center text-sm font-semibold">{item.quantity}</span>
          <button
            onClick={() => onChange({ ...item, quantity: item.quantity + 1 })}
            className="p-2 hover:bg-muted rounded-r-lg"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="relative flex-1 min-w-0">
          <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">$</span>
          <Input
            type="number"
            inputMode="decimal"
            aria-label="Refund unit price"
            value={priceText}
            onChange={e => setPriceText(e.target.value)}
            onBlur={commitPrice}
            className="h-9 pl-6 text-sm"
          />
        </div>

        <div className="text-right shrink-0">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Refund</p>
          <p className="text-sm font-bold">${lineRefund.toFixed(2)}</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <button
          onClick={() => onChange({ ...item, condition: 'good' })}
          className={cn(
            'flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-medium border-2 transition-all',
            item.condition === 'good'
              ? 'border-green-500 bg-green-50 text-green-700'
              : 'border-border text-muted-foreground hover:border-muted-foreground/30'
          )}
        >
          <PackageCheck className="w-3.5 h-3.5" /> Good — restock
        </button>
        <button
          onClick={() => onChange({ ...item, condition: 'damaged' })}
          className={cn(
            'flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-medium border-2 transition-all',
            item.condition === 'damaged'
              ? 'border-destructive bg-red-50 text-destructive'
              : 'border-border text-muted-foreground hover:border-muted-foreground/30'
          )}
        >
          <PackageX className="w-3.5 h-3.5" /> Damaged — write off
        </button>
      </div>
    </div>
  );
}