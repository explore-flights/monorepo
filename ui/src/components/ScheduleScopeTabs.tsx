import { CalendarDays, Clock3 } from 'lucide-react';
import { numberLabel } from '@/lib/format';

export type ScheduleScope = 'upcoming' | 'historical';

export function ScheduleScopeTabs({
  active,
  upcomingCount,
  historicalCount,
  upcomingEnabled = true,
  historicalEnabled = true,
  onSelect,
}: {
  active?: ScheduleScope;
  upcomingCount: number;
  historicalCount: number;
  upcomingEnabled?: boolean;
  historicalEnabled?: boolean;
  onSelect: (scope: ScheduleScope) => void;
}) {
  return (
    <div className='scope-tabs' aria-label='Schedule timeframe'>
      <button
        className={active === 'upcoming' ? 'active' : ''}
        aria-pressed={active === 'upcoming'}
        disabled={!upcomingEnabled}
        onClick={() => onSelect('upcoming')}
      >
        <Clock3 size={16} />
        <span>Upcoming</span>
        <b>{numberLabel(upcomingCount)}</b>
      </button>
      <button
        className={active === 'historical' ? 'active' : ''}
        aria-pressed={active === 'historical'}
        disabled={!historicalEnabled}
        onClick={() => onSelect('historical')}
      >
        <CalendarDays size={16} />
        <span>Historical</span>
        <b>{numberLabel(historicalCount)}</b>
      </button>
    </div>
  );
}
