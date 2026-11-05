import React from 'react';
import { Store, Truck } from 'lucide-react';
import SaleTypeCard from '@/components/pos/SaleTypeCard';

export default function SaleTypeChooser() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">New Sale</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Choose the type of sale to start. Both draw from the same stock and are tracked separately.
        </p>
      </div>

      <div className="grid sm:grid-cols-2 gap-4 max-w-3xl">
        <SaleTypeCard
          to="/pos/retail"
          icon={Store}
          title="Retail Sale"
          description="Standard counter sales charged at your retail prices."
        />
        <SaleTypeCard
          to="/pos/wholesale"
          icon={Truck}
          title="Wholesale Sale"
          description="Bulk orders charged at your wholesale prices, recorded as wholesale orders."
        />
      </div>
    </div>
  );
}