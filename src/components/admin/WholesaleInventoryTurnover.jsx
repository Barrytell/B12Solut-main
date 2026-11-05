import React, { useMemo } from 'react';
import { cn } from '@/lib/utils';
import { wholesaleTurnover } from '@/utils/wholesale';

export default function WholesaleInventoryTurnover({
  transactions = [],
  products = [],
  periodDays = 30,
  periodLabel = 'Selected period',
}) {
  const { rows, totals } = useMemo(
    () => wholesaleTurnover(transactions, products, periodDays),
    [transactions, products, periodDays]
  );

  return (
    <div className="bg-card rounded-xl border border-border">
      <div className="p-5 border-b border-border flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold">Inventory Turnover — Wholesale</h2>
          <p className="text-xs text-muted-foreground mt-1">
            Wholesale units sold ÷ stock on hand. Stock history isn't recorded, so the current level is the base.
          </p>
        </div>
        <span className="text-xs text-muted-foreground bg-muted px-2.5 py-1 rounded-full whitespace-nowrap">
          {periodLabel}
        </span>
      </div>

      <div className="grid grid-cols-3 border-b border-border">
        <div className="px-4 py-3">
          <p className="text-[11px] text-muted-foreground uppercase tracking-wide">Overall Turnover</p>
          <p className="text-lg font-bold">
            {totals.overallTurnover === null ? '—' : `${totals.overallTurnover.toFixed(2)}×`}
          </p>
        </div>
        <div className="px-4 py-3 border-l border-border">
          <p className="text-[11px] text-muted-foreground uppercase tracking-wide">Units Sold</p>
          <p className="text-lg font-bold">{totals.unitsSold}</p>
        </div>
        <div className="px-4 py-3 border-l border-border">
          <p className="text-[11px] text-muted-foreground uppercase tracking-wide">Stock Value (cost)</p>
          <p className="text-lg font-bold">${totals.stockValue.toFixed(2)}</p>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/50">
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Product</th>
              <th className="text-right px-4 py-3 font-medium text-muted-foreground">Units Sold</th>
              <th className="text-right px-4 py-3 font-medium text-muted-foreground">Stock On Hand</th>
              <th className="text-right px-4 py-3 font-medium text-muted-foreground">Turnover</th>
              <th className="text-right px-4 py-3 font-medium text-muted-foreground">Days of Supply</th>
              <th className="text-right px-4 py-3 font-medium text-muted-foreground">Stock Value</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map(r => (
              <tr key={r.sku || r.name} className="hover:bg-muted/30">
                <td className="px-4 py-3">
                  <p className="font-medium">{r.name}</p>
                  {r.sku && <p className="text-[11px] text-muted-foreground">{r.sku}</p>}
                </td>
                <td className="px-4 py-3 text-right">{r.unitsSold}</td>
                <td className="px-4 py-3 text-right">
                  {r.stock === null ? (
                    <span className="text-muted-foreground text-xs">Not in catalogue</span>
                  ) : r.stock === 0 ? (
                    <span className="text-xs font-semibold text-red-500">Out of stock</span>
                  ) : (
                    r.stock
                  )}
                </td>
                <td className="px-4 py-3 text-right">
                  {r.turnover === null ? (
                    <span className="text-muted-foreground">—</span>
                  ) : (
                    <span className={cn('font-semibold', r.turnover >= 1 ? 'text-green-600' : r.turnover >= 0.5 ? 'text-yellow-600' : 'text-red-500')}>
                      {r.turnover.toFixed(2)}×
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 text-right">
                  {r.daysOfSupply === null ? <span className="text-muted-foreground">—</span> : `${Math.round(r.daysOfSupply)} d`}
                </td>
                <td className="px-4 py-3 text-right">${r.stockValue.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {rows.length === 0 && (
        <div className="p-12 text-center text-sm text-muted-foreground">No wholesale sales in this period</div>
      )}
    </div>
  );
}