import { Link } from 'react-router-dom';
import type {
  FlightNumber,
  FlightScheduleVariant,
  OperatingFlightScheduleItem,
  QuerySchedulesResponse,
} from '@/api/types';
import { Badge } from '@/components/primitives';
import { PublishedScheduleDetails, ScheduleRouteCell } from '@/components/ScheduleMetadata';
import type { DateBasis } from '@/lib/date';
import { aircraftName, dateLabel, dateTimeLabel, duration, flightName } from '@/lib/format';
import {
  arrivalScheduleTimeForBasis,
  dayDeltaLabel,
  departureScheduleTimeForBasis,
  scheduleInstant,
} from '@/lib/time';
import { ScheduleTable, type ScheduleTableColumn } from './ScheduleTable';

export interface ScheduleDateRecord {
  flightNumber: FlightNumber;
  item: OperatingFlightScheduleItem;
  variant: FlightScheduleVariant;
}

type SortKey = 'date' | 'flight' | 'route' | 'aircraft';

export function ScheduleDatesTable({
  records,
  data,
  dateBasis,
  title = `${records.length} matching departures`,
}: {
  records: readonly ScheduleDateRecord[];
  data: QuerySchedulesResponse;
  dateBasis: DateBasis;
  title?: string;
}) {
  const columns: readonly ScheduleTableColumn<ScheduleDateRecord, SortKey>[] = [
    {
      label: 'Date & time',
      sortKey: 'date',
      render: (record) => {
        const departure = departureScheduleTimeForBasis(
          record.item.departureDateLocal,
          record.variant,
          dateBasis,
        );

        return (
          <>
            <strong>
              {dateLabel(departure.date, {
                month: 'short',
                day: '2-digit',
                year: 'numeric',
              })}
            </strong>
            <small>
              {departure.time} · {departure.offset}
            </small>
          </>
        );
      },
    },
    {
      label: 'Flight',
      sortKey: 'flight',
      render: (record) => {
        const flight = flightName(record.flightNumber, data.airlines);

        return (
          <>
            <Link to={`/flight/${flight}`}>
              <strong>{flight}</strong>
            </Link>
            <small>Operated as {flightName(record.variant.operatedAs, data.airlines)}</small>
          </>
        );
      },
    },
    {
      label: 'Route',
      sortKey: 'route',
      render: (record) => (
        <ScheduleRouteCell
          departureAirportId={record.item.departureAirportId}
          arrivalAirportId={record.variant.arrivalAirportId}
          airports={data.airports}
        />
      ),
    },
    {
      label: 'Arrival',
      render: (record) => {
        const arrival = arrivalScheduleTimeForBasis(
          record.item.departureDateLocal,
          record.variant,
          dateBasis,
        );

        return (
          <>
            <strong>
              {dateLabel(arrival.date, {
                month: 'short',
                day: '2-digit',
                year: 'numeric',
              })}
            </strong>
            <small>
              {arrival.time} {dayDeltaLabel(arrival.dayDelta)} · {arrival.offset}
            </small>
          </>
        );
      },
    },
    {
      label: 'Aircraft',
      sortKey: 'aircraft',
      render: (record) => (
        <>
          <strong>{aircraftName(record.variant.aircraftId, data.aircraft)}</strong>
          <small>{record.variant.aircraftOwner}</small>
        </>
      ),
    },
    {
      label: 'Configuration',
      render: (record) => (
        <Badge tone='neutral'>{record.variant.aircraftConfigurationVersion || '—'}</Badge>
      ),
    },
    {
      label: 'Duration',
      render: (record) => duration(record.variant.durationSeconds),
    },
  ];

  return (
    <ScheduleTable
      rows={records}
      columns={columns}
      defaultSort='date'
      compareRows={(left, right, sort) => compareRecord(left, right, sort, data)}
      rowKey={(record) =>
        `${flightName(record.flightNumber, data.airlines)}-${record.item.departureAirportId}-${record.item.departureDateLocal}-${record.item.version}`
      }
      expandedLabel={(record) => flightName(record.flightNumber, data.airlines)}
      renderDetails={(record) => (
        <PublishedScheduleDetails schedule={record.variant} airlines={data.airlines}>
          <div>
            <dt>Record version</dt>
            <dd>{dateTimeLabel(record.item.version) || '—'}</dd>
          </div>
          <div>
            <dt>Observed versions</dt>
            <dd>{record.item.versionCount}</dd>
          </div>
        </PublishedScheduleDetails>
      )}
      eyebrow='Exact departures'
      title={title}
      itemLabel='departures'
      ariaLabel='Matching scheduled departures'
    />
  );
}

function compareRecord(
  left: ScheduleDateRecord,
  right: ScheduleDateRecord,
  key: SortKey,
  data: QuerySchedulesResponse,
) {
  const values: Record<SortKey, [string | number, string | number]> = {
    date: [
      scheduleInstant(left.item.departureDateLocal, left.variant),
      scheduleInstant(right.item.departureDateLocal, right.variant),
    ],
    flight: [
      flightName(left.flightNumber, data.airlines),
      flightName(right.flightNumber, data.airlines),
    ],
    route: [
      `${left.item.departureAirportId}>${left.variant.arrivalAirportId}`,
      `${right.item.departureAirportId}>${right.variant.arrivalAirportId}`,
    ],
    aircraft: [
      aircraftName(left.variant.aircraftId, data.aircraft),
      aircraftName(right.variant.aircraftId, data.aircraft),
    ],
  };
  const [leftValue, rightValue] = values[key];
  return typeof leftValue === 'number' && typeof rightValue === 'number'
    ? leftValue - rightValue
    : String(leftValue).localeCompare(String(rightValue));
}
