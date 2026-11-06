import React, { useState, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/api/client';
import { TrendingUp, TrendingDown, Minus, RefreshCw, CheckCircle, AlertCircle, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { computeForecast } from '@/utils/demandForecast';
import { toast } from 'sonner';

const TREND_CONFIG = {
  growing:  { icon: TrendingUp,   color: 'text-green-600',  bg: 'bg-green-50',  label: 'Growing'  },
  stable:   { icon: Minus,        color: 'text-blue-500',   bg: 'bg-blue-50',   label: 'Stable'   },
  declining:{ icon: TrendingDown, color: 'text-orange-500', bg: 'bg-orange-50', label: 'Declining'},
};

export default function DemandForecast() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [applyingId, setApplyingId] = useState(null);
  const [appliedIds, setAppliedIds] = useState(new Set());
  const [applyingAll, setApplyingAll] = useState(false);
  const [showOnlyWithData, setShowOnlyWithData] = useState(true);
  const [expandedId, setExpandedId] = useState(null);

  const { data: transactions = [], isLoading: loadingTx } = useQuery({
    queryKey: ['transactions-all'],
    queryFn: () => api.entities.Transaction.list('-created_date', 500),
  });

  const { data: products = [], isLoading: loadingProducts } = useQuery({
    queryKey: ['products-admin'],
    queryFn: () => api.entities.Product.list(),
  });

  const forecast = useMemo(() => computeForecast(transactions, products), [transactions, products]);

  const filtered = useMemo(() => {
    let rows = showOnlyWithData ? forecast.filter(r => r.hasData) : forecast;
    if (search) {
      const q = search.toLowerCase();
      rows = rows.filter(r =>
        r.product.name.toLowerCase().includes(q) ||
        r.product.sku?.toLowerCase().includes(q)
      );
    }
    return rows;
  }, [forecast, search, showOnlyWithData]);

  const applyThreshold = async (row) => {
    setApplyingId(row.product.id);
    await api.entities.Product.update(row.product.id, {
      low_stock_threshold: row.suggestedThreshold,
    });
    setAppliedIds(prev => new Set([...prev, row.product.id]));
    queryClient.invalidateQueries({ queryKey: ['products-admin'] });
    queryClient.invalidateQueries({ queryKey: ['products'] });
    setApplyingId(null);
    toast.success(`Updated threshold for ${row.product.name} → ${row.suggestedThreshold} units`);
  };

  const applyAll = async () => {
    const toApply = filtered.filter(r => r.thresholdDelta !== 0 && !appliedIds.has(r.product.id));
    if (!toApply.length) { toast.info('No changes to apply.'); return; }
    if (!confirm(`Apply AI-suggested thresholds to ${toApply.length} product(s)?`)) return;
    setApplyingAll(true);
    for (const row of toApply) {
      await api.entities.Product.update(row.product.id, { low_stock_threshold: row.suggestedThreshold });
      setAppliedIds(prev => new Set([...prev, row.product.id]));
    }
    queryClient.invalidateQueries({ queryKey: ['products-admin'] });
    queryClient.invalidateQueries({ queryKey: ['products'] });
    setApplyingAll(false);
    toast.success(`Applied thresholds to ${toApply.length} products`);
  };

  const isLoading = loadingTx || loadingProducts;
  const pendingCount = filtered.filter(r => r.thresholdDelta !== 0 && !appliedIds.has(r.product.id)).length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Demand Forecast</h1>
          <p className="text-sm text-muted-foreground">
            AI-predicted reorder thresholds based on historical sales velocity
          </p>
        </div>
        {pendingCount > 0 && (
          <Button onClick={applyAll} disabled={applyingAll} className="rounded-xl">
            <RefreshCw className={cn("w-4 h-4 mr-2", applyingAll && "animate-spin")} />
            {applyingAll ? 'Applying...' : `Apply All (${pendingCount})`}
          </Button>
        )}
      </div>

      {/* Info banner */}
      <div className="bg-primary/5 border border-primary/20 rounded-xl p-4 text-sm text-foreground/80">
        <strong className="text-primary">How it works:</strong> We analyze up to 8 weeks of transaction history per product using a weighted moving average (recent weeks weighted 3× more). The suggested reorder threshold = <em>1.5× average weekly demand</em>, ensuring ~1.5 weeks of buffer stock before running out.
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search products..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>
        <button
          onClick={() => setShowOnlyWithData(!showOnlyWithData)}
          className={cn(
            "px-4 py-2 rounded-lg text-sm font-medium border transition-colors",
            showOnlyWithData
              ? "bg-primary text-primary-foreground border-primary"
              : "bg-card text-muted-foreground border-border hover:bg-muted"
          )}
        >
          {showOnlyWithData ? 'Showing: Products with sales' : 'Showing: All products'}
        </button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-64">
          <div className="w-8 h-8 border-4 border-muted border-t-primary rounded-full animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-48 text-center">
          <AlertCircle className="w-12 h-12 text-muted-foreground/30 mb-3" />
          <p className="text-muted-foreground">No products with sales data found.</p>
          <p className="text-sm text-muted-foreground/60 mt-1">Try toggling "Show all products" or check your transactions.</p>
        </div>
      ) : (
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/40">
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Product</th>
                  <th className="text-right px-4 py-3 font-medium text-muted-foreground">Avg/Week</th>
                  <th className="text-right px-4 py-3 font-medium text-muted-foreground hidden sm:table-cell">8-wk Total</th>
                  <th className="text-center px-4 py-3 font-medium text-muted-foreground">Trend</th>
                  <th className="text-right px-4 py-3 font-medium text-muted-foreground">Current Threshold</th>
                  <th className="text-right px-4 py-3 font-medium text-muted-foreground">AI Suggestion</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.map(row => {
                  const trend = TREND_CONFIG[row.trend];
                  const TrendIcon = trend.icon;
                  const isApplied = appliedIds.has(row.product.id);
                  const isApplying = applyingId === row.product.id;
                  const delta = row.thresholdDelta;
                  const isExpanded = expandedId === row.product.id;

                  return (
                    <React.Fragment key={row.product.id}>
                      <tr
                        className="hover:bg-muted/20 transition-colors cursor-pointer"
                        onClick={() => setExpandedId(isExpanded ? null : row.product.id)}
                      >
                        <td className="px-4 py-3">
                          <p className="font-medium">{row.product.name}</p>
                          <p className="text-xs text-muted-foreground">{row.product.sku}</p>
                        </td>
                        <td className="px-4 py-3 text-right font-medium">
                          {row.hasData ? row.weightedAvgPerWeek.toFixed(1) : '—'}
                        </td>
                        <td className="px-4 py-3 text-right text-muted-foreground hidden sm:table-cell">
                          {row.totalSold}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex justify-center">
                            <span className={cn("flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium", trend.bg, trend.color)}>
                              <TrendIcon className="w-3 h-3" />
                              {trend.label}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right text-muted-foreground">
                          {row.currentThreshold}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <span className={cn(
                            "font-semibold",
                            delta > 0 ? "text-orange-600" : delta < 0 ? "text-green-600" : "text-muted-foreground"
                          )}>
                            {row.suggestedThreshold}
                          </span>
                          {delta !== 0 && (
                            <span className={cn("ml-1 text-xs", delta > 0 ? "text-orange-500" : "text-green-500")}>
                              ({delta > 0 ? '+' : ''}{delta})
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right" onClick={e => e.stopPropagation()}>
                          {isApplied ? (
                            <span className="flex items-center justify-end gap-1 text-green-600 text-xs font-medium">
                              <CheckCircle className="w-4 h-4" /> Applied
                            </span>
                          ) : delta === 0 ? (
                            <span className="text-xs text-muted-foreground">No change</span>
                          ) : (
                            <Button
                              size="sm"
                              variant="outline"
                              className="rounded-lg text-xs h-7"
                              disabled={isApplying}
                              onClick={() => applyThreshold(row)}
                            >
                              {isApplying ? <RefreshCw className="w-3 h-3 animate-spin" /> : 'Apply'}
                            </Button>
                          )}
                        </td>
                      </tr>

                      {/* Expanded weekly breakdown */}
                      {isExpanded && (
                        <tr className="bg-muted/10">
                          <td colSpan={7} className="px-6 py-4">
                            <p className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wide">
                              Weekly Sales (last 8 weeks, most recent first)
                            </p>
                            <div className="flex items-end gap-2 h-16">
                              {row.weeklySales.map((qty, i) => {
                                const max = Math.max(...row.weeklySales, 1);
                                const heightPct = (qty / max) * 100;
                                const opacity = 1 - (i / 10);
                                return (
                                  <div key={i} className="flex flex-col items-center gap-1 flex-1">
                                    <span className="text-[10px] text-muted-foreground">{qty}</span>
                                    <div
                                      className="w-full rounded-sm bg-primary"
                                      style={{ height: `${Math.max(heightPct, 4)}%`, opacity }}
                                    />
                                    <span className="text-[9px] text-muted-foreground">W-{i}</span>
                                  </div>
                                );
                              })}
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}