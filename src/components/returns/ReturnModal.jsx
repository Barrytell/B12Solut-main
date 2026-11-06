import React, { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '@/api/client';
import { formatMoney } from '@/lib/money';
import { Search, ScanBarcode, RotateCcw, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import BarcodeScannerModal from '@/components/pos/BarcodeScannerModal';
import ReturnItemRow from '@/components/returns/ReturnItemRow';
import { calcReturnItem, calcReturnTotals, makeReturnItem } from '@/utils/returns';

const refundMethods = [
  { value: 'cash', label: 'Cash' },
  { value: 'card', label: 'Card' },
  { value: 'electronic', label: 'E-Pay' },
  { value: 'store_credit', label: 'Store Credit' },
];

export default function ReturnModal({ products, onClose, onComplete }) {
  const queryClient = useQueryClient();
  const [items, setItems] = useState([]);
  const [search, setSearch] = useState('');
  const [showScanner, setShowScanner] = useState(false);
  const [refundMethod, setRefundMethod] = useState('cash');
  const [reason, setReason] = useState('');
  const [receiptRef, setReceiptRef] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const query = search.trim().toLowerCase();
  const matches = useMemo(() => {
    if (!query) return [];
    return products
      .filter(p =>
        p.name?.toLowerCase().includes(query) ||
        p.sku?.toLowerCase().includes(query) ||
        p.barcode?.includes(query)
      )
      .slice(0, 6);
  }, [products, query]);

  const totals = calcReturnTotals(items);

  const addProduct = (product) => {
    setItems(prev => {
      const existing = prev.find(i => i.product_id === product.id && i.condition === 'good');
      if (existing) {
        return prev.map(i =>
          i.uid === existing.uid ? calcReturnItem({ ...i, quantity: i.quantity + 1 }) : i
        );
      }
      return [...prev, { ...makeReturnItem(product), uid: `${product.id}-${Date.now()}` }];
    });
    setSearch('');
  };

  const updateItem = (uid, updated) =>
    setItems(prev => prev.map(i => (i.uid === uid ? calcReturnItem(updated) : i)));

  const removeItem = (uid) => setItems(prev => prev.filter(i => i.uid !== uid));

  const handleSubmit = async () => {
    if (items.length === 0) {
      toast.error('Add at least one returned item');
      return;
    }
    setSubmitting(true);
    try {
      // One atomic server call: the return, restocking and audit rows commit
      // together. Costs come from the database; the refund price is the admin's.
      const body = {
        items: items.map(i => ({ product_id: i.product_id, quantity: i.quantity, unit_price: i.unit_price, condition: i.condition })),
        refund_method: refundMethod,
      };
      if (receiptRef.trim()) body.original_transaction_number = receiptRef.trim();
      if (reason.trim()) body.reason = reason.trim();

      const { return: record, restocked_units: restockedUnits, written_off_units: writtenOffUnits } = await api.returns.create(body);

      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['returns'] });
      queryClient.invalidateQueries({ queryKey: ['stock-adjustments'] });
      toast.success(
        `Return ${record.return_number} · ${formatMoney(record.total_refund)} refunded · ` +
          `${restockedUnits} back in stock` +
          (writtenOffUnits ? ` · ${writtenOffUnits} written off` : '')
      );
      onComplete?.();
    } catch (error) {
      toast.error(error?.message || 'Could not process the return. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-card rounded-2xl border border-border w-full max-w-lg shadow-2xl max-h-[92vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-border shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
              <RotateCcw className="w-4 h-4 text-primary" />
            </div>
            <div>
              <h2 className="text-base font-bold leading-tight">Process Return</h2>
              <p className="text-[11px] text-muted-foreground">Scan returned items and record the refund</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-muted rounded-lg transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 p-5 space-y-4">
          {/* Search / scan */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search or scan returned item..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-10 pr-10 h-11 bg-muted/50"
            />
            <button
              onClick={() => setShowScanner(true)}
              title="Scan barcode"
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-primary transition-colors"
            >
              <ScanBarcode className="w-4 h-4" />
            </button>
          </div>

          {/* Search matches */}
          {matches.length > 0 && (
            <div className="rounded-xl border border-border divide-y divide-border overflow-hidden">
              {matches.map(p => (
                <button
                  key={p.id}
                  onClick={() => addProduct(p)}
                  className="w-full flex items-center justify-between gap-3 px-3 py-2.5 text-left hover:bg-muted/60 transition-colors"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{p.name}</p>
                    <p className="text-[11px] text-muted-foreground font-mono">{p.sku}</p>
                  </div>
                  <span className="text-sm font-semibold text-primary shrink-0">
                    ${(p.selling_price || 0).toFixed(2)}
                  </span>
                </button>
              ))}
            </div>
          )}

          {/* Returned items */}
          {items.length === 0 ? (
            <div className="text-center py-10 text-sm text-muted-foreground">
              <RotateCcw className="w-6 h-6 mx-auto mb-2 opacity-40" />
              No items added yet — scan or search for what&apos;s coming back
            </div>
          ) : (
            <div className="space-y-3">
              {items.map(item => (
                <ReturnItemRow
                  key={item.uid}
                  item={item}
                  onChange={updated => updateItem(item.uid, updated)}
                  onRemove={() => removeItem(item.uid)}
                />
              ))}
            </div>
          )}

          {/* Details */}
          <div className="grid sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Original receipt # (optional)</Label>
              <Input
                placeholder="TX-XXXX"
                value={receiptRef}
                onChange={e => setReceiptRef(e.target.value)}
                className="h-9 text-sm"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Reason</Label>
              <Input
                placeholder="e.g. Wrong size"
                value={reason}
                onChange={e => setReason(e.target.value)}
                className="h-9 text-sm"
              />
            </div>
          </div>

          {/* Refund method */}
          <div className="space-y-1.5">
            <Label className="text-xs">Refund method</Label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {refundMethods.map(m => (
                <button
                  key={m.value}
                  onClick={() => setRefundMethod(m.value)}
                  className={cn(
                    'py-2 rounded-lg text-xs font-medium border-2 transition-all',
                    refundMethod === m.value
                      ? 'border-primary bg-primary/5 text-primary'
                      : 'border-border text-muted-foreground hover:border-muted-foreground/30'
                  )}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>

          {/* Summary */}
          {items.length > 0 && (
            <div className="rounded-xl bg-muted/50 p-4 space-y-1.5 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Total refund</span>
                <span className="font-semibold">${totals.total_refund.toFixed(2)}</span>
              </div>
              {totals.total_cost_recovered > 0 && (
                <div className="flex justify-between text-muted-foreground">
                  <span>Back to inventory (good)</span>
                  <span>${totals.total_cost_recovered.toFixed(2)}</span>
                </div>
              )}
              {totals.total_cost_lost > 0 && (
                <div className="flex justify-between text-muted-foreground">
                  <span>Damaged write-off</span>
                  <span>-${totals.total_cost_lost.toFixed(2)}</span>
                </div>
              )}
              <div className="flex justify-between border-t border-border pt-1.5 font-semibold text-destructive">
                <span>Profit impact</span>
                <span>-${Math.abs(totals.profit_impact).toFixed(2)}</span>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-5 pt-0 flex gap-2 shrink-0">
          <Button
            onClick={handleSubmit}
            disabled={items.length === 0 || submitting}
            className="flex-1 h-11 rounded-xl font-semibold"
          >
            {submitting
              ? 'Processing…'
              : `Process Return${items.length > 0 ? ` · $${totals.total_refund.toFixed(2)}` : ''}`}
          </Button>
          <Button variant="outline" onClick={onClose} className="h-11 px-5 rounded-xl">
            Cancel
          </Button>
        </div>
      </div>

      {showScanner && (
        <BarcodeScannerModal
          products={products}
          onAdd={addProduct}
          onClose={() => setShowScanner(false)}
        />
      )}
    </div>
  );
}