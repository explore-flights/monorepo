import React, { useCallback, useMemo, useState } from 'react';
import { useAirports, useDestinations } from '../components/util/state/data';
import { Button, Container, ContentLayout, Header } from '@cloudscape-design/components';
import { MaplibreMap, SmartLine } from '../components/maplibre/maplibre-map';
import { Marker } from 'react-map-gl/maplibre';
import { Airport } from '../lib/api/api.model';
import { WithRequired } from '@tanstack/react-query';

export function Airports() {
  const airports = useAirports().data.airports;

  const [selectedAirports, setSelectedAirports] = useState<ReadonlyArray<Airport>>([]);

  const onAirportClick = useCallback((airport: Airport) => {
    setSelectedAirports((prev) => {
      const idx = prev.findIndex((v) => v.id === airport.id);
      if (idx === -1) {
        return [...prev,  airport];
      }

      return prev.toSpliced(idx, 1);
    });
  }, []);

  const markersAndLines = useMemo(() => {
    if (selectedAirports.length > 0) {
      return buildAirportMarkersAndLines(selectedAirports, onAirportClick, true);
    }

    return buildAirportMarkersAndLines(airports, onAirportClick, false);
  }, [airports, selectedAirports, onAirportClick]);

  return (
    <ContentLayout header={<Header variant={'h1'}>Airports</Header>}>
      <Container>
        <MaplibreMap height={'80vh'}>
          {...markersAndLines}
        </MaplibreMap>
      </Container>
    </ContentLayout>
  );
}

function AirportNode({ airport, withConnections, exclude, onClick }: { airport: Airport, withConnections: boolean, exclude: ReadonlyArray<Airport>, onClick: (airport: Airport) => void }) {
  if (!airport.location) {
    return null;
  }

  return (
    withConnections
      ? <AirportNodeWithConnections airport={airport} exclude={exclude} onClick={onClick} />
      : <AirportMarker airport={{ ...airport, location: airport.location }} onClick={() => onClick(airport)} />
  );
}

function AirportNodeWithConnections({ airport, exclude, onClick }: { airport: Airport; exclude: ReadonlyArray<Airport>, onClick: (airport: Airport) => void }) {
  if (!airport.location) {
    return null;
  }

  const destinations = useDestinations(airport.id).data;

  const nodes: Array<React.ReactNode> = [];
  nodes.push(<AirportMarker airport={{ ...airport, location: airport.location }} onClick={() => onClick(airport)} />);

  for (const destination of destinations) {
    if (!destination.location) {
      continue;
    }

    if (exclude.findIndex((v) => v.id === destination.id) === -1) {
      nodes.push(<AirportNode airport={destination} withConnections={false} exclude={exclude} onClick={onClick}></AirportNode>);
    }

    nodes.push(<SmartLine src={[airport.location.lng, airport.location.lat]} dst={[destination.location.lng, destination.location.lat]} />);
  }

  return (
    <>{...nodes}</>
  );
}

function AirportMarker({ airport, onClick }: { airport: WithRequired<Airport, 'location'>, onClick?: () => void }) {
  return (
    <Marker
      longitude={airport.location.lng}
      latitude={airport.location.lat}
    >
      {/*<RouterInlineLink to={`/airport/${airport.iataCode ?? airport.icaoCode ?? airport.id}`} variant={'normal'}>
        {airport.iataCode ?? airport.icaoCode ?? airport.name}
      </RouterInlineLink>*/}
      <Button onClick={onClick}>
        {airport.iataCode ?? airport.icaoCode ?? airport.name}
      </Button>
    </Marker>
  );
}

function buildAirportMarkersAndLines(airports: ReadonlyArray<Airport>, onAirportClick: (airport: Airport) => void, withConnections: boolean) {
  const nodes: Array<React.ReactNode> = [];

  for (const airport of airports) {
    if (!airport.location) {
      continue;
    }

    nodes.push(
      <AirportNode airport={airport} withConnections={withConnections} exclude={airports} onClick={onAirportClick} />
    );
  }

  return nodes;
}