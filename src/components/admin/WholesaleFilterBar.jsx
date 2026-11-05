import React from 'react';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import DateRangePicker from '@/components/admin/DateRangePicker';

export default function WholesaleFilterBar({ suppliers = [], supplier, onSupplierChange, range, onRangeChange, orderCount = 0 }) {
  return (
    <div className="bg-card rounded-xl border border-border p-4 flex flex-wrap items-center gap-x-5 gap-y-3">
      <div className="flex items-center gap-2">
        <span className="text-xs font-medium text-muted-foreground">Supplier</span>
        <Select value={supplier} onValueChange={onSupplierChange}>
          <SelectTrigger className="w-48 h-9">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All suppliers</SelectItem>
            {suppliers.map(name => (
              <SelectItem key={name} value={name}>{name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex items-center gap-2">
        <span className="text-xs font-medium text-muted-foreground">Period</span>
        <DateRangePicker range={range} onChange={onRangeChange} />
      </div>

      <span className="sm:ml-auto text-xs text-muted-foreground">
        {orderCount} {orderCount === 1 ? 'order' : 'orders'} in view
      </span>
    </div>
  );
}