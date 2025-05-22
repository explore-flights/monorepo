import React, { useCallback, useMemo, useState } from 'react';
import { useAirports, useDestinations } from '../components/util/state/data';
import {
  Badge, BreadcrumbGroup,
  BreadcrumbGroupProps,
  Button,
  ColumnLayout,
  Container,
  ContentLayout,
  Header
} from '@cloudscape-design/components';
import { distance } from '@turf/turf';
import { MaplibreMap, SmartLine } from '../components/maplibre/maplibre-map';
import { Marker } from 'react-map-gl/maplibre';
import { Airport } from '../lib/api/api.model';
import { WithRequired } from '@tanstack/react-query';

export function Airports() {
  const airports = useAirports().data.airports;

  const [selectedAirports, setSelectedAirports] = useState<ReadonlyArray<Airport>>([]);

  const onAirportClick = useCallback((airport: Airport, removeTail?: boolean) => {
    setSelectedAirports((prev) => {
      let idx = prev.findIndex((v) => v.id === airport.id);
      if (idx === -1) {
        return [...prev,  airport];
      }

      if (removeTail) {
        idx += 1;
      }

      return prev.toSpliced(idx, prev.length - idx);
    });
  }, []);

  const markersAndLines = useMemo(() => {
    if (selectedAirports.length > 0) {
      return buildAirportMarkersAndLines(selectedAirports, onAirportClick, true);
    }

    return buildAirportMarkersAndLines(airports, onAirportClick, false);
  }, [airports, selectedAirports, onAirportClick]);

  const breadcrumbItems = useMemo(() => {
    const items: Array<BreadcrumbGroupProps.Item & { airport?: Airport }> = [];
    items.push({
      text: 'Start',
      href: '#',
    });

    let previousAirportLocation: [number, number] | null = null;
    let totalDistance = 0;

    for (let i = 0; i < selectedAirports.length; i++) {
      const airport = selectedAirports[i];
      const location = [airport.location?.lng ?? 0.0, airport.location?.lat ?? 0.0] satisfies [number, number];

      if (previousAirportLocation != null) {
        totalDistance += distance(previousAirportLocation, location, { units: 'miles' });
      }

      let suffix = '';
      if (i > 0 && i >= selectedAirports.length - 1) {
        suffix = ` (${totalDistance.toFixed(2)} mi)`;
      }

      items.push({
        airport: airport,
        text: (airport.iataCode ?? airport.icaoCode ?? airport.id) + suffix,
        href: '#',
      });

      previousAirportLocation = location;
    }

    return items;
  }, [selectedAirports]);

  return (
    <ContentLayout header={<Header variant={'h1'}>Airports</Header>}>
      <Container>
        <ColumnLayout columns={1}>
          <BreadcrumbGroup
            items={breadcrumbItems}
            onClick={(e) => {
              e.preventDefault();
              const airport = e.detail.item.airport;
              if (airport) {
                onAirportClick(airport, true);
              } else {
                setSelectedAirports([]);
              }
            }}
          />
          <MaplibreMap height={'80vh'}>
            {...markersAndLines}
          </MaplibreMap>
        </ColumnLayout>
      </Container>
    </ContentLayout>
  );
}

function AirportNodeWithConnections({ airport, exclude, onClick, step }: { airport: WithRequired<Airport, 'location'>; exclude: ReadonlyArray<Airport>, onClick: (airport: Airport) => void, step?: number }) {
  const destinations = useDestinations(airport.id).data;

  const nodes: Array<React.ReactNode> = [];
  nodes.push(<AirportMarker airport={{ ...airport, location: airport.location }} onClick={() => onClick(airport)} step={step} />);

  for (const destination of destinations) {
    if (!destination.location) {
      continue;
    }

    if (exclude.findIndex((v) => v.id === destination.id) === -1) {
      nodes.push(<AirportMarker airport={{ ...destination, location: destination.location }} onClick={() => onClick(destination)} />);
      nodes.push(<SmartLine src={[airport.location.lng, airport.location.lat]} dst={[destination.location.lng, destination.location.lat]} />);
    }
  }

  return (
    <>{...nodes}</>
  );
}

function AirportMarker({ airport, onClick, step }: { airport: WithRequired<Airport, 'location'>, onClick: () => void, step?: number }) {
  let badge: React.ReactNode | null = null;
  if (step !== undefined) {
    badge = (
      <>
        <Badge color={'green'}>{step}</Badge>
        &nbsp;
      </>
    );
  }

  return (
    <Marker
      longitude={airport.location.lng}
      latitude={airport.location.lat}
    >
      {/*<RouterInlineLink to={`/airport/${airport.iataCode ?? airport.icaoCode ?? airport.id}`} variant={'normal'}>
        {airport.iataCode ?? airport.icaoCode ?? airport.name}
      </RouterInlineLink>*/}
      <Button onClick={onClick} variant={step !== undefined ? 'primary' : 'normal'} disabled={step !== undefined}>
        {badge}{airport.iataCode ?? airport.icaoCode ?? airport.name}
      </Button>
    </Marker>
  );
}

function buildAirportMarkersAndLines(airports: ReadonlyArray<Airport>, onAirportClick: (airport: Airport) => void, withConnections: boolean) {
  const nodes: Array<React.ReactNode> = [];

  let previousAirportLocation: [number, number] | null = null;
  for (let i = 0; i < airports.length; i++) {
    const _airport = airports[i];
    if (!_airport.location) {
      continue;
    }

    const airport = { ..._airport, location: _airport.location };

    if (withConnections) {
      if (i >= airports.length - 1) {
        nodes.push(<AirportNodeWithConnections airport={airport} exclude={airports} onClick={onAirportClick} step={i + 1} />);
      } else {
        nodes.push(<AirportMarker airport={airport} onClick={() => onAirportClick(airport)} step={i + 1} />);
      }

      if (previousAirportLocation != null) {
        nodes.push(<SmartLine src={previousAirportLocation} dst={[airport.location.lng, airport.location.lat]} />);
      }
    } else {
      nodes.push(<AirportMarker airport={airport} onClick={() => onAirportClick(airport)} />);
    }

    previousAirportLocation = [airport.location.lng, airport.location.lat];
  }

  return nodes;
}