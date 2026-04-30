import React from 'react';
import { Marker } from 'react-map-gl/maplibre';
import { MarkerProps } from 'react-map-gl/mapbox-legacy';
import { Airport } from '../../lib/api/api.model';

export interface MapMarkerProps extends Omit<MarkerProps, 'longitude' | 'latitude'> {
  location: { lat: number, lng: number };
}

export function MapMarker({ location, ...props }: React.PropsWithChildren<MapMarkerProps>) {
  return (
    <Marker longitude={location.lng} latitude={location.lat} opacityWhenCovered={'0.0'} {...props}>
      {props.children}
    </Marker>
  );
}

export interface AirportMarkerProps extends Omit<MapMarkerProps, 'location'> {
  airport: Airport;
}

export function AirportMarker({ airport, ...props }: React.PropsWithChildren<AirportMarkerProps>) {
  return (
    <MapMarker location={airport.location} {...props} />
  );
}