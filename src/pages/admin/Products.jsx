import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Plus, Search, Pencil, Trash2, Package } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import ProductFormModal from '@/components/admin/ProductFormModal';
import { toast } from 'sonner';

export default function Products() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);

  const { data: products = [], isLoading } = useQuery({
    queryKey: ['products-admin'],
    queryFn: () => base44.entities.Product.list('-created_date'),
  });

  const filtered = products.filter(p =>
    !search || p.name?.toLowerCase().includes(search.toLowerCase()) || p.sku?.toLowerCase().includes(search.toLowerCase())
  );

  const handleSave = async (data) => {
    if (editingProduct) {
      await base44.entities.Product.update(editingProduct.id, data);
      toast.success('Product updated!');
    } else {
      await base44.entities.Product.create(data);
      toast.success('Product created!');
    }
    queryClient.invalidateQueries({ queryKey: ['products-admin'] });
    queryClient.invalidateQueries({ queryKey: ['products'] });
    setShowForm(false);
    setEditingProduct(null);
  };

  const handleDelete = async (id) => {
    if (!confirm('Delete this product?')) return;
    await base44.entities.Product.delete(id);
    queryClient.invalidateQueries({ queryKey: ['products-admin'] });
    toast.success('Product deleted');
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Products</h1>
          <p className="text-sm text-muted-foreground">{products.length} products in inventory</p>
        </div>
        <Button onClick={() => { setEditingProduct(null); setShowForm(true); }} className="rounded-xl">
          <Plus className="w-4 h-4 mr-2" /> Add Product
        </Button>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Search products..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="pl-10"
        />
      </div>

      <div className="bg-card rounded-xl border border-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Product</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">SKU</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Category</th>
                <th className="text-right px-4 py-3 font-medium text-muted-foreground">Cost</th>
                <th className="text-right px-4 py-3 font-medium text-muted-foreground">Retail</th>
                <th className="text-right px-4 py-3 font-medium text-muted-foreground">Wholesale</th>
                <th className="text-right px-4 py-3 font-medium text-muted-foreground">Margin</th>
                <th className="text-right px-4 py-3 font-medium text-muted-foreground">Stock</th>
                <th className="text-right px-4 py-3 font-medium text-muted-foreground">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map(p => {
                const margin = p.selling_price && p.cost_price ? ((p.selling_price - p.cost_price) / p.selling_price * 100) : 0;
                return (
                  <tr key={p.id} className="hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-lg bg-muted flex items-center justify-center">
                          {p.image_url ? (
                            <img src={p.image_url} className="w-full h-full rounded-lg object-cover" />
                          ) : (
                            <Package className="w-4 h-4 text-muted-foreground" />
                          )}
                        </div>
                        <div>
                          <p className="font-medium">{p.name}</p>
                          {p.barcode && <p className="text-[11px] text-muted-foreground">{p.barcode}</p>}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{p.sku}</td>
                    <td className="px-4 py-3">
                      <Badge variant="secondary" className="text-[11px]">{p.category || '-'}</Badge>
                    </td>
                    <td className="px-4 py-3 text-right">${(p.cost_price || 0).toFixed(2)}</td>
                    <td className="px-4 py-3 text-right font-medium">${(p.selling_price || 0).toFixed(2)}</td>
                    <td className="px-4 py-3 text-right text-muted-foreground">
                      {p.wholesale_price > 0 ? `$${p.wholesale_price.toFixed(2)}` : '—'}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className={cn("font-medium", margin >= 30 ? "text-green-600" : margin >= 15 ? "text-yellow-600" : "text-red-500")}>
                        {margin.toFixed(1)}%
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className={cn(
                        "font-medium",
                        (p.stock_quantity || 0) <= (p.low_stock_threshold || 10) ? "text-destructive" : ""
                      )}>
                        {p.stock_quantity || 0}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <button onClick={() => { setEditingProduct(p); setShowForm(true); }} className="p-1.5 hover:bg-muted rounded-lg transition-colors">
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => handleDelete(p.id)} className="p-1.5 hover:bg-destructive/10 rounded-lg transition-colors text-destructive">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {showForm && (
        <ProductFormModal
          product={editingProduct}
          onSave={handleSave}
          onClose={() => { setShowForm(false); setEditingProduct(null); }}
        />
      )}
    </div>
  );
}