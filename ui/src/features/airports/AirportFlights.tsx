import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api } from '@/api/client';
import type {
  Airport,
  AirportMovement,
  AirportMovementDirection,
  AirportSummary,
  AirportTimetable,
} from '@/api/types';
import { PublishedScheduleDetails, ScheduleRouteCell } from '@/components/ScheduleMetadata';
import { TemporalInput } from '@/components/TemporalInput';
import { Badge, Button, EmptyState, ErrorState, Loading } from '@/components/primitives';
import { ScheduleTable, type ScheduleTableColumn } from '@/features/schedules/ScheduleTable';
import { aircraftName, duration, flightName, fullDateLabel, numberLabel } from '@/lib/format';
import { AirportDirectionControl } from './AirportDirectionControl';
import {
  adjacentActiveDate,
  directionStatistics,
  localDayOffset,
  offsetTimestampParts,
} from './airportData';

type AirportScheduleSortKey = 'event' | 'flight' | 'route' | 'aircraft';

export function AirportFlights({
  direction,
  selectedDate,
  ...props
}: {
  airport: Airport;
  summary: AirportSummary;
  direction: AirportMovementDirection;
  selectedDate: string | undefined;
  today: string;
  onDirectionChange: (direction: AirportMovementDirection) => void;
  onDateChange: (date: string) => void;
}) {
  return (
    <AirportFlightsForSelection
      key={`${direction}-${selectedDate ?? 'no-date'}`}
      {...props}
      direction={direction}
      selectedDate={selectedDate}
    />
  );
}

function AirportFlightsForSelection({
  airport,
  summary,
  direction,
  selectedDate,
  today,
  onDirectionChange,
  onDateChange,
}: {
  airport: Airport;
  summary: AirportSummary;
  direction: AirportMovementDirection;
  selectedDate: string | undefined;
  today: string;
  onDirectionChange: (direction: AirportMovementDirection) => void;
  onDateChange: (date: string) => void;
}) {
  const active = directionStatistics(summary, direction);
  const previousDate = selectedDate ? adjacentActiveDate(active, selectedDate, -1) : undefined;
  const nextDate = selectedDate ? adjacentActiveDate(active, selectedDate, 1) : undefined;
  const query = useQuery({
    queryKey: ['airport-timetable', airport.id, direction, selectedDate],
    queryFn: () => loadTimetable(airport.id, direction, selectedDate),
    enabled: Boolean(selectedDate),
    retry: false,
  });

  return (
    <section className='airport-subpage'>
      <div className='section-heading airport-view-heading airport-flight-heading'>
        <div>
          <span className='eyebrow'>Daily timetable</span>
          <h2>{selectedDate ? fullDateLabel(selectedDate) : `${summary.year} schedule`}</h2>
          <p>Times are shown as encoded airport-local clocks with UTC offsets.</p>
        </div>
        <div className='airport-flight-heading-controls'>
          {today.startsWith(`${summary.year}-`) && selectedDate !== today && (
            <Button variant='secondary' onClick={() => onDateChange(today)}>
              Today
            </Button>
          )}
          <div className='airport-date-navigation' aria-label='Timetable date navigation'>
            <Button
              variant='ghost'
              disabled={!previousDate}
              aria-label='Previous active day'
              onClick={() => previousDate && onDateChange(previousDate)}
            >
              <ChevronLeft size={17} />
            </Button>
            <TemporalInput
              type='date'
              value={selectedDate ?? ''}
              min={`${summary.year}-01-01`}
              max={`${summary.year}-12-31`}
              aria-label='Timetable date'
              onChange={(event) => onDateChange(event.target.value)}
            />
            <Button
              variant='ghost'
              disabled={!nextDate}
              aria-label='Next active day'
              onClick={() => nextDate && onDateChange(nextDate)}
            >
              <ChevronRight size={17} />
            </Button>
          </div>
          <AirportDirectionControl
            summary={summary}
            direction={direction}
            onChange={onDirectionChange}
          />
        </div>
      </div>

      {!selectedDate && (
        <EmptyState
          title='No active dates this year'
          description='There are no scheduled movements to use as a timetable date.'
        />
      )}
      {selectedDate && query.isLoading && <Loading label='Loading daily timetable…' />}
      {selectedDate && query.error && (
        <ErrorState error={query.error} title='Could not load this daily timetable' />
      )}
      {query.data && query.data.movements.length === 0 && (
        <EmptyState
          title={`No ${direction === 'departure' ? 'departures' : 'arrivals'} on this day`}
          description={`There are no scheduled ${direction === 'departure' ? 'departures' : 'arrivals'} for ${fullDateLabel(selectedDate ?? query.data.dateLocal)}.`}
        />
      )}
      {query.data && query.data.movements.length > 0 && (
        <AirportTimetableTable
          data={query.data}
          direction={direction}
          selectedDate={selectedDate}
        />
      )}
    </section>
  );
}

function AirportTimetableTable({
  data,
  direction,
  selectedDate,
}: {
  data: AirportTimetable;
  direction: AirportMovementDirection;
  selectedDate: string | undefined;
}) {
  const columns: readonly ScheduleTableColumn<AirportMovement, AirportScheduleSortKey>[] = [
    {
      label: direction === 'departure' ? 'Departure' : 'Arrival',
      sortKey: 'event',
      render: (movement) => {
        const event = offsetTimestampParts(eventTime(movement, direction));

        return (
          <>
            <strong>{event.time}</strong>
            <small>{utcOffsetLabel(event.offset)}</small>
          </>
        );
      },
    },
    {
      label: 'Flight',
      sortKey: 'flight',
      render: (movement) => {
        const name = flightName(movement.flightNumber, data.airlines);

        return (
          <Link to={`/flight/${name}`}>
            <strong>{name}</strong>
          </Link>
        );
      },
    },
    {
      label: 'Route',
      sortKey: 'route',
      render: (movement) => (
        <ScheduleRouteCell
          departureAirportId={movement.departureAirportId}
          arrivalAirportId={movement.arrivalAirportId}
          airports={data.airports}
        />
      ),
    },
    {
      label: direction === 'departure' ? 'Arrival' : 'Departure',
      render: (movement) => {
        const other = offsetTimestampParts(otherTime(movement, direction));
        const dayOffset = localDayOffset(
          eventTime(movement, direction),
          otherTime(movement, direction),
        );

        return (
          <>
            <strong>{other.time}</strong>
            <small>
              {dayOffsetLabel(dayOffset)} · {utcOffsetLabel(other.offset)}
            </small>
          </>
        );
      },
    },
    {
      label: 'Aircraft',
      sortKey: 'aircraft',
      render: (movement) => {
        const aircraft = data.aircraft[movement.aircraftId];

        return (
          <>
            <strong>{aircraftName(movement.aircraftId, data.aircraft)}</strong>
            <small>{aircraft?.iataCode ?? movement.aircraftId}</small>
          </>
        );
      },
    },
    {
      label: 'Configuration',
      render: (movement) => (
        <Badge tone='neutral'>{movement.aircraftConfigurationVersion || '—'}</Badge>
      ),
    },
    {
      label: 'Duration',
      render: (movement) => duration(movement.durationSeconds),
    },
  ];

  return (
    <ScheduleTable
      rows={data.movements}
      columns={columns}
      defaultSort='event'
      compareRows={(left, right, sort) => compareMovement(left, right, sort, direction, data)}
      rowKey={(movement) => movementKey(movement, data)}
      expandedLabel={(movement) => flightName(movement.flightNumber, data.airlines)}
      renderDetails={(movement) => (
        <PublishedScheduleDetails schedule={movement} airlines={data.airlines} />
      )}
      eyebrow={`Exact ${direction === 'departure' ? 'departures' : 'arrivals'}`}
      title={`${numberLabel(data.movements.length)} scheduled ${direction === 'departure' ? 'departures' : 'arrivals'}`}
      itemLabel={direction === 'departure' ? 'departures' : 'arrivals'}
      ariaLabel={`${fullDateLabel(selectedDate ?? data.dateLocal)} ${direction === 'departure' ? 'departures' : 'arrivals'}`}
    />
  );
}

function compareMovement(
  left: AirportMovement,
  right: AirportMovement,
  sort: AirportScheduleSortKey,
  direction: AirportMovementDirection,
  data: AirportTimetable,
): number {
  const values: Record<AirportScheduleSortKey, [string, string]> = {
    event: [eventTime(left, direction), eventTime(right, direction)],
    flight: [
      flightName(left.flightNumber, data.airlines),
      flightName(right.flightNumber, data.airlines),
    ],
    route: [
      `${left.departureAirportId}>${left.arrivalAirportId}`,
      `${right.departureAirportId}>${right.arrivalAirportId}`,
    ],
    aircraft: [
      aircraftName(left.aircraftId, data.aircraft),
      aircraftName(right.aircraftId, data.aircraft),
    ],
  };
  const [leftValue, rightValue] = values[sort];

  return leftValue.localeCompare(rightValue);
}

function movementKey(movement: AirportMovement, data: AirportTimetable): string {
  return [
    flightName(movement.flightNumber, data.airlines),
    movement.departureAirportId,
    movement.arrivalAirportId,
    movement.departureTime,
    movement.arrivalTime,
    movement.aircraftId,
  ].join('-');
}

function loadTimetable(
  airport: string,
  direction: AirportMovementDirection,
  selectedDate: string | undefined,
) {
  if (!selectedDate) {
    return Promise.reject(new Error('Select a timetable date'));
  }

  return direction === 'departure'
    ? api.airportDepartures(airport, selectedDate)
    : api.airportArrivals(airport, selectedDate);
}

function eventTime(movement: AirportMovement, direction: AirportMovementDirection): string {
  return direction === 'departure' ? movement.departureTime : movement.arrivalTime;
}

function otherTime(movement: AirportMovement, direction: AirportMovementDirection): string {
  return direction === 'departure' ? movement.arrivalTime : movement.departureTime;
}

function utcOffsetLabel(offset: string): string {
  return offset === 'Z' ? 'UTC' : `UTC${offset}`;
}

function dayOffsetLabel(offset: number): string {
  if (offset === 0) {
    return 'same day';
  }

  const value = Math.abs(offset);
  return `${offset > 0 ? '+' : '−'}${value} ${value === 1 ? 'day' : 'days'}`;
}
