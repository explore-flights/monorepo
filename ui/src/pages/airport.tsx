import {
  Button,
  ContentLayout,
  Header,
} from '@cloudscape-design/components';
import React, { useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { useAirports, useDestinations } from '../components/util/state/data';
import { Airport, AirportId } from '../lib/api/api.model';
import { MaplibreMap, SmartLine } from '../components/maplibre/maplibre-map';
import { airportToString } from '../lib/util/flight';
import { AirportMarker } from '../components/maplibre/marker';

export function AirportPage() {
  const { id } = useParams();
  if (!id) {
    throw new Error();
  }

  const { data: airports } = useAirports();
  const airport = useMemo(() => {
    return airports.lookupByIata.get(id) ?? airports.lookupByIcao.get(id) ?? airports.lookupById.get(id as AirportId);
  }, [id, airports]);

  const { data: destinationAirports, isPending } = useDestinations(airport?.id ?? id as AirportId);

  return (
    <ContentLayout header={<Header variant={'h1'}>Airport {airport ? airportToString(airport) : id}</Header>}>
      <DestinationsMap airport={airport} destinations={destinationAirports} loading={isPending} />
    </ContentLayout>
  );
}

function DestinationsMap({ airport, destinations, loading }: { airport?: Airport, destinations: ReadonlyArray<Airport>, loading: boolean }) {
  const nodes = useMemo(() => {
    const nodes: Array<React.ReactNode> = [];
    if (!airport || !airport.location || destinations.length < 1) {
      return nodes;
    }

    const srcLocation = airport.location;
    nodes.push(
      <AirportMarker airport={airport}>
        <Button variant={'primary'} disabled={true}>{airportToString(airport)}</Button>
      </AirportMarker>
    );

    for (const destinationAirport of destinations) {
      nodes.push(<SmartLine src={[srcLocation.lng, srcLocation.lat]} dst={[destinationAirport.location.lng, destinationAirport.location.lat]} />);
      nodes.push(
        <AirportMarker airport={destinationAirport}>
          <Button variant={'normal'} disabled={true}>{airportToString(destinationAirport)}</Button>
        </AirportMarker>
      );
    }

    return nodes;
  }, [airport, destinations]);

  return (
    <MaplibreMap height={'80vh'} initialLat={airport?.location.lat} initialLng={airport?.location.lng} loading={loading || (!airport)}>
      {...nodes}
    </MaplibreMap>
  );
}
