import React, { useState, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Search, ScanBarcode } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { api } from '@/api/client';
import BarcodeScannerModal from './BarcodeScannerModal';

const prettify = (s) => s.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());

export default function ProductSearch({ products, onAddToCart, getPrice = (p) => p.selling_price || 0, mode = 'retail' }) {
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('all');
  const [showScanner, setShowScanner] = useState(false);
  const searchRef = useRef(null);

  const { data: categoryEntities = [] } = useQuery({
    queryKey: ['categories'],
    queryFn: () => api.entities.Category.list('name'),
  });
  const categories = [
    { value: 'all', label: 'All' },
    ...categoryEntities.map(c => ({ value: c.name, label: prettify(c.name) })),
  ];

  const filtered = products.filter(p => {
    const matchSearch = !search || 
      p.name?.toLowerCase().includes(search.toLowerCase()) ||
      p.sku?.toLowerCase().includes(search.toLowerCase()) ||
      p.barcode?.includes(search);
    const matchCategory = category === 'all' || p.category === category;
    return matchSearch && matchCategory;
  });

  return (
    <div className="bg-card rounded-xl border border-border h-full flex flex-col">
      {/* Search bar */}
      <div className="p-4 border-b border-border space-y-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            ref={searchRef}
            placeholder="Search products or scan barcode..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-10 h-11 bg-muted/50"
          />
          <button
            onClick={() => setShowScanner(true)}
            className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-primary transition-colors"
            title="Scan barcode"
          >
            <ScanBarcode className="w-4 h-4" />
          </button>
        </div>
        <div className="flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar">
          {categories.map(cat => (
            <button
              key={cat.value}
              onClick={() => setCategory(cat.value)}
              className={cn(
                "px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-all",
                category === cat.value
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:bg-muted/80"
              )}
            >
              {cat.label}
            </button>
          ))}
        </div>
      </div>

      {/* Product grid */}
      <div className="flex-1 overflow-y-auto p-4">
        <div className="grid grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-3">
          {filtered.map(product => (
            <button
              key={product.id}
              onClick={() => onAddToCart(product)}
              className="bg-background rounded-lg border border-border p-3.5 text-left hover:border-primary hover:shadow-md transition-all duration-200 group"
            >
              <div className="aspect-square rounded-md bg-muted/50 flex items-center justify-center mb-2 overflow-hidden">
                {product.image_url ? (
                  <img src={product.image_url} alt={product.name} className="w-full h-full object-cover" />
                ) : (
                  <span className="text-2xl opacity-40">📦</span>
                )}
              </div>
              <p className="text-base lg:text-lg font-semibold leading-snug line-clamp-2 group-hover:text-primary transition-colors">
                {product.name}
              </p>
              <p className="text-xs lg:text-sm text-foreground/70 mt-0.5 leading-snug line-clamp-2">
                {product.sku}{product.category ? ` · ${prettify(product.category)}` : ''}
              </p>
              <div className="flex items-center justify-between mt-1">
                <div className="flex items-baseline gap-1.5">
                  <p className="text-sm font-bold text-primary">${getPrice(product).toFixed(2)}</p>
                  {mode === 'wholesale' && product.wholesale_price > 0 && (
                    <p className="text-[11px] text-muted-foreground line-through">
                      ${(product.selling_price || 0).toFixed(2)}
                    </p>
                  )}
                </div>
                <span className={cn(
                  "text-[10px] font-medium px-1.5 py-0.5 rounded",
                  (product.stock_quantity || 0) <= (product.low_stock_threshold || 10)
                    ? "bg-red-100 text-red-600"
                    : "bg-green-100 text-green-600"
                )}>
                  {product.stock_quantity || 0} in stock
                </span>
              </div>
            </button>
          ))}
          {filtered.length === 0 && (
            <div className="col-span-full text-center py-12 text-muted-foreground text-sm">
              No products found
            </div>
          )}
        </div>
      </div>
      {showScanner && (
        <BarcodeScannerModal
          products={products}
          onAdd={(product) => { onAddToCart(product); }}
          onClose={() => setShowScanner(false)}
        />
      )}
    </div>
  );
}