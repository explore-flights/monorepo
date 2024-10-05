import React from 'react';
import { RouterLink, RouterLinkProps } from './router-link';

export interface FlightLinkProps extends Omit<RouterLinkProps, 'to'> {
  flightNumber: string;
}

export function FlightLink({ flightNumber, ...props }: FlightLinkProps) {
  return <RouterLink {...props} to={`/flight/${encodeURIComponent(flightNumber)}`}>{props.children ?? flightNumber}</RouterLink>;
}