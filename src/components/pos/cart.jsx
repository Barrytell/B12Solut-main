import React from 'react';
import { Minus, Plus, Trash2, ShoppingCart, Tag } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export default function Cart({ items, subtotal, taxTotal, discount, grandTotal, onUpdateQuantity, onRemoveItem, onSetDiscount, onCheckout, title = 'Current Sale', customerName, onSetCustomerName }) {
  return (
    <div className="bg-card rounded-xl border border-border lg:h-full flex flex-col">
      <div className="p-4 border-b border-border flex items-center gap-2">
        <ShoppingCart className="w-4 h-4 text-primary" />
        <h2 className="text-sm font-semibold">{title}</h2>
        <span className="ml-auto text-xs text-muted-foreground">{items.length} items</span>
      </div>

      {/* Cart items */}
      <div className="flex-1 overflow-y-auto divide-y divide-border">
        {items.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground py-12">
            <ShoppingCart className="w-10 h-10 opacity-20 mb-2" />
            <p className="text-sm">Cart is empty</p>
            <p className="text-xs">Scan or search to add items</p>
          </div>
        )}
        {items.map(item => (
          <div key={item.product_id} className="px-4 py-3 hover:bg-muted/30 transition-colors">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium truncate">{item.product_name}</p>
                <p className="text-xs text-muted-foreground">${item.unit_price.toFixed(2)} each</p>
              </div>
              <button onClick={() => onRemoveItem(item.product_id)} className="text-muted-foreground hover:text-destructive transition-colors p-1">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
            <div className="flex items-center justify-between mt-2">
              <div className="flex items-center gap-1">
                <button
                  onClick={() => onUpdateQuantity(item.product_id, item.quantity - 1)}
                  className="w-7 h-7 rounded-md bg-muted flex items-center justify-center hover:bg-muted/70 transition-colors"
                >
                  <Minus className="w-3 h-3" />
                </button>
                <span className="w-8 text-center text-sm font-semibold">{item.quantity}</span>
                <button
                  onClick={() => onUpdateQuantity(item.product_id, item.quantity + 1)}
                  className="w-7 h-7 rounded-md bg-muted flex items-center justify-center hover:bg-muted/70 transition-colors"
                >
                  <Plus className="w-3 h-3" />
                </button>
              </div>
              <p className="text-sm font-semibold">${item.line_total.toFixed(2)}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Totals & Checkout */}
      <div className="border-t border-border p-4 space-y-3">
        {onSetCustomerName && (
          <div className="space-y-1">
            <p className="text-xs font-medium text-muted-foreground">Wholesale customer</p>
            <Input
              value={customerName || ''}
              onChange={e => onSetCustomerName(e.target.value)}
              placeholder="Business or customer name"
              className="h-8 text-xs"
            />
          </div>
        )}

        {/* Discount */}
        <div className="flex items-center gap-2">
          <Tag className="w-3.5 h-3.5 text-muted-foreground" />
          <Input
            type="number"
            placeholder="Discount"
            value={discount || ''}
            onChange={e => onSetDiscount(parseFloat(e.target.value) || 0)}
            className="h-8 text-xs"
          />
        </div>

        <div className="space-y-1 text-sm">
          <div className="flex justify-between text-muted-foreground">
            <span>Subtotal</span>
            <span>${subtotal.toFixed(2)}</span>
          </div>
          <div className="flex justify-between text-muted-foreground">
            <span>Tax</span>
            <span>${taxTotal.toFixed(2)}</span>
          </div>
          {discount > 0 && (
            <div className="flex justify-between text-green-600">
              <span>Discount</span>
              <span>-${discount.toFixed(2)}</span>
            </div>
          )}
          <div className="flex justify-between text-lg font-bold pt-2 border-t border-border">
            <span>Total</span>
            <span className="text-primary">${grandTotal.toFixed(2)}</span>
          </div>
        </div>

        <Button
          onClick={onCheckout}
          disabled={items.length === 0}
          className="w-full h-12 text-base font-semibold rounded-xl"
        >
          Charge ${grandTotal.toFixed(2)}
        </Button>
      </div>
    </div>
  );
}