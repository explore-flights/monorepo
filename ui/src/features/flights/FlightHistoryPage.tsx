import { useQuery } from '@tanstack/react-query';
import {
  ArrowLeft,
  ArrowRight,
  Clock,
  GitCompareArrows,
  History,
  Plane,
  Radio,
  X,
} from 'lucide-react';
import { useMemo } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '@/api/client';
import type { FlightScheduleVariant, FlightScheduleVersions } from '@/api/types';
import { Badge, Card, ErrorState, Loading, PageHeader, Stat } from '@/components/primitives';
import { dateLabel, duration, flightName } from '@/lib/format';
import { arrivalScheduleTime, dayDeltaLabel, departureScheduleTime } from '@/lib/time';
import { compareFlightVariants, type FieldChange, variantFor } from './flightChanges';

export function FlightHistoryPage() {
  const { flightNumber = '', airport = '', date = '' } = useParams();
  const query = useQuery({
    queryKey: ['flight-history', flightNumber, airport, date],
    queryFn: () => api.flightVersions(flightNumber, airport, date),
  });
  const data = query.data;
  const versions = useMemo(
    () =>
      [...(data?.versions ?? [])].sort((left, right) => right.version.localeCompare(left.version)),
    [data],
  );
  const active = versions.filter((version) => version.flightVariantId).length;
  const changedFields = data
    ? new Set(
        versions.flatMap((version, index) => {
          const current = variantFor(data, version.flightVariantId);
          const previous = variantFor(data, versions[index + 1]?.flightVariantId);
          return index === versions.length - 1
            ? []
            : compareFlightVariants(previous, current, data, data.departureDateLocal).map(
                (change) => change.label,
              );
        }),
      ).size
    : 0;
  const departureAirport = data?.airports[data.departureAirportId];

  return (
    <div className='page history-page'>
      <div className='breadcrumbs'>
        <Link to={`/flight/${flightNumber}`}>
          <ArrowLeft size={14} /> {flightNumber.toUpperCase()}
        </Link>
        <span>/</span>
        <span>Version history</span>
      </div>
      <PageHeader
        eyebrow='Version history'
        title={
          <>
            {flightNumber.toUpperCase()}{' '}
            <span className='muted-title'>from {airport.toUpperCase()}</span>
          </>
        }
        description={`${dateLabel(date, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })} · ${departureAirport?.timezone ?? 'Local departure time'} · Every published field change`}
        actions={
          <Badge tone='amber'>
            <History size={14} />
            {versions.length || '—'} versions
          </Badge>
        }
      />
      {query.isLoading && <Loading label='Loading schedule history…' />}
      {query.error && <ErrorState error={query.error} />}
      {data && (
        <>
          <div className='stats-grid history-stats'>
            <Stat
              label='First observed'
              value={dateLabel(versions.at(-1)?.version ?? '', { month: 'short', day: 'numeric' })}
            />
            <Stat
              label='Latest update'
              value={dateLabel(versions[0]?.version ?? '', { month: 'short', day: 'numeric' })}
            />
            <Stat label='Operating versions' value={active} />
            <Stat
              label='Fields changed'
              value={changedFields}
              hint={`${departureAirport?.iataCode ?? airport} · ${departureAirport?.timezone ?? 'timezone unavailable'}`}
            />
          </div>
          <Card className='history-timeline'>
            <div className='timeline-head'>
              <GitCompareArrows size={19} />
              <div>
                <h2>Change timeline</h2>
                <p>
                  Newest observation first. Every schedule, operation, codeshare, and data-element
                  field is compared with the preceding observation.
                </p>
              </div>
            </div>
            <div className='timeline'>
              {versions.map((version, index) => {
                const variant = variantFor(data, version.flightVariantId);
                const olderVersion = versions[index + 1];
                const previous = variantFor(data, olderVersion?.flightVariantId);
                return (
                  <HistoryEntry
                    key={`${version.version}-${index}`}
                    version={version.version}
                    variant={variant}
                    previous={previous}
                    hasPrevious={olderVersion !== undefined}
                    data={data}
                    latest={index === 0}
                  />
                );
              })}
            </div>
          </Card>
        </>
      )}
    </div>
  );
}

function HistoryEntry({
  version,
  variant,
  previous,
  hasPrevious,
  data,
  latest,
}: {
  version: string;
  variant?: FlightScheduleVariant;
  previous?: FlightScheduleVariant;
  hasPrevious: boolean;
  data: FlightScheduleVersions;
  latest: boolean;
}) {
  const changes = hasPrevious
    ? compareFlightVariants(previous, variant, data, data.departureDateLocal)
    : [];
  const from = data.airports[data.departureAirportId];
  const to = variant ? data.airports[variant.arrivalAirportId] : undefined;
  const departure = variant ? departureScheduleTime(data.departureDateLocal, variant) : undefined;
  const arrival = variant ? arrivalScheduleTime(data.departureDateLocal, variant) : undefined;
  const summary = changeSummary(changes.length, hasPrevious);

  return (
    <article className='timeline-entry'>
      <div className='timeline-rail'>
        <span>{latest ? '●' : '○'}</span>
      </div>
      <div className='timeline-content'>
        <header>
          <div>
            <strong>{dateLabel(version, { dateStyle: 'medium', timeStyle: 'short' })}</strong>
            {latest && <Badge tone='blue'>Latest</Badge>}
          </div>
          <span>{summary}</span>
        </header>
        {variant && departure && arrival ? (
          <div className='version-flight'>
            <div className='version-route'>
              <div>
                <strong>{departure.time}</strong>
                <span>
                  {from?.iataCode} · {departure.offset}
                </span>
                <small>{from?.timezone}</small>
              </div>
              <ArrowRight />
              <div>
                <strong>
                  {arrival.time} <sup>{dayDeltaLabel(arrival.dayDelta)}</sup>
                </strong>
                <span>
                  {to?.iataCode} · {arrival.offset}
                </span>
                <small>{to?.timezone}</small>
              </div>
            </div>
            <div className='version-meta'>
              <span>
                <Plane size={15} />
                {flightName(variant.operatedAs, data.airlines)}
              </span>
              <span>{data.aircraft[variant.aircraftId]?.name ?? variant.aircraftId}</span>
              <span>
                <Clock size={15} />
                {duration(variant.durationSeconds)}
              </span>
              <span>
                <Radio size={15} />
                {variant.serviceType || '—'}
              </span>
            </div>
          </div>
        ) : (
          <div className='version-removed'>
            <X size={18} />
            <div>
              <strong>Leg cancelled</strong>
              <span>
                Only the departure airport and local date are known for this published version; no
                routing or operating details are inferred.
              </span>
            </div>
          </div>
        )}
        {changes.length > 0 && (
          <div className='change-groups'>
            {(['schedule', 'operation', 'distribution'] as const).map((group) => {
              const groupChanges = changes.filter((change) => change.group === group);
              if (!groupChanges.length) {
                return null;
              }
              return (
                <section key={group}>
                  <h3>{changeGroupLabel(group)}</h3>
                  <div className='change-list'>
                    {groupChanges.map((change) => (
                      <div key={change.key}>
                        <span>{change.label}</span>
                        <del>{change.before || '—'}</del>
                        <ArrowRight size={13} />
                        <ins>{change.after || '—'}</ins>
                      </div>
                    ))}
                  </div>
                </section>
              );
            })}
          </div>
        )}
      </div>
    </article>
  );
}

function changeSummary(changeCount: number, hasPrevious: boolean) {
  if (changeCount > 0) {
    return `${changeCount} field change${changeCount === 1 ? '' : 's'}`;
  }

  return hasPrevious ? 'No field changes' : 'Initial observation';
}

function changeGroupLabel(group: FieldChange['group']) {
  switch (group) {
    case 'schedule':
      return 'Schedule';
    case 'operation':
      return 'Operation';
    case 'distribution':
      return 'Distribution data';
  }
}
