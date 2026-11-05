import React from 'react';
import WholesaleTopCustomers from '@/components/admin/WholesaleTopCustomers';
import WholesalePaymentMix from '@/components/admin/WholesalePaymentMix';

function Metric({ label, value }) {
  return (
    <div className="rounded-lg bg-muted/40 border border-border px-3 py-2.5">
      <p className="text-[11px] text-muted-foreground uppercase tracking-wide">{label}</p>
      <p className="text-lg font-bold text-foreground mt-0.5">{value}</p>
    </div>
  );
}

export default function WholesaleAnalyticsReport({ analytics, periodLabel = 'Selected period' }) {
  return (
    <div className="bg-card rounded-xl border border-border">
      <div className="p-5 border-b border-border flex items-center justify-between">
        <h2 className="text-base font-semibold">Wholesale Analytics Report</h2>
        <span className="text-xs text-muted-foreground bg-muted px-2.5 py-1 rounded-full whitespace-nowrap">
          {periodLabel}
        </span>
      </div>

      <div className="p-5 space-y-5">
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          <Metric label="Orders" value={analytics.orders} />
          <Metric label="Units / Order" value={analytics.avgUnitsPerOrder.toFixed(1)} />
          <Metric label="Unique Customers" value={analytics.uniqueCustomers} />
          <Metric label="Profit / Unit" value={`$${analytics.profitPerUnit.toFixed(2)}`} />
          <Metric label="Largest Order" value={`$${analytics.largestOrder.toFixed(2)}`} />
        </div>

        <div className="grid lg:grid-cols-2 gap-6 pt-1">
          <WholesaleTopCustomers customers={analytics.topCustomers} />
          <WholesalePaymentMix mix={analytics.paymentMix} />
        </div>
      </div>
    </div>
  );
}