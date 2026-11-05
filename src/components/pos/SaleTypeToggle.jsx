import React from 'react';
import { Store, Truck } from 'lucide-react';
import { cn } from '@/lib/utils';

const modes = [
  { value: 'retail', label: 'Retail', icon: Store },
  { value: 'wholesale', label: 'Wholesale', icon: Truck },
];

export default function SaleTypeToggle({ value, onChange }) {
  return (
    <div className="inline-flex items-center gap-1 p-1 rounded-xl bg-muted shrink-0" role="group" aria-label="Sale type">
      {modes.map(({ value: mode, label, icon: Icon }) => (
        <button
          key={mode}
          type="button"
          onClick={() => onChange(mode)}
          aria-pressed={value === mode}
          className={cn(
            "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all",
            value === mode
              ? "bg-primary text-primary-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          <Icon className="w-3.5 h-3.5" />
          {label}
        </button>
      ))}
    </div>
  );
}