import React from 'react';
import { RouterLink, RouterLinkProps } from './router-link';

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