import { useState } from 'react';
import type {
  FlightReferenceData,
  FlightScheduleItem,
  FlightScheduleVariant,
  FlightSchedules,
} from '@/api/types';
import { Card } from '@/components/primitives';
import {
  CalendarDateButton,
  calendarColorCount,
  type CalendarFillSegment,
  YearCalendar,
} from '@/components/YearCalendar';
import { aircraftConfigurationLabel as configurationLabel } from '@/lib/aircraftConfigurations';
import { classNames } from '@/lib/format';
import {
  displayVariantFor,
  groupScheduleItemsByDepartureDate,
  isCancelledScheduleItem as isCancelled,
} from '@/lib/schedules';

type CalendarHighlight = 'aircraft' | 'configuration' | 'both';

export function CalendarView({
  data,
  filteredItems,
  year,
  onInspect,
}: {
  data: FlightSchedules;
  filteredItems: readonly FlightScheduleItem[];
  year: number;
  onInspect: (date: string) => void;
}) {
  const [highlight, setHighlight] = useState<CalendarHighlight>('aircraft');
  const filteredDates = new Set(filteredItems.map((item) => item.departureDateLocal));
  const itemsByDate = groupScheduleItemsByDepartureDate(data.items);
  const highlightValues = [
    ...new Map(
      data.items.flatMap((item) => {
        const variant = displayVariantFor(data, item);
        return variant
          ? [
              [
                calendarHighlightKey(variant, highlight),
                calendarHighlightLabel(variant, highlight, data),
              ] as const,
            ]
          : [];
      }),
    ).entries(),
  ];
  const highlightLabels = new Map(highlightValues);
  const highlightIndex = new Map(
    highlightValues.map(([key], index) => [key, index % calendarColorCount]),
  );
  return (
    <Card className='schedule-calendar-card'>
      <div className='calendar-legend'>
        <div className='calendar-highlight-controls' role='group' aria-label='Calendar highlight'>
          <strong>Highlight</strong>
          <div className='facet-buttons'>
            {(
              [
                ['aircraft', 'Aircraft'],
                ['configuration', 'Configuration'],
                ['both', 'Aircraft + Configuration'],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                className={highlight === key ? 'active' : ''}
                aria-pressed={highlight === key}
                onClick={() => setHighlight(key)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <div className='calendar-legend-values'>
          <span>
            <i className='cancelled' />
            Cancelled leg
          </span>
          <span>
            <i className='changed' />
            Revised
          </span>
          <span>
            <i className='filtered-out' />
            Filtered out
          </span>
          {highlightValues.map(([key, label]) => (
            <span key={key}>
              <i className={`highlight-${highlightIndex.get(key)}`} />
              {label}
            </span>
          ))}
        </div>
      </div>
      <YearCalendar
        year={year}
        renderDay={({ date, day }) => {
          const items = itemsByDate.get(date) ?? [];
          if (!items.length) {
            return (
              <CalendarDateButton
                key={date}
                day={day}
                disabled
                title={`${date} · No published departures`}
                aria-label={`${date}, no published departures`}
              />
            );
          }
          const operatingCount = items.filter((item) => !isCancelled(item)).length;
          const cancelledCount = items.filter(isCancelled).length;
          const operating = operatingCount > 0;
          const changed = items.some((item) => item.versionCount > 1);
          const filteredOut = !filteredDates.has(date);
          const groupedCounts = new Map<string, number>();
          for (const item of items) {
            const variant = displayVariantFor(data, item);
            if (!variant) {
              continue;
            }
            const key = calendarHighlightKey(variant, highlight);
            groupedCounts.set(key, (groupedCounts.get(key) ?? 0) + 1);
          }
          const segments: CalendarFillSegment[] = [...groupedCounts.entries()].map(
            ([key, weight]) => ({
              key,
              weight,
              colorIndex: highlightIndex.get(key) ?? 0,
            }),
          );
          const breakdown = [...groupedCounts.entries()]
            .map(([key, count]) => `${highlightLabels.get(key) ?? key}: ${count}`)
            .join(' · ');
          const states = [
            operating ? 'operating' : 'cancelled-only',
            cancelledCount > 0 && 'cancelled',
            changed && 'changed',
            filteredOut && 'filtered-out',
          ];
          const statusLabel = [
            operatingCount
              ? `${operatingCount} operating leg${operatingCount === 1 ? '' : 's'}`
              : '',
            cancelledCount
              ? `${cancelledCount} cancelled leg${cancelledCount === 1 ? '' : 's'}`
              : '',
          ]
            .filter(Boolean)
            .join(' · ');
          const filterLabel = filteredOut ? ' · Filtered out' : '';
          return (
            <CalendarDateButton
              key={date}
              day={day}
              segments={segments}
              className={classNames(...states)}
              title={`${date} · ${statusLabel}${breakdown ? ` · ${breakdown}` : ''}${changed ? ' · Revised' : ''}${filterLabel}`}
              aria-label={`${date}, ${statusLabel.replace(' · ', ', ')}${breakdown ? `, ${breakdown}` : ''}${changed ? ', revised' : ''}${filteredOut ? ', filtered out' : ''}`}
              onClick={() => onInspect(date)}
            />
          );
        }}
      />
    </Card>
  );
}

function calendarHighlightKey(variant: FlightScheduleVariant, highlight: CalendarHighlight) {
  const configuration = variant.aircraftConfigurationVersion || 'No configuration';
  if (highlight === 'aircraft') {
    return variant.aircraftId;
  }
  if (highlight === 'configuration') {
    return configuration;
  }
  return `${variant.aircraftId}|${configuration}`;
}

function calendarHighlightLabel(
  variant: FlightScheduleVariant,
  highlight: CalendarHighlight,
  data: FlightReferenceData,
) {
  const aircraft = data.aircraft[variant.aircraftId]?.name ?? variant.aircraftId;
  const configuration = configurationLabel(variant, data);
  if (highlight === 'aircraft') {
    return aircraft;
  }
  if (highlight === 'configuration') {
    return configuration;
  }
  return `${aircraft} · ${configuration}`;
}
