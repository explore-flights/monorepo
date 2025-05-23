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

  const [{ airports: selectedAirports, tailShowConnections }, setSelectionState] = useState<{ airports: ReadonlyArray<Airport>, tailShowConnections: boolean }>({
    airports: [],
    tailShowConnections: false,
  });

  const onAirportClick = useCallback((airport: Airport) => {
    setSelectionState((prev) => {
      let idx = prev.airports.findIndex((v) => v.id === airport.id);
      if (idx === -1) {
        return {
          airports: [...prev.airports,  airport],
          tailShowConnections: true,
        };
      }

      if (prev.tailShowConnections) {
        return { ...prev, tailShowConnections: false };
      }

      return {
        airports: prev.airports.toSpliced(idx, prev.airports.length - idx),
        tailShowConnections: true,
      };
    });
  }, []);

  const markersAndLines = useMemo(() => {
    if (selectedAirports.length > 0) {
      return buildAirportMarkersAndLines(selectedAirports, onAirportClick, true, tailShowConnections);
    }

    return buildAirportMarkersAndLines(airports, onAirportClick, false, false);
  }, [airports, selectedAirports, tailShowConnections, onAirportClick]);

  const breadcrumbItems = useMemo(
    () => buildBreadcrumbItems(selectedAirports),
    [selectedAirports]
  );

  return (
    <ContentLayout header={<Header variant={'h1'}>Airports</Header>}>
      <Container>
        <ColumnLayout columns={1}>
          <BreadcrumbGroup
            items={breadcrumbItems}
            onClick={(e) => {
              e.preventDefault();
              const index = e.detail.item.index;
              if (index >= 0) {
                setSelectionState((prev) => ({
                  airports: prev.airports.toSpliced(index + 1, prev.airports.length - index - 1),
                  tailShowConnections: true,
                }));
              } else {
                setSelectionState({
                  airports: [],
                  tailShowConnections: false,
                });
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

function AirportMarker({ airport, onClick, step, disabled }: { airport: WithRequired<Airport, 'location'>, onClick: () => void, step?: number, disabled?: boolean }) {
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
      <Button onClick={onClick} variant={step !== undefined ? 'primary' : 'normal'} disabled={disabled}>
        {badge}{airport.iataCode ?? airport.icaoCode ?? airport.name}
      </Button>
    </Marker>
  );
}

function buildAirportMarkersAndLines(airports: ReadonlyArray<Airport>, onAirportClick: (airport: Airport) => void, withConnections: boolean, tailShowConnections: boolean) {
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
        if (tailShowConnections) {
          nodes.push(<AirportNodeWithConnections airport={airport} exclude={airports} onClick={onAirportClick} step={i + 1} />);
        } else {
          nodes.push(<AirportMarker airport={airport} onClick={() => onAirportClick(airport)} step={i + 1} />);
        }
      } else {
        nodes.push(<AirportMarker airport={airport} onClick={() => onAirportClick(airport)} step={i + 1} disabled={true} />);
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

function buildBreadcrumbItems(airports: ReadonlyArray<Airport>) {
  const items: Array<BreadcrumbGroupProps.Item & { airport?: Airport, index: number }> = [];
  items.push({
    text: 'Start',
    href: '#',
    index: -1,
  });

  let previousAirportLocation: [number, number] | null = null;
  let totalDistance = 0;

  for (let i = 0; i < airports.length; i++) {
    const airport = airports[i];
    const location = [airport.location?.lng ?? 0.0, airport.location?.lat ?? 0.0] satisfies [number, number];

    if (previousAirportLocation != null) {
      totalDistance += distance(previousAirportLocation, location, { units: 'miles' });
    }

    let suffix = '';
    if (i > 0 && i >= airports.length - 1) {
      suffix = ` (${totalDistance.toFixed(2)} mi)`;
    }

    items.push({
      text: (airport.iataCode ?? airport.icaoCode ?? airport.id) + suffix,
      href: '#',
      airport: airport,
      index: i,
    });

    previousAirportLocation = location;
  }

  return items;
}