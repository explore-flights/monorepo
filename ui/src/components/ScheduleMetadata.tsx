import { ArrowRight } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { Airline, Airport, FlightNumber, FlightScheduleVariant } from '@/api/types';
import { airportCode, airportName, flightName } from '@/lib/format';

type PublishedScheduleMetadata = Pick<
  FlightScheduleVariant,
  | 'serviceType'
  | 'aircraftOwner'
  | 'aircraftId'
  | 'aircraftConfigurationVersion'
  | 'codeShares'
  | 'dataElements'
>;

export function ScheduleRouteCell({
  departureAirportId,
  arrivalAirportId,
  airports,
}: {
  departureAirportId: string;
  arrivalAirportId: string;
  airports: Readonly<Record<string, Airport>>;
}) {
  return (
    <div className='route-cell'>
      <strong>{airportCode(departureAirportId, airports)}</strong>
      <ArrowRight size={13} />
      <strong>{airportCode(arrivalAirportId, airports)}</strong>
      <small>
        {airportName(departureAirportId, airports)} → {airportName(arrivalAirportId, airports)}
      </small>
    </div>
  );
}

export function PublishedScheduleDetails({
  schedule,
  airlines,
  children,
}: {
  schedule: PublishedScheduleMetadata;
  airlines: Readonly<Record<string, Airline>>;
  children?: ReactNode;
}) {
  return (
    <div className='schedule-details'>
      <dl>
        <div>
          <dt>Service type</dt>
          <dd>{schedule.serviceType || '—'}</dd>
        </div>
        <div>
          <dt>Aircraft owner</dt>
          <dd>{schedule.aircraftOwner || '—'}</dd>
        </div>
        <div>
          <dt>Aircraft ID</dt>
          <dd>{schedule.aircraftId}</dd>
        </div>
        <div>
          <dt>Configuration version</dt>
          <dd>{schedule.aircraftConfigurationVersion || '—'}</dd>
        </div>
        {children}
      </dl>
      <CodeshareDetails codeShares={schedule.codeShares} airlines={airlines} />
      {Object.keys(schedule.dataElements).length > 0 && (
        <div className='schedule-details-data-elements'>
          <span>Data elements</span>
          <DataElementList dataElements={schedule.dataElements} />
        </div>
      )}
    </div>
  );
}

export function CodeshareDetails({
  className,
  codeShares,
  airlines,
}: {
  className?: string;
  codeShares: readonly FlightNumber[];
  airlines: Readonly<Record<string, Airline>>;
}) {
  return (
    <div className={className || undefined}>
      <span>Codeshares</span>
      <div className='detail-links'>
        {codeShares.length === 0
          ? 'None'
          : codeShares.map((codeShare) => {
              const number = flightName(codeShare, airlines);
              return (
                <Link key={number} to={`/flight/${number}`}>
                  {number}
                </Link>
              );
            })}
      </div>
    </div>
  );
}

export function DataElementList({
  dataElements,
}: {
  dataElements: Readonly<Record<number, string>>;
}) {
  return (
    <div className='data-elements'>
      {Object.entries(dataElements).map(([key, value]) => (
        <code key={key}>
          {key}: {value}
        </code>
      ))}
    </div>
  );
}
