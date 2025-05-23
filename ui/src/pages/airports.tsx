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
import { Airport, AirportId } from '../lib/api/api.model';
import { WithRequired } from '@tanstack/react-query';

export function Airports() {
  const airports = useAirports().data.airports;

  const [{ airports: selectedAirports, tailShowConnections }, setSelectionState] = useState<{ airports: ReadonlyArray<Airport>, tailShowConnections: boolean }>({
    airports: [],
    tailShowConnections: false,
  });

  const onAirportClick = useCallback((airport: Airport) => {
    setSelectionState((prev) => {
      let idx = prev.airports.findLastIndex((v) => v.id === airport.id);
      if (idx === -1 || idx < prev.airports.length - 1) {
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
      if (tailShowConnections) {
        return (
          <SelectedAirportsMarkersWithTailConnections airports={selectedAirports} onAirportClick={onAirportClick} />
        );
      } else {
        return (
          <SelectedAirportsMarkersWithoutTailConnections airports={selectedAirports} onAirportClick={onAirportClick} />
        );
      }
    }

    return (
      <AllAirportsMarkers airports={airports} onAirportClick={onAirportClick} />
    );
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
            {markersAndLines}
          </MaplibreMap>
        </ColumnLayout>
      </Container>
    </ContentLayout>
  );
}

function AllAirportsMarkers({ airports, onAirportClick }: { airports: ReadonlyArray<Airport>, onAirportClick: (airport: Airport) => void }) {
  const nodes = useMemo(() => {
    const nodes: Array<React.ReactNode> = [];
    for (let i = 0; i < airports.length; i++) {
      const _airport = airports[i];
      if (!_airport.location) {
        continue;
      }

      const airport = { ..._airport, location: _airport.location };
      nodes.push(<AirportMarker airport={airport} onClick={() => onAirportClick(airport)} indexes={[]} connectable={true} disabled={false} />);
    }

    return nodes;
  },  [airports, onAirportClick]);

  return (
    <>{...nodes}</>
  );
}

function SelectedAirportsMarkersWithoutTailConnections({ airports, onAirportClick }: { airports: ReadonlyArray<Airport>, onAirportClick: (airport: Airport) => void }) {
  return (
    <SelectedAirportsMarkers airports={airports} tailConnections={[]} onAirportClick={onAirportClick} />
  );
}

function SelectedAirportsMarkersWithTailConnections({ airports, onAirportClick }: { airports: ReadonlyArray<Airport>, onAirportClick: (airport: Airport) => void }) {
  const lastAirportDestinations = useDestinations(airports[airports.length - 1].id).data;
  return (
    <SelectedAirportsMarkers airports={airports} tailConnections={lastAirportDestinations} onAirportClick={onAirportClick} />
  );
}

function SelectedAirportsMarkers({ airports, tailConnections, onAirportClick }: { airports: ReadonlyArray<Airport>, tailConnections: ReadonlyArray<Airport>, onAirportClick: (airport: Airport) => void }) {
  const nodes = useMemo(() => {
    const indexesByAirportId: Map<AirportId, Array<number>> = new Map();
    for (let i = 0; i < airports.length; i++) {
      const airportId = airports[i].id;
      let indexes = indexesByAirportId.get(airportId);
      if (!indexes) {
        indexes = [];
        indexesByAirportId.set(airportId, indexes);
      }

      indexes.push(i);
    }

    const nodes: Array<React.ReactNode> = [];
    let previousAirportLocation: [number, number] | null = null;

    for (let i = 0; i < airports.length; i++) {
      const _airport = airports[i];
      if (!_airport.location) {
        continue;
      }

      const airport = { ..._airport, location: _airport.location };
      const indexes = indexesByAirportId.get(airport.id)!;

      if (i === indexes[indexes.length - 1]) {
        const isTail = i >= airports.length - 1;
        const hasTailConnection = tailConnections.findIndex((v) => v.id === airport.id) !== -1;

        nodes.push(<AirportMarker airport={airport} onClick={() => onAirportClick(airport)} indexes={indexes} connectable={hasTailConnection} disabled={!isTail && !hasTailConnection} />);
      }

      if (previousAirportLocation != null) {
        nodes.push(<SmartLine src={previousAirportLocation} dst={[airport.location.lng, airport.location.lat]} />);
      }

      previousAirportLocation = [airport.location.lng, airport.location.lat];
    }

    if (previousAirportLocation != null) {
      for (let i = 0; i < tailConnections.length; i++) {
        const _airport = tailConnections[i];
        if (!_airport.location) {
          continue;
        }

        const airport = { ..._airport, location: _airport.location };

        if (!indexesByAirportId.has(airport.id)) {
          nodes.push(<AirportMarker airport={airport} onClick={() => onAirportClick(airport)} indexes={[]} connectable={true} disabled={false} />);
        }

        nodes.push(<SmartLine src={previousAirportLocation} dst={[airport.location.lng, airport.location.lat]} />);
      }
    }

    return nodes;
  }, [airports, tailConnections, onAirportClick]);

  return (
    <>{...nodes}</>
  );
}

function AirportMarker({ airport, onClick, indexes, connectable, disabled }: { airport: WithRequired<Airport, 'location'>, onClick: () => void, indexes: ReadonlyArray<number>, connectable: boolean, disabled: boolean }) {
  let badge: React.ReactNode | null = null;
  if (indexes.length > 0) {
    const text = indexes.map((v) => v + 1).join(',');
    badge = (
      <>
        <Badge color={'green'}>{text}</Badge>
        &nbsp;
      </>
    );
  }

  return (
    <Marker
      longitude={airport.location.lng}
      latitude={airport.location.lat}
    >
      <Button variant={connectable ? 'normal' : 'primary'} onClick={onClick} disabled={disabled}>
        {badge}{airport.iataCode ?? airport.icaoCode ?? airport.name}
      </Button>
    </Marker>
  );
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