import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import type { ChangeEventHandler, ReactNode } from 'react';
import { dateBases, weekdayLabels, type DateBasis } from '@/lib/date';
import { isOneOf } from '@/lib/collections';
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
        <ChevronLeft size={16} />
      </Button>
      <strong>{year}</strong>
      <Button
        type='button'
        variant='ghost'
        onClick={() => onChange(year + 1)}
        aria-label='Next year'
      >
        <ChevronRight size={16} />
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

export function DateBasisSelect({
  value,
  onChange,
}: {
  value: DateBasis;
  onChange: (value: DateBasis) => void;
}) {
  return (
    <SimpleSelect
      value={value}
      onChange={(event) => {
        if (isOneOf(event.target.value, dateBases)) {
          onChange(event.target.value);
        }
      }}
    >
      <option value='local'>Departure local time</option>
      <option value='utc'>UTC</option>
    </SimpleSelect>
  );
}

export function ScheduleHighlightControl<Value extends string>({
  value,
  options,
  onChange,
  ariaLabel,
}: {
  value: Value;
  options: ReadonlyArray<readonly [Value, string]>;
  onChange: (value: Value) => void;
  ariaLabel: string;
}) {
  return (
    <div className='calendar-highlight-controls' role='group' aria-label={ariaLabel}>
      <strong>Highlight</strong>
      <div className='facet-buttons'>
        {options.map(([key, label]) => (
          <button
            key={key}
            className={value === key ? 'active' : ''}
            aria-pressed={value === key}
            onClick={() => onChange(key)}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
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
