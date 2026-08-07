import type { ButtonHTMLAttributes, ReactNode } from 'react';

const weekdays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
export const calendarColorCount = 10;

export interface CalendarFillSegment {
  key: string;
  colorIndex: number;
  weight: number;
}

export interface YearCalendarDay {
  date: string;
  day: number;
  month: number;
}

export function YearCalendar({
  year,
  renderDay,
}: {
  year: number;
  renderDay: (day: YearCalendarDay) => ReactNode;
}) {
  return (
    <div className='year-calendar'>
      {Array.from({ length: 12 }, (_, month) => (
        <MonthCalendar key={month} year={year} month={month} renderDay={renderDay} />
      ))}
    </div>
  );
}

export function CalendarDateButton({
  day,
  segments = [],
  density,
  className,
  ...props
}: {
  day: number;
  segments?: readonly CalendarFillSegment[];
  density?: number;
} & Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'>) {
  const visibleSegments = segments.filter((segment) => segment.weight > 0);
  const hasFill = density !== undefined || visibleSegments.length > 0;
  const normalizedDensity = density === undefined ? undefined : Math.max(0, Math.min(1, density));

  return (
    <button
      {...props}
      className={['calendar-day', hasFill && 'has-fill', className].filter(Boolean).join(' ')}
    >
      {hasFill && (
        <span className='calendar-day-fill' aria-hidden='true'>
          {normalizedDensity !== undefined ? (
            <span
              className='calendar-day-fill-segment density'
              style={{ opacity: 0.35 + normalizedDensity * 0.65 }}
            />
          ) : (
            visibleSegments.map((segment) => (
              <span
                className={`calendar-day-fill-segment highlight-${segment.colorIndex}`}
                data-fill-key={segment.key}
                data-fill-weight={segment.weight}
                key={segment.key}
                style={{ flexGrow: segment.weight }}
              />
            ))
          )}
        </span>
      )}
      <span className='calendar-day-label'>{day}</span>
    </button>
  );
}

function MonthCalendar({
  year,
  month,
  renderDay,
}: {
  year: number;
  month: number;
  renderDay: (day: YearCalendarDay) => ReactNode;
}) {
  const first = new Date(Date.UTC(year, month, 1));
  const days = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const offset = (first.getUTCDay() + 6) % 7;

  return (
    <section className='month-calendar'>
      <h3>{new Intl.DateTimeFormat(undefined, { month: 'long' }).format(first)}</h3>
      <div className='calendar-weekdays'>
        {weekdays.map((weekday) => (
          <span key={weekday}>{weekday}</span>
        ))}
      </div>
      <div className='calendar-days'>
        {Array.from({ length: offset }, (_, index) => (
          <span className='calendar-day empty' aria-hidden='true' key={`empty-${index}`} />
        ))}
        {Array.from({ length: days }, (_, index) => {
          const day = index + 1;
          const date = `${year}-${pad(month + 1)}-${pad(day)}`;
          return renderDay({ date, day, month });
        })}
      </div>
    </section>
  );
}

function pad(value: number) {
  return String(value).padStart(2, '0');
}
