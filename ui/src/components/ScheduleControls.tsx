import { ChevronRight, X } from 'lucide-react';
import type { ChangeEventHandler, ReactNode } from 'react';
import { weekdayLabels } from '@/lib/date';
import { Button } from './primitives';
import { SimpleSelect } from './SimpleSelect';

export interface ActiveFilter {
  key: string;
  label: string;
  clear: () => void;
}

export function YearSwitcher({
  year,
  onChange,
}: {
  year: number;
  onChange: (year: number) => void;
}) {
  return (
    <div className='year-switcher'>
      <Button
        type='button'
        variant='ghost'
        onClick={() => onChange(year - 1)}
        aria-label='Previous year'
      >
        ←
      </Button>
      <strong>{year}</strong>
      <Button
        type='button'
        variant='ghost'
        onClick={() => onChange(year + 1)}
        aria-label='Next year'
      >
        →
      </Button>
    </div>
  );
}

export function ActiveFilterRow({ filters }: { filters: readonly ActiveFilter[] }) {
  if (filters.length === 0) {
    return null;
  }

  return (
    <div className='active-filter-row'>
      <strong>Active filters</strong>
      {filters.map((filter) => (
        <button type='button' key={filter.key} onClick={filter.clear}>
          {filter.label}
          <X size={12} />
        </button>
      ))}
    </div>
  );
}

export function WeekdaySelect({
  value,
  onChange,
}: {
  value: string | number;
  onChange: ChangeEventHandler<HTMLSelectElement>;
}) {
  return (
    <SimpleSelect value={value} onChange={onChange}>
      <option value=''>All weekdays</option>
      {weekdayLabels.map((label, index) => (
        <option key={label} value={index}>
          {label}
        </option>
      ))}
    </SimpleSelect>
  );
}

export function ScheduleInsight({
  icon,
  label,
  value,
  hint,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  hint: string;
  onClick: () => void;
}) {
  return (
    <button type='button' className='schedule-insight' onClick={onClick}>
      <span>{icon}</span>
      <div>
        <small>{label}</small>
        <strong>{value}</strong>
        <em>{hint}</em>
      </div>
      <ChevronRight size={15} />
    </button>
  );
}
