import { Link } from 'react-router-dom';
import type { Airline, FlightNumber } from '@/api/types';
import { flightName } from '@/lib/format';

export function CodeshareDetails({
  className,
  codeShares,
  airlines,
  pathFor,
}: {
  className: string;
  codeShares: readonly FlightNumber[];
  airlines: Readonly<Record<string, Airline>>;
  pathFor: (flightNumber: string) => string;
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
                <Link key={number} to={pathFor(number)}>
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
