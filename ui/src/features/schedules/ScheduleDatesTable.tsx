import { ArrowDown, ArrowRight, ArrowUp, ChevronDown, ChevronRight } from 'lucide-react';
import { Fragment, useState } from 'react';
import { Link } from 'react-router-dom';
import type {
  FlightNumber,
  FlightScheduleVariant,
  OperatingFlightScheduleItem,
  QuerySchedulesResponse,
} from '@/api/types';
import { Badge, Button, Card } from '@/components/primitives';
import type { DateBasis } from '@/lib/date';
import { daysBetween } from '@/lib/date';
import { dateLabel, duration, flightName } from '@/lib/format';
import {
  arrivalScheduleTime,
  dayDeltaLabel,
  departureScheduleTime,
  type LocalScheduleTime,
  scheduleInstant,
} from '@/lib/time';

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
  const [sort, setSort] = useState<SortKey>('date');
  const [descending, setDescending] = useState(false);
  const [page, setPage] = useState(1);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const pageSize = 50;
  const sorted = [...records].sort(
    (left, right) => compareRecord(left, right, sort, data) * (descending ? -1 : 1),
  );
  const pages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const currentPage = Math.min(page, pages);
  const visible = sorted.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  function changeSort(key: SortKey) {
    if (sort === key) {
      setDescending(!descending);
    } else {
      setSort(key);
      setDescending(false);
    }
    setPage(1);
  }

  function toggleExpanded(key: string) {
    setExpanded((previous) => {
      const next = new Set(previous);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }

  return (
    <Card className='table-card workspace-date-table'>
      <div className='schedule-table-header'>
        <div>
          <span className='eyebrow'>Exact departures</span>
          <h2>{title}</h2>
        </div>
        <div className='pagination'>
          <Button
            variant='ghost'
            aria-label='Previous page'
            disabled={currentPage <= 1}
            onClick={() => setPage(currentPage - 1)}
          >
            ←
          </Button>
          <span>
            Page {currentPage} of {pages}
          </span>
          <Button
            variant='ghost'
            aria-label='Next page'
            disabled={currentPage >= pages}
            onClick={() => setPage(currentPage + 1)}
          >
            →
          </Button>
        </div>
      </div>
      <div className='table-scroll'>
        <table className='data-table rich-schedule-table'>
          <thead>
            <tr>
              <th />
              <Sortable
                label='Date & time'
                field='date'
                active={sort}
                descending={descending}
                onClick={changeSort}
              />
              <Sortable
                label='Flight'
                field='flight'
                active={sort}
                descending={descending}
                onClick={changeSort}
              />
              <Sortable
                label='Route'
                field='route'
                active={sort}
                descending={descending}
                onClick={changeSort}
              />
              <th>Arrival</th>
              <Sortable
                label='Aircraft'
                field='aircraft'
                active={sort}
                descending={descending}
                onClick={changeSort}
              />
              <th>Configuration</th>
              <th>Duration</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((record) => {
              const departure = departureForBasis(record, dateBasis);
              const arrival = arrivalForBasis(record, dateBasis);
              const from = data.airports[record.item.departureAirportId];
              const to = data.airports[record.variant.arrivalAirportId];
              const flight = flightName(record.flightNumber, data.airlines);
              const key = `${flight}-${record.item.departureAirportId}-${record.item.departureDateLocal}-${record.item.version}`;
              const isOpen = expanded.has(key);
              return (
                <Fragment key={key}>
                  <tr>
                    <td>
                      <button
                        className='row-expand'
                        aria-label={`${isOpen ? 'Collapse' : 'Expand'} ${flight} details`}
                        onClick={() => toggleExpanded(key)}
                      >
                        {isOpen ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
                      </button>
                    </td>
                    <td>
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
                    </td>
                    <td>
                      <Link to={`/flight/${flight}`}>
                        <strong>{flight}</strong>
                      </Link>
                      <small>
                        Operated as {flightName(record.variant.operatedAs, data.airlines)}
                      </small>
                    </td>
                    <td>
                      <div className='route-cell'>
                        <strong>{from?.iataCode ?? record.item.departureAirportId}</strong>
                        <ArrowRight size={13} />
                        <strong>{to?.iataCode ?? record.variant.arrivalAirportId}</strong>
                        <small>
                          {from?.name} → {to?.name}
                        </small>
                      </div>
                    </td>
                    <td>
                      <strong>{arrival.date}</strong>
                      <small>
                        {arrival.time} {dayDeltaLabel(arrival.dayDelta)} · {arrival.offset}
                      </small>
                    </td>
                    <td>
                      <strong>
                        {data.aircraft[record.variant.aircraftId]?.name ??
                          record.variant.aircraftId}
                      </strong>
                      <small>{record.variant.aircraftOwner}</small>
                    </td>
                    <td>
                      <Badge tone='neutral'>
                        {record.variant.aircraftConfigurationVersion || '—'}
                      </Badge>
                    </td>
                    <td>{duration(record.variant.durationSeconds)}</td>
                  </tr>
                  {isOpen && (
                    <tr className='expanded-table-row'>
                      <td colSpan={8}>
                        <ScheduleDetails record={record} data={data} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
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
      <div>
        <span>Codeshares</span>
        <div className='detail-links'>
          {record.variant.codeShares.length
            ? record.variant.codeShares.map((value) => {
                const number = flightName(value, data.airlines);
                return (
                  <Link key={number} to={`/flight/${number}`}>
                    {number}
                  </Link>
                );
              })
            : 'None'}
        </div>
      </div>
      {Object.keys(record.variant.dataElements).length > 0 && (
        <div className='schedule-details-data-elements'>
          <span>Data elements</span>
          <div className='data-elements'>
            {Object.entries(record.variant.dataElements).map(([key, value]) => (
              <code key={key}>
                {key}: {value}
              </code>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Sortable({
  label,
  field,
  active,
  descending,
  onClick,
}: {
  label: string;
  field: SortKey;
  active: SortKey;
  descending: boolean;
  onClick: (field: SortKey) => void;
}) {
  return (
    <th>
      <button className='sort-button' onClick={() => onClick(field)}>
        {label}
        {active === field && (descending ? <ArrowDown size={12} /> : <ArrowUp size={12} />)}
      </button>
    </th>
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

function departureForBasis(record: ScheduleDateRecord, basis: DateBasis): LocalScheduleTime {
  if (basis === 'local') {
    return departureScheduleTime(record.item.departureDateLocal, record.variant);
  }
  return utcTime(scheduleInstant(record.item.departureDateLocal, record.variant));
}

function arrivalForBasis(record: ScheduleDateRecord, basis: DateBasis): LocalScheduleTime {
  if (basis === 'local') {
    return arrivalScheduleTime(record.item.departureDateLocal, record.variant);
  }
  const departure = departureForBasis(record, basis);
  const arrival = utcTime(
    scheduleInstant(record.item.departureDateLocal, record.variant) +
      record.variant.durationSeconds * 1000,
  );
  return { ...arrival, dayDelta: daysBetween(departure.date, arrival.date) };
}

function utcTime(instant: number): LocalScheduleTime {
  if (!Number.isFinite(instant)) {
    return { date: '', time: '—', offset: 'UTC+00:00', dayDelta: 0 };
  }
  const date = new Date(instant);
  return {
    date: date.toISOString().slice(0, 10),
    time: date.toISOString().slice(11, 16),
    offset: 'UTC+00:00',
    dayDelta: 0,
  };
}
