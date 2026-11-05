import React from 'react';
import { CalendarIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { dateRangeLabel } from '@/utils/wholesale';

export default function DateRangePicker({ range, onChange, align = 'start' }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" className="h-9 gap-2 font-normal">
          <CalendarIcon className="w-4 h-4" />
          {dateRangeLabel(range)}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align={align}>
        <Calendar
          mode="range"
          selected={range}
          onSelect={(next) => onChange(next || {})}
          defaultMonth={range?.from}
          numberOfMonths={1}
        />
      </PopoverContent>
    </Popover>
  );
}