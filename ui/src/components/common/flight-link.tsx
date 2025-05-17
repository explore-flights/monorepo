import React from 'react';
import { RouterLink, RouterLinkProps } from './router-link';
import { Airline, FlightNumber } from '../../lib/api/api.model';
import { BulletSeperator, Join } from './join';
import { flightNumberToString } from '../../lib/util/flight';

export interface FlightLinkProps extends Omit<RouterLinkProps, 'to'> {
  flightNumber: string;
  query?: URLSearchParams;
}

export function FlightLink({ flightNumber, query, ...props }: FlightLinkProps) {
  let suffix = '';
  if (query) {
    suffix = '?' + query.toString();
  }

  return <RouterLink {...props} to={`/flight/${encodeURIComponent(flightNumber)}${suffix}`}>{props.children ?? flightNumber}</RouterLink>;
}

export function FlightNumberList({ flightNumbers, query, exclude, rel }: { flightNumbers: ReadonlyArray<[Airline, FlightNumber]>, query?: URLSearchParams, exclude?: FlightNumber, rel?: string }) {
  return (
    <Join
      seperator={BulletSeperator}
      items={flightNumbers.map(([airline, fn]) => <InternalFlightLink flightNumber={fn} airline={airline} query={query} exclude={exclude} rel={rel} />)}
    />
  );
}

export function InternalFlightLink({ flightNumber, airline, query, exclude, rel }: { flightNumber: FlightNumber, airline: Airline, query?: URLSearchParams, exclude?: FlightNumber, rel?: string }) {
  if (exclude && flightNumber.airlineId == exclude.airlineId && flightNumber.number === exclude.number && flightNumber.suffix === exclude.suffix) {
    return flightNumberToString(flightNumber, airline);
  }

  return <FlightLink flightNumber={flightNumberToString(flightNumber, airline)} query={query} rel={rel} />;
}