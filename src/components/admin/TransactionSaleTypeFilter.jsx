import React from 'react';
import { cn } from '@/lib/utils';

const options = [
  { value: 'retail', label: 'Retail' },
  { value: 'wholesale', label: 'Wholesale' },
  { value: 'all', label: 'All' },
];

export default function TransactionSaleTypeFilter({ value, onChange }) {
  return (
    <div className="inline-flex items-center gap-1 p-1 rounded-xl bg-muted">
      {options.map(opt => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          aria-pressed={value === opt.value}
          className={cn(
            "px-3 py-1.5 rounded-lg text-xs font-semibold transition-all",
            value === opt.value
              ? "bg-primary text-primary-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}