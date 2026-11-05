import React, { useState } from 'react';
import { X, Banknote, CreditCard, Smartphone } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

const methods = [
  { value: 'cash', label: 'Cash', icon: Banknote },
  { value: 'card', label: 'Card', icon: CreditCard },
  { value: 'electronic', label: 'E-Pay', icon: Smartphone },
];

const quickAmounts = [5, 10, 20, 50, 100];

export default function PaymentModal({ grandTotal, onPay, onClose }) {
  const [method, setMethod] = useState('cash');
  const [amountPaid, setAmountPaid] = useState('');
  const [processing, setProcessing] = useState(false);

  const paid = parseFloat(amountPaid) || 0;
  const change = Math.max(0, paid - grandTotal);
  const canPay = method !== 'cash' || paid >= grandTotal;

  // Guard against a double click charging the same sale twice
  const handlePay = async () => {
    if (processing) return;
    setProcessing(true);
    try {
      const finalAmount = method === 'cash' ? paid : grandTotal;
      await onPay(method, finalAmount);
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-card rounded-2xl border border-border w-full max-w-md shadow-2xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between p-5 border-b border-border">
          <h2 className="text-lg font-bold">Payment</h2>
          <button onClick={onClose} className="p-1 hover:bg-muted rounded-lg transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-5 overflow-y-auto flex-1">
          {/* Total */}
          <div className="text-center py-4 bg-muted/50 rounded-xl">
            <p className="text-xs text-muted-foreground uppercase tracking-wider">Total Due</p>
            <p className="text-4xl font-bold text-primary mt-1">${grandTotal.toFixed(2)}</p>
          </div>

          {/* Payment method */}
          <div className="grid grid-cols-3 gap-2">
            {methods.map(m => (
              <button
                key={m.value}
                onClick={() => setMethod(m.value)}
                className={cn(
                  "flex flex-col items-center gap-1.5 p-3 rounded-xl border-2 transition-all",
                  method === m.value
                    ? "border-primary bg-primary/5"
                    : "border-border hover:border-muted-foreground/30"
                )}
              >
                <m.icon className={cn("w-5 h-5", method === m.value ? "text-primary" : "text-muted-foreground")} />
                <span className="text-xs font-medium">{m.label}</span>
              </button>
            ))}
          </div>

          {/* Cash input */}
          {method === 'cash' && (
            <div className="space-y-3">
              <Input
                type="number"
                placeholder="Amount received"
                value={amountPaid}
                onChange={e => setAmountPaid(e.target.value)}
                className="h-12 text-lg text-center font-semibold"
                autoFocus
              />
              <div className="flex gap-2 flex-wrap">
                {quickAmounts.map(amt => (
                  <button
                    key={amt}
                    onClick={() => setAmountPaid(String(amt))}
                    className="flex-1 min-w-[60px] py-2 bg-muted rounded-lg text-sm font-medium hover:bg-muted/70 transition-colors"
                  >
                    ${amt}
                  </button>
                ))}
                <button
                  onClick={() => setAmountPaid(String(Math.ceil(grandTotal)))}
                  className="flex-1 min-w-[60px] py-2 bg-primary/10 text-primary rounded-lg text-sm font-medium hover:bg-primary/20 transition-colors"
                >
                  Exact
                </button>
              </div>
              {paid > 0 && (
                <div className="text-center py-3 bg-green-50 rounded-xl border border-green-200">
                  <p className="text-xs text-green-600">Change Due</p>
                  <p className="text-2xl font-bold text-green-700">${change.toFixed(2)}</p>
                </div>
              )}
            </div>
          )}

        </div>

        <div className="p-5 pt-0 shrink-0">
          <Button
            onClick={handlePay}
            disabled={!canPay || processing}
            className="w-full h-12 text-base font-semibold rounded-xl"
          >
            {processing ? 'Processing…' : 'Complete Sale'}
          </Button>
        </div>
      </div>
    </div>
  );
}