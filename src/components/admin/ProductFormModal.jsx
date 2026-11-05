import React, { useState } from 'react';
import { X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import ProductImageField from '@/components/admin/ProductImageField';

export default function ProductFormModal({ product, onSave, onClose }) {
  const { data: suppliers = [] } = useQuery({
    queryKey: ['suppliers'],
    queryFn: () => base44.entities.Supplier.list(),
  });

  const { data: categories = [] } = useQuery({
    queryKey: ['categories'],
    queryFn: () => base44.entities.Category.list('name'),
  });

  const [form, setForm] = useState({
    name: product?.name || '',
    sku: product?.sku || '',
    barcode: product?.barcode || '',
    category: product?.category || 'other',
    selling_price: product?.selling_price || '',
    wholesale_price: product?.wholesale_price ?? '',
    cost_price: product?.cost_price || '',
    stock_quantity: product?.stock_quantity ?? '',
    low_stock_threshold: product?.low_stock_threshold ?? 10,
    tax_rate: product?.tax_rate ?? 0,
    is_active: product?.is_active ?? true,
    image_url: product?.image_url || '',
    supplier_id: product?.supplier_id || '',
  });
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    await onSave({
      ...form,
      selling_price: parseFloat(form.selling_price) || 0,
      wholesale_price: parseFloat(form.wholesale_price) || 0,
      cost_price: parseFloat(form.cost_price) || 0,
      stock_quantity: parseInt(form.stock_quantity) || 0,
      low_stock_threshold: parseInt(form.low_stock_threshold) || 10,
      tax_rate: parseFloat(form.tax_rate) || 0,
    });
    setSaving(false);
  };

  const update = (field, value) => setForm(prev => ({ ...prev, [field]: value }));

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-card rounded-2xl border border-border w-full max-w-lg shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-5 border-b border-border sticky top-0 bg-card rounded-t-2xl">
          <h2 className="text-lg font-bold">{product ? 'Edit Product' : 'Add Product'}</h2>
          <button onClick={onClose} className="p-1 hover:bg-muted rounded-lg"><X className="w-5 h-5" /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2 space-y-1.5">
              <Label>Product Name *</Label>
              <Input value={form.name} onChange={e => update('name', e.target.value)} required />
            </div>
            <div className="space-y-1.5">
              <Label>SKU *</Label>
              <Input value={form.sku} onChange={e => update('sku', e.target.value)} required />
            </div>
            <div className="space-y-1.5">
              <Label>Barcode</Label>
              <Input value={form.barcode} onChange={e => update('barcode', e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Category</Label>
              <Select value={form.category} onValueChange={v => update('category', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {categories.map(c => (
                    <SelectItem key={c.id} value={c.name}>{c.name.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Tax Rate (%)</Label>
              <Input type="number" value={form.tax_rate} onChange={e => update('tax_rate', e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Cost Price ($)</Label>
              <Input type="number" step="0.01" value={form.cost_price} onChange={e => update('cost_price', e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Retail Price ($) *</Label>
              <Input type="number" step="0.01" value={form.selling_price} onChange={e => update('selling_price', e.target.value)} required />
            </div>
            <div className="space-y-1.5">
              <Label>Wholesale Price ($)</Label>
              <Input type="number" step="0.01" value={form.wholesale_price} onChange={e => update('wholesale_price', e.target.value)} />
              <p className="text-[11px] text-muted-foreground">Charged on wholesale orders. Falls back to the retail price if left blank.</p>
            </div>
            <div className="space-y-1.5">
              <Label>Stock Quantity</Label>
              <Input type="number" value={form.stock_quantity} onChange={e => update('stock_quantity', e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Low Stock Threshold</Label>
              <Input type="number" value={form.low_stock_threshold} onChange={e => update('low_stock_threshold', e.target.value)} />
            </div>
            <ProductImageField value={form.image_url} onChange={v => update('image_url', v)} />
            {suppliers.length > 0 && (
              <div className="col-span-2 space-y-1.5">
                <Label>Supplier</Label>
                <Select value={form.supplier_id || 'none'} onValueChange={v => update('supplier_id', v === 'none' ? '' : v)}>
                  <SelectTrigger><SelectValue placeholder="No supplier" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No supplier</SelectItem>
                    {suppliers.map(s => (
                      <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="col-span-2 flex items-center justify-between py-2">
              <Label>Active (available for sale)</Label>
              <Switch checked={form.is_active} onCheckedChange={v => update('is_active', v)} />
            </div>
          </div>
          <div className="flex gap-3 pt-2">
            <Button type="button" variant="outline" onClick={onClose} className="flex-1">Cancel</Button>
            <Button type="submit" disabled={saving} className="flex-1">{saving ? 'Saving...' : 'Save Product'}</Button>
          </div>
        </form>
      </div>
    </div>
  );
}