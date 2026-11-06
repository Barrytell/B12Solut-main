import React, { useState, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/api/client';
import { Plus, Search, Save, RotateCcw, Package, TrendingUp, AlertTriangle, CheckSquare, Square, Layers, X, ArrowUpDown } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import ProductFormModal from '@/components/admin/ProductFormModal';
import StockAdjustmentLog from '@/components/admin/StockAdjustmentLog';
import { toast } from 'sonner';
import { sumMoney, mulMoney } from '@/lib/money';

export default function InventoryManager() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [stockFilter, setStockFilter] = useState('all'); // all | low | out
  const [showForm, setShowForm] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);
  const [edits, setEdits] = useState({}); // { [productId]: { field: value } }
  const [selected, setSelected] = useState(new Set());
  const [bulkStock, setBulkStock] = useState('');
  const [bulkMode, setBulkMode] = useState('set'); // 'set' | 'add' | 'subtract'
  const [saving, setSaving] = useState(false);
  const [adjustmentReason, setAdjustmentReason] = useState('');
  const [bulkReason, setBulkReason] = useState('');

  const { data: products = [], isLoading } = useQuery({
    queryKey: ['products-inventory'],
    queryFn: () => api.entities.Product.list('-created_date'),
  });

  const { data: categoryEntities = [] } = useQuery({
    queryKey: ['categories'],
    queryFn: () => api.entities.Category.list('name'),
  });
  const categories = ['all', ...categoryEntities.map(c => c.name)];

  const filtered = useMemo(() => {
    return products.filter(p => {
      const matchSearch = !search ||
        p.name?.toLowerCase().includes(search.toLowerCase()) ||
        p.sku?.toLowerCase().includes(search.toLowerCase()) ||
        p.barcode?.toLowerCase().includes(search.toLowerCase());
      const matchCat = categoryFilter === 'all' || p.category === categoryFilter;
      const qty = p.stock_quantity || 0;
      const threshold = p.low_stock_threshold || 10;
      const matchStock =
        stockFilter === 'all' ||
        (stockFilter === 'low' && qty > 0 && qty <= threshold) ||
        (stockFilter === 'out' && qty === 0);
      return matchSearch && matchCat && matchStock;
    });
  }, [products, search, categoryFilter, stockFilter]);

  // Stats
  const totalProducts = products.length;
  const lowStock = products.filter(p => (p.stock_quantity || 0) <= (p.low_stock_threshold || 10) && p.stock_quantity > 0).length;
  const outOfStock = products.filter(p => (p.stock_quantity || 0) === 0).length;
  const totalValue = sumMoney(products.map(p => mulMoney(p.cost_price || 0, p.stock_quantity || 0)));

  const getEdit = (id, field, fallback) => edits[id]?.[field] !== undefined ? edits[id][field] : fallback;
  const setEdit = (id, field, value) => setEdits(prev => ({ ...prev, [id]: { ...prev[id], [field]: value } }));
  const hasEdits = Object.keys(edits).length > 0;

  const dirtyIds = Object.keys(edits);

  const stockChangeCount = useMemo(() => {
    return dirtyIds.filter(id => {
      const product = products.find(p => p.id === id);
      if (!product) return false;
      const patch = edits[id];
      if (patch?.stock_quantity === undefined) return false;
      return (parseInt(patch.stock_quantity) || 0) !== (product.stock_quantity || 0);
    }).length;
  }, [edits, products, dirtyIds]);

  const canSaveInline = stockChangeCount === 0 || adjustmentReason.trim().length > 0;

  const saveAll = async () => {
    if (!hasEdits) return;
    if (stockChangeCount > 0 && !adjustmentReason.trim()) {
      toast.error('A reason is required when changing stock quantities');
      return;
    }
    setSaving(true);
    try {
      // One atomic call: every row is locked, the previous stock is read on the
      // server, every stock change is audited, and all rows save or none do.
      const updates = dirtyIds.filter(id => products.some(p => p.id === id)).map(id => {
        const patch = edits[id];
        const parsed = { product_id: id };
        if (patch.stock_quantity !== undefined) parsed.stock_quantity = parseInt(patch.stock_quantity) || 0;
        if (patch.selling_price !== undefined) parsed.selling_price = patch.selling_price === '' ? 0 : patch.selling_price;
        if (patch.wholesale_price !== undefined) parsed.wholesale_price = patch.wholesale_price === '' ? 0 : patch.wholesale_price;
        if (patch.cost_price !== undefined) parsed.cost_price = patch.cost_price === '' ? 0 : patch.cost_price;
        if (patch.low_stock_threshold !== undefined) parsed.low_stock_threshold = parseInt(patch.low_stock_threshold) || 10;
        return parsed;
      });
      await api.inventory.update({ reason: adjustmentReason.trim() || undefined, updates });
      queryClient.invalidateQueries({ queryKey: ['stock-adjustments'] });
      toast.success(`Saved changes to ${dirtyIds.length} product(s)`);
      setEdits({});
      setAdjustmentReason('');
      queryClient.invalidateQueries({ queryKey: ['products-inventory'] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
    } catch (err) {
      toast.error(err?.message || 'Could not save the changes; nothing was changed');
    } finally {
      setSaving(false);
    }
  };

  const discardEdits = () => { setEdits({}); setAdjustmentReason(''); };

  // Bulk stock update for selected rows
  const applyBulkStock = async () => {
    const val = parseInt(bulkStock);
    if (isNaN(val) || selected.size === 0) return;
    if (!bulkReason.trim()) {
      toast.error('A reason is required for bulk stock changes');
      return;
    }
    if (val < 0) {
      toast.error('Enter a quantity of 0 or more');
      return;
    }
    setSaving(true);
    try {
      // Atomic on the server: locks, live stock, audit rows; add/subtract clamp at 0 as before.
      await api.inventory.bulkStock({ product_ids: [...selected], mode: bulkMode, value: val, reason: bulkReason.trim() });
      queryClient.invalidateQueries({ queryKey: ['stock-adjustments'] });
      const modeLabel = bulkMode === 'set' ? `set to ${val}` : bulkMode === 'add' ? `increased by ${val}` : `decreased by ${val}`;
      toast.success(`Stock ${modeLabel} for ${selected.size} product(s)`);
      setSelected(new Set());
      setBulkStock('');
      setBulkReason('');
      setEdits(prev => {
        const next = { ...prev };
        selected.forEach(id => { if (next[id]) delete next[id].stock_quantity; });
        return next;
      });
      queryClient.invalidateQueries({ queryKey: ['products-inventory'] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
    } catch (err) {
      toast.error(err?.message || 'Could not update stock; nothing was changed');
    } finally {
      setSaving(false);
    }
  };

  // Select all products in a given category
  const selectByCategory = (cat) => {
    const ids = products.filter(p => p.category === cat).map(p => p.id);
    setSelected(prev => {
      const next = new Set(prev);
      ids.forEach(id => next.add(id));
      return next;
    });
  };

  const toggleSelect = (id) => setSelected(prev => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });

  const toggleSelectAll = () => {
    if (selected.size === filtered.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(filtered.map(p => p.id)));
    }
  };

  const handleSaveProduct = async (data) => {
    if (editingProduct) {
      await api.entities.Product.update(editingProduct.id, data);
      toast.success('Product updated!');
    } else {
      await api.entities.Product.create(data);
      toast.success('Product created!');
    }
    queryClient.invalidateQueries({ queryKey: ['products-inventory'] });
    queryClient.invalidateQueries({ queryKey: ['products'] });
    queryClient.invalidateQueries({ queryKey: ['products-admin'] });
    setShowForm(false);
    setEditingProduct(null);
  };

  const allSelected = filtered.length > 0 && selected.size === filtered.length;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Inventory Manager</h1>
          <p className="text-sm text-muted-foreground">{totalProducts} products · Click any cell to edit inline</p>
        </div>
        <div className="flex gap-2">
          {hasEdits && (
            <>
              <Button variant="outline" size="sm" onClick={discardEdits} className="gap-1.5">
                <RotateCcw className="w-3.5 h-3.5" /> Discard
              </Button>
              <Button size="sm" onClick={saveAll} disabled={saving || !canSaveInline} className="gap-1.5">
                <Save className="w-3.5 h-3.5" /> {saving ? 'Saving…' : `Save ${dirtyIds.length} change(s)`}
              </Button>
            </>
          )}
          <Button onClick={() => { setEditingProduct(null); setShowForm(true); }} className="gap-1.5 rounded-xl">
            <Plus className="w-4 h-4" /> Add Product
          </Button>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: 'Total Products', value: totalProducts, icon: Package, color: 'text-primary' },
          { label: 'Low Stock', value: lowStock, icon: AlertTriangle, color: 'text-yellow-500' },
          { label: 'Out of Stock', value: outOfStock, icon: AlertTriangle, color: 'text-destructive' },
          { label: 'Inventory Value', value: `$${totalValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, icon: TrendingUp, color: 'text-green-600' },
        ].map(s => (
          <div key={s.label} className="bg-card rounded-xl border border-border p-4 flex items-center gap-3">
            <s.icon className={cn('w-5 h-5 shrink-0', s.color)} />
            <div>
              <p className="text-xs text-muted-foreground">{s.label}</p>
              <p className="text-lg font-bold">{s.value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Filters + Bulk actions */}
      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 min-w-[180px] max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Search name, SKU, barcode…" value={search} onChange={e => setSearch(e.target.value)} className="pl-9 h-9" />
        </div>

        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="w-36 h-9"><SelectValue /></SelectTrigger>
          <SelectContent>
            {categories.map(c => (
              <SelectItem key={c} value={c}>{c === 'all' ? 'All Categories' : c.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={stockFilter} onValueChange={setStockFilter}>
          <SelectTrigger className="w-32 h-9"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Stock</SelectItem>
            <SelectItem value="low">Low Stock</SelectItem>
            <SelectItem value="out">Out of Stock</SelectItem>
          </SelectContent>
        </Select>

        {/* Select by category shortcut */}
        <div className="flex items-center gap-1 flex-wrap">
          <span className="text-xs text-muted-foreground flex items-center gap-1"><Layers className="w-3 h-3" /> Select by category:</span>
          {categories.filter(c => c !== 'all').map(cat => (
            <button
              key={cat}
              onClick={() => selectByCategory(cat)}
              className="px-2 py-0.5 rounded-full text-[11px] bg-muted hover:bg-primary hover:text-primary-foreground text-muted-foreground transition-colors"
            >
              {cat.replace(/_/g, ' ')}
            </button>
          ))}
        </div>
      </div>

      {/* Bulk Edit Panel — appears when items are selected */}
      {selected.size > 0 && (
        <div className="bg-primary/5 border border-primary/20 rounded-xl px-4 py-3 flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <CheckSquare className="w-4 h-4 text-primary" />
            <span className="text-sm font-semibold text-primary">{selected.size} product{selected.size > 1 ? 's' : ''} selected</span>
            <button onClick={() => setSelected(new Set())} className="text-muted-foreground hover:text-foreground ml-1">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="h-5 border-l border-primary/20 hidden sm:block" />

          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground font-medium whitespace-nowrap">Bulk update stock:</span>

            {/* Mode selector */}
            <div className="flex rounded-lg border border-border overflow-hidden text-xs">
              {[
                { value: 'set',      label: 'Set to' },
                { value: 'add',      label: '+ Add' },
                { value: 'subtract', label: '− Subtract' },
              ].map(m => (
                <button
                  key={m.value}
                  onClick={() => setBulkMode(m.value)}
                  className={cn(
                    "px-2.5 py-1 transition-colors",
                    bulkMode === m.value
                      ? "bg-primary text-primary-foreground font-medium"
                      : "bg-background text-muted-foreground hover:bg-muted"
                  )}
                >
                  {m.label}
                </button>
              ))}
            </div>

            <Input
              type="number"
              min="0"
              placeholder="qty"
              value={bulkStock}
              onChange={e => setBulkStock(e.target.value)}
              className="h-8 w-20 text-sm"
              onKeyDown={e => e.key === 'Enter' && applyBulkStock()}
            />

            <Button size="sm" onClick={applyBulkStock} disabled={saving || !bulkStock || !bulkReason.trim()} className="h-8 px-4 gap-1.5">
              <ArrowUpDown className="w-3.5 h-3.5" />
              {saving ? 'Applying…' : 'Apply'}
            </Button>
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <span className="text-xs text-muted-foreground font-medium whitespace-nowrap">Reason:</span>
            <Input
              value={bulkReason}
              onChange={e => setBulkReason(e.target.value)}
              placeholder="e.g. stock count, delivery received, damage…"
              className="h-8 text-sm flex-1 sm:w-64"
            />
          </div>
        </div>
      )}

      {/* Table */}
      <div className="bg-card rounded-xl border border-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="px-3 py-3 w-10">
                  <button onClick={toggleSelectAll} className="text-muted-foreground hover:text-foreground">
                    {allSelected ? <CheckSquare className="w-4 h-4 text-primary" /> : <Square className="w-4 h-4" />}
                  </button>
                </th>
                <th className="text-left px-3 py-3 font-medium text-muted-foreground">Product</th>
                <th className="text-left px-3 py-3 font-medium text-muted-foreground hidden md:table-cell">SKU</th>
                <th className="text-left px-3 py-3 font-medium text-muted-foreground hidden lg:table-cell">Category</th>
                <th className="text-right px-3 py-3 font-medium text-muted-foreground">Cost ($)</th>
                <th className="text-right px-3 py-3 font-medium text-muted-foreground">Retail ($)</th>
                <th className="text-right px-3 py-3 font-medium text-muted-foreground hidden sm:table-cell">Wholesale ($)</th>
                <th className="text-right px-3 py-3 font-medium text-muted-foreground hidden sm:table-cell">Margin</th>
                <th className="text-right px-3 py-3 font-medium text-muted-foreground">Stock</th>
                <th className="text-right px-3 py-3 font-medium text-muted-foreground hidden lg:table-cell">Threshold</th>
                <th className="text-right px-3 py-3 font-medium text-muted-foreground">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {isLoading && (
                <tr><td colSpan={11} className="text-center py-12 text-muted-foreground">Loading…</td></tr>
              )}
              {!isLoading && filtered.length === 0 && (
                <tr><td colSpan={11} className="text-center py-12 text-muted-foreground">No products found</td></tr>
              )}
              {filtered.map(p => {
                const isDirty = !!edits[p.id];
                const stock = parseInt(getEdit(p.id, 'stock_quantity', p.stock_quantity ?? 0));
                const threshold = parseInt(getEdit(p.id, 'low_stock_threshold', p.low_stock_threshold ?? 10));
                const costPrice = parseFloat(getEdit(p.id, 'cost_price', p.cost_price ?? 0));
                const sellingPrice = parseFloat(getEdit(p.id, 'selling_price', p.selling_price ?? 0));
                const margin = sellingPrice > 0 ? ((sellingPrice - costPrice) / sellingPrice * 100) : 0;
                const isLow = stock <= threshold && stock > 0;
                const isOut = stock === 0;

                return (
                  <tr
                    key={p.id}
                    className={cn(
                      "hover:bg-muted/30 transition-colors",
                      isDirty && "bg-primary/3 border-l-2 border-l-primary",
                      selected.has(p.id) && "bg-primary/5"
                    )}
                  >
                    {/* Checkbox */}
                    <td className="px-3 py-2.5">
                      <button onClick={() => toggleSelect(p.id)} className="text-muted-foreground hover:text-foreground">
                        {selected.has(p.id) ? <CheckSquare className="w-4 h-4 text-primary" /> : <Square className="w-4 h-4" />}
                      </button>
                    </td>

                    {/* Name (opens full edit modal) */}
                    <td className="px-3 py-2.5">
                      <button
                        onClick={() => { setEditingProduct(p); setShowForm(true); }}
                        className="font-medium hover:text-primary transition-colors text-left"
                      >
                        {p.name}
                      </button>
                    </td>

                    {/* SKU */}
                    <td className="px-3 py-2.5 text-muted-foreground hidden md:table-cell">{p.sku}</td>

                    {/* Category */}
                    <td className="px-3 py-2.5 hidden lg:table-cell">
                      <Badge variant="secondary" className="text-[10px]">{p.category || '-'}</Badge>
                    </td>

                    {/* Cost Price - inline editable */}
                    <td className="px-3 py-2.5 text-right">
                      <input
                        type="number"
                        step="0.01"
                        value={getEdit(p.id, 'cost_price', p.cost_price ?? '')}
                        onChange={e => setEdit(p.id, 'cost_price', e.target.value)}
                        className="w-20 text-right bg-transparent border border-transparent hover:border-border focus:border-primary focus:outline-none rounded px-1.5 py-0.5 text-sm transition-colors"
                      />
                    </td>

                    {/* Selling Price - inline editable */}
                    <td className="px-3 py-2.5 text-right">
                      <input
                        type="number"
                        step="0.01"
                        value={getEdit(p.id, 'selling_price', p.selling_price ?? '')}
                        onChange={e => setEdit(p.id, 'selling_price', e.target.value)}
                        className="w-20 text-right bg-transparent border border-transparent hover:border-border focus:border-primary focus:outline-none rounded px-1.5 py-0.5 text-sm transition-colors font-medium"
                      />
                    </td>

                    {/* Wholesale Price - inline editable */}
                    <td className="px-3 py-2.5 text-right hidden sm:table-cell">
                      <input
                        type="number"
                        step="0.01"
                        value={getEdit(p.id, 'wholesale_price', p.wholesale_price ?? '')}
                        onChange={e => setEdit(p.id, 'wholesale_price', e.target.value)}
                        className="w-20 text-right bg-transparent border border-transparent hover:border-border focus:border-primary focus:outline-none rounded px-1.5 py-0.5 text-sm transition-colors"
                      />
                    </td>

                    {/* Margin */}
                    <td className={cn("px-3 py-2.5 text-right font-medium hidden sm:table-cell",
                      margin >= 30 ? "text-green-600" : margin >= 15 ? "text-yellow-600" : "text-destructive"
                    )}>
                      {margin.toFixed(1)}%
                    </td>

                    {/* Stock - inline editable */}
                    <td className="px-3 py-2.5 text-right">
                      <input
                        type="number"
                        value={getEdit(p.id, 'stock_quantity', p.stock_quantity ?? 0)}
                        onChange={e => setEdit(p.id, 'stock_quantity', e.target.value)}
                        className={cn(
                          "w-16 text-right bg-transparent border border-transparent hover:border-border focus:border-primary focus:outline-none rounded px-1.5 py-0.5 text-sm transition-colors font-medium",
                          isOut && "text-destructive",
                          isLow && !isOut && "text-yellow-600"
                        )}
                      />
                    </td>

                    {/* Threshold - inline editable */}
                    <td className="px-3 py-2.5 text-right hidden lg:table-cell">
                      <input
                        type="number"
                        value={getEdit(p.id, 'low_stock_threshold', p.low_stock_threshold ?? 10)}
                        onChange={e => setEdit(p.id, 'low_stock_threshold', e.target.value)}
                        className="w-16 text-right bg-transparent border border-transparent hover:border-border focus:border-primary focus:outline-none rounded px-1.5 py-0.5 text-sm transition-colors"
                      />
                    </td>

                    {/* Status badge */}
                    <td className="px-3 py-2.5 text-right">
                      {isOut ? (
                        <Badge variant="destructive" className="text-[10px]">Out</Badge>
                      ) : isLow ? (
                        <Badge className="text-[10px] bg-yellow-100 text-yellow-800 border-yellow-200">Low</Badge>
                      ) : (
                        <Badge variant="secondary" className="text-[10px]">OK</Badge>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {hasEdits && (
          <div className="border-t border-border bg-primary/5 px-4 py-3 space-y-3">
            {stockChangeCount > 0 && (
              <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                <span className="text-xs text-primary font-medium whitespace-nowrap">
                  Reason for {stockChangeCount} stock change(s):
                </span>
                <Input
                  value={adjustmentReason}
                  onChange={e => setAdjustmentReason(e.target.value)}
                  placeholder="Required — e.g. stock count, delivery, correction…"
                  className="h-8 text-sm"
                />
              </div>
            )}
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm text-primary font-medium">{dirtyIds.length} unsaved change(s) — click Save to apply</p>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={discardEdits}><RotateCcw className="w-3.5 h-3.5 mr-1" /> Discard</Button>
                <Button size="sm" onClick={saveAll} disabled={saving || !canSaveInline}><Save className="w-3.5 h-3.5 mr-1" /> {saving ? 'Saving…' : 'Save All'}</Button>
              </div>
            </div>
          </div>
        )}
      </div>

      <StockAdjustmentLog />

      {showForm && (
        <ProductFormModal
          product={editingProduct}
          onSave={handleSaveProduct}
          onClose={() => { setShowForm(false); setEditingProduct(null); }}
        />
      )}
    </div>
  );
}