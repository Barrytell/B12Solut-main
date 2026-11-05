import React, { useState } from 'react';
import { X, Printer, FileText, Settings, ChevronDown, ChevronUp, CheckCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { printThermalReceipt } from '@/utils/thermalReceipt';
import { generateSaleInvoicePDF } from '@/utils/saleInvoicePDF';
import { loadStoreSettings, saveStoreSettings } from '@/utils/storeSettings';

export default function ReceiptModal({ transaction, onClose }) {
  const [settings, setSettings] = useState(loadStoreSettings);
  const [showSettings, setShowSettings] = useState(false);

  const set = (key, val) => setSettings(s => ({ ...s, [key]: val }));

  const handlePrint = () => {
    saveStoreSettings(settings);
    printThermalReceipt({ transaction, storeSettings: settings });
  };

  const handleInvoice = () => {
    saveStoreSettings(settings);
    generateSaleInvoicePDF(transaction);
  };

  const {
    items = [],
    subtotal = 0,
    tax_total = 0,
    discount_amount = 0,
    grand_total = 0,
    change_given = 0,
    payment_method = '',
    transaction_number = '',
    sale_type = 'retail',
    customer_name = '',
  } = transaction;

  const isWholesale = sale_type === 'wholesale';

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-card rounded-2xl border border-border w-full max-w-sm shadow-2xl max-h-[92vh] flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-border shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center">
              <CheckCircle className="w-4 h-4 text-green-600" />
            </div>
            <div>
              <h2 className="text-base font-bold leading-tight">{isWholesale ? 'Wholesale Order' : 'Sale Complete'}</h2>
              <p className="text-[11px] text-muted-foreground">{transaction_number}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-muted rounded-lg transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="overflow-y-auto flex-1">
          <div className="p-5 space-y-4">

            {/* Grand total banner */}
            <div className="text-center py-4 bg-green-50 rounded-xl border border-green-200">
              <p className="text-[11px] text-green-600 uppercase tracking-widest font-medium">Total Charged</p>
              <p className="text-4xl font-bold text-green-700 mt-1">${grand_total.toFixed(2)}</p>
              <p className="text-xs text-green-600 mt-1 capitalize">{payment_method}</p>
              {change_given > 0 && (
                <p className="text-sm font-semibold text-green-700 mt-1">Change: ${change_given.toFixed(2)}</p>
              )}
            </div>

            {/* Receipt preview — styled like the thermal output */}
            <div className="bg-white border border-dashed border-border rounded-xl p-4 font-mono text-[11px] text-black leading-relaxed">
              {/* Store details */}
              <div className="text-center mb-2 pb-2 border-b border-dashed border-gray-400">
                {settings.storeLogo && (
                  <img
                    src={settings.storeLogo}
                    alt=""
                    className="max-h-12 mx-auto mb-1 object-contain"
                    onError={e => { e.currentTarget.style.display = 'none'; }}
                  />
                )}
                <p className="font-bold text-[12px] tracking-wide">{settings.storeName || 'RetailHub Store'}</p>
                {settings.storeAddress && (
                  <p className="text-[10px] text-gray-600 whitespace-pre-line">{settings.storeAddress}</p>
                )}
                {settings.storePhone && <p className="text-[10px] text-gray-600">Tel: {settings.storePhone}</p>}
                {settings.storeEmail && <p className="text-[10px] text-gray-600">{settings.storeEmail}</p>}
                {settings.storeWebsite && <p className="text-[10px] text-gray-600">{settings.storeWebsite}</p>}
              </div>

              {/* Wholesale order details */}
              {(isWholesale || customer_name) && (
                <div className="mb-2 pb-2 border-b border-dashed border-gray-400 space-y-0.5">
                  {isWholesale && (
                    <div className="flex justify-between">
                      <span>Order Type</span>
                      <span>WHOLESALE</span>
                    </div>
                  )}
                  {customer_name && (
                    <div className="flex justify-between gap-2">
                      <span>Customer</span>
                      <span className="truncate">{customer_name}</span>
                    </div>
                  )}
                </div>
              )}

              {/* Items */}
              <div className="space-y-0.5">
                {items.map((item, i) => (
                  <div key={i} className="flex justify-between gap-2">
                    <span className="truncate">{item.quantity}× {item.product_name}</span>
                    <span className="shrink-0">${(item.line_total || 0).toFixed(2)}</span>
                  </div>
                ))}
              </div>

              {/* Divider */}
              <div className="border-t border-dashed border-gray-400 my-2" />

              {/* Totals */}
              <div className="space-y-0.5">
                <div className="flex justify-between">
                  <span>Subtotal</span>
                  <span>${subtotal.toFixed(2)}</span>
                </div>
                {tax_total > 0 && (
                  <div className="flex justify-between text-gray-600">
                    <span>{settings.taxLabel || 'Tax'}</span>
                    <span>${tax_total.toFixed(2)}</span>
                  </div>
                )}
                {discount_amount > 0 && (
                  <div className="flex justify-between text-gray-600">
                    <span>Discount</span>
                    <span>-${discount_amount.toFixed(2)}</span>
                  </div>
                )}
                <div className="flex justify-between font-bold text-[13px] border-t border-double border-gray-400 pt-1 mt-1">
                  <span>TOTAL</span>
                  <span>${grand_total.toFixed(2)}</span>
                </div>
              </div>

              {/* Footer preview */}
              {settings.footerText && (
                <>
                  <div className="border-t border-dashed border-gray-400 my-2" />
                  <p className="text-center text-[10px] text-gray-500 whitespace-pre-line">{settings.footerText}</p>
                </>
              )}
            </div>

            {/* Store settings toggle */}
            <button
              onClick={() => setShowSettings(s => !s)}
              className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors w-full group"
            >
              <Settings className="w-3.5 h-3.5 group-hover:rotate-12 transition-transform" />
              <span>Store / Printer Settings</span>
              {showSettings ? <ChevronUp className="w-3 h-3 ml-auto" /> : <ChevronDown className="w-3 h-3 ml-auto" />}
            </button>

            {showSettings && (
              <div className="space-y-3 bg-muted/40 rounded-xl p-4 border border-border">
                <div className="grid grid-cols-2 gap-2">
                  <div className="col-span-2 space-y-1">
                    <Label className="text-xs">Store Name</Label>
                    <Input placeholder="RetailHub Store" value={settings.storeName || ''} onChange={e => set('storeName', e.target.value)} className="h-8 text-sm" />
                  </div>
                  <div className="col-span-2 space-y-1">
                    <Label className="text-xs">Address</Label>
                    <Input placeholder="123 Main St, City" value={settings.storeAddress || ''} onChange={e => set('storeAddress', e.target.value)} className="h-8 text-sm" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Phone</Label>
                    <Input placeholder="+1 555-0100" value={settings.storePhone || ''} onChange={e => set('storePhone', e.target.value)} className="h-8 text-sm" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Email</Label>
                    <Input placeholder="hello@mystore.com" value={settings.storeEmail || ''} onChange={e => set('storeEmail', e.target.value)} className="h-8 text-sm" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Website</Label>
                    <Input placeholder="www.mystore.com" value={settings.storeWebsite || ''} onChange={e => set('storeWebsite', e.target.value)} className="h-8 text-sm" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Tax Label</Label>
                    <Input placeholder="GST / VAT / Tax" value={settings.taxLabel || ''} onChange={e => set('taxLabel', e.target.value)} className="h-8 text-sm" />
                  </div>
                  <div className="col-span-2 space-y-1">
                    <Label className="text-xs">Logo URL</Label>
                    <Input placeholder="https://..." value={settings.storeLogo || ''} onChange={e => set('storeLogo', e.target.value)} className="h-8 text-sm" />
                  </div>
                  <div className="col-span-2 space-y-1">
                    <Label className="text-xs">Footer Message (one line per row)</Label>
                    <textarea
                      rows={2}
                      placeholder="Thanks for your patronage!"
                      value={settings.footerText || ''}
                      onChange={e => set('footerText', e.target.value)}
                      className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm resize-none focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    />
                  </div>
                  <div className="col-span-2 flex items-center justify-between">
                    <Label className="text-xs">Show per-item tax breakdown</Label>
                    <Switch
                      checked={settings.showItemTax !== false}
                      onCheckedChange={v => set('showItemTax', v)}
                    />
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Action buttons */}
        <div className="p-5 pt-0 space-y-2 shrink-0">
          <div className="flex gap-2">
            <Button onClick={handlePrint} className="flex-1 h-11 rounded-xl font-semibold gap-2">
              <Printer className="w-4 h-4" /> Print Receipt
            </Button>
            <Button variant="outline" onClick={handleInvoice} className="flex-1 h-11 rounded-xl font-semibold gap-2">
              <FileText className="w-4 h-4" /> PDF Invoice
            </Button>
          </div>
          <Button variant="ghost" onClick={onClose} className="w-full h-9 rounded-xl text-muted-foreground">
            Skip
          </Button>
        </div>
      </div>
    </div>
  );
}