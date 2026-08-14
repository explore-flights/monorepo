import { ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import type {
  FlightNumber,
  FlightScheduleVariant,
  OperatingFlightScheduleItem,
  QuerySchedulesResponse,
} from '@/api/types';
import { Badge } from '@/components/primitives';
import { CodeshareDetails, DataElementList } from '@/components/ScheduleMetadata';
import type { DateBasis } from '@/lib/date';
import { dateLabel, duration, flightName } from '@/lib/format';
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
      render: (record) => {
        const from = data.airports[record.item.departureAirportId];
        const to = data.airports[record.variant.arrivalAirportId];

        return (
          <div className='route-cell'>
            <strong>{from?.iataCode ?? record.item.departureAirportId}</strong>
            <ArrowRight size={13} />
            <strong>{to?.iataCode ?? record.variant.arrivalAirportId}</strong>
            <small>
              {from?.name} → {to?.name}
            </small>
          </div>
        );
      },
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
          <strong>
            {data.aircraft[record.variant.aircraftId]?.name ?? record.variant.aircraftId}
          </strong>
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
      renderDetails={(record) => <ScheduleDetails record={record} data={data} />}
      eyebrow='Exact departures'
      title={title}
      itemLabel='departures'
      ariaLabel='Matching scheduled departures'
    />
  );
}

function ScheduleDetails({
  record,
  data,
}: {
  record: ScheduleDateRecord;
  data: QuerySchedulesResponse;
}) {
  return (
    <div className='schedule-details'>
      <dl>
        <div>
          <dt>Service type</dt>
          <dd>{record.variant.serviceType || '—'}</dd>
        </div>
        <div>
          <dt>Aircraft owner</dt>
          <dd>{record.variant.aircraftOwner || '—'}</dd>
        </div>
        <div>
          <dt>Aircraft ID</dt>
          <dd>{record.variant.aircraftId}</dd>
        </div>
        <div>
          <dt>Configuration version</dt>
          <dd>{record.variant.aircraftConfigurationVersion || '—'}</dd>
        </div>
        <div>
          <dt>Record version</dt>
          <dd>{record.item.version || '—'}</dd>
        </div>
        <div>
          <dt>Observed versions</dt>
          <dd>{record.item.versionCount}</dd>
        </div>
      </dl>
      <CodeshareDetails
        className=''
        codeShares={record.variant.codeShares}
        airlines={data.airlines}
        pathFor={(number) => `/flight/${number}`}
      />
      {Object.keys(record.variant.dataElements).length > 0 && (
        <div className='schedule-details-data-elements'>
          <span>Data elements</span>
          <DataElementList dataElements={record.variant.dataElements} />
        </div>
      )}
    </div>
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
      data.aircraft[left.variant.aircraftId]?.name ?? left.variant.aircraftId,
      data.aircraft[right.variant.aircraftId]?.name ?? right.variant.aircraftId,
    ],
  };
  const [leftValue, rightValue] = values[key];
  return typeof leftValue === 'number' && typeof rightValue === 'number'
    ? leftValue - rightValue
    : String(leftValue).localeCompare(String(rightValue));
}
