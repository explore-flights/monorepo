import React, { useCallback, useMemo, useState } from 'react';
import { useAirports, useDestinations } from '../components/util/state/data';
import {
  Badge, BreadcrumbGroup,
  BreadcrumbGroupProps,
  Button,
  Container,
  ContentLayout,
  Header, SpaceBetween
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

  const addAirport = useCallback((airport: Airport) => {
    setSelectionState((prev) => ({
      airports: [...prev.airports, airport],
      tailShowConnections: true,
    }));
  }, []);

  const removeAirport = useCallback((airport: Airport) => {
    setSelectionState((prev) => {
      let idx = prev.airports.findLastIndex((v) => v.id === airport.id);
      if (idx === -1) {
        return prev;
      }

      return {
        ...prev,
        airports: prev.airports.toSpliced(idx, prev.airports.length - idx),
      };
    });
  }, []);

  const toggleShowTailConnections = useCallback(() => {
    setSelectionState((prev) => ({
      ...prev,
      tailShowConnections: !prev.tailShowConnections,
    }));
  }, []);

  const markersAndLines = useMemo(() => {
    if (selectedAirports.length > 0) {
      if (tailShowConnections) {
        return (
          <SelectedAirportsMarkersWithTailConnections airports={selectedAirports} addAirport={addAirport} removeAirport={removeAirport} toggleShowConnections={toggleShowTailConnections} />
        );
      } else {
        return (
          <SelectedAirportsMarkersWithoutTailConnections airports={selectedAirports} addAirport={addAirport} removeAirport={removeAirport} toggleShowConnections={toggleShowTailConnections} />
        );
      }
    }

    return (
      <AllAirportsMarkers airports={airports} onAirportClick={addAirport} />
    );
  }, [airports, selectedAirports, tailShowConnections, addAirport, removeAirport, toggleShowTailConnections]);

  const breadcrumbItems = useMemo(
    () => buildBreadcrumbItems(selectedAirports),
    [selectedAirports]
  );

  return (
    <ContentLayout header={<Header variant={'h1'}>Airports</Header>}>
      <Container>
        <MaplibreMap
          height={'80vh'}
          controls={[
            (
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
            )
          ]}
        >
          {markersAndLines}
        </MaplibreMap>
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
      nodes.push(
        <AirportMarker
          airport={airport}
          onClick={() => onAirportClick(airport)}
          onRemoveClick={() => {}}
          indexes={[]}
          connectable={true}
          removable={false}
          disabled={false}
        />
      );
    }

    return nodes;
  },  [airports, onAirportClick]);

  return (
    <>{...nodes}</>
  );
}

interface SelectedAirportProps {
  airports: ReadonlyArray<Airport>;
  addAirport: (airport: Airport) => void;
  removeAirport: (airport: Airport) => void;
  toggleShowConnections: () => void;
}

function SelectedAirportsMarkersWithoutTailConnections(props: SelectedAirportProps) {
  return (
    <SelectedAirportsMarkers {...props} tailConnections={[]} />
  );
}

function SelectedAirportsMarkersWithTailConnections({ airports, ...props }: SelectedAirportProps) {
  const lastAirportDestinations = useDestinations(airports[airports.length - 1].id).data;
  return (
    <SelectedAirportsMarkers {...props} airports={airports} tailConnections={lastAirportDestinations} />
  );
}

function SelectedAirportsMarkers({ airports, tailConnections, addAirport, removeAirport, toggleShowConnections }: SelectedAirportProps & { tailConnections: ReadonlyArray<Airport> }) {
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
    let previousAirportId: AirportId | null = null;
    let previousAirportLocation: [number, number] | null = null;

    for (let i = 0; i < airports.length; i++) {
      const _airport = airports[i];
      if (!_airport.location) {
        continue;
      }

      const airport = { ..._airport, location: _airport.location };
      const indexes = indexesByAirportId.get(airport.id)!;

      // add the marker for the last index only
      if (i === indexes[indexes.length - 1]) {
        const isTail = i >= airports.length - 1;
        const hasTailConnection = tailConnections.findIndex((v) => v.id === airport.id) !== -1;

        if (isTail || !hasTailConnection) {
          nodes.push(
            <AirportMarker
              airport={airport}
              onClick={() => toggleShowConnections()}
              onRemoveClick={() => removeAirport(airport)}
              indexes={indexes}
              connectable={false}
              removable={isTail}
              disabled={!isTail}
            />
          );
        }
      }

      if (previousAirportLocation != null) {
        nodes.push(<SmartLine src={previousAirportLocation} dst={[airport.location.lng, airport.location.lat]} />);
      }

      previousAirportId = airport.id;
      previousAirportLocation = [airport.location.lng, airport.location.lat];
    }

    if (previousAirportLocation != null) {
      for (let i = 0; i < tailConnections.length; i++) {
        const _airport = tailConnections[i];
        if (!_airport.location || _airport.id === previousAirportId) {
          continue;
        }

        const airport = { ..._airport, location: _airport.location };
        const indexes = indexesByAirportId.get(airport.id) ?? [];

        nodes.push(
          <AirportMarker
            airport={airport}
            onClick={() => addAirport(airport)}
            onRemoveClick={() => {}}
            indexes={indexes}
            connectable={true}
            removable={false}
            disabled={false}
          />
        );

        nodes.push(<SmartLine src={previousAirportLocation} dst={[airport.location.lng, airport.location.lat]} dashed={true} />);
      }
    }

    return nodes;
  }, [airports, tailConnections, addAirport, removeAirport, toggleShowConnections]);

  return (
    <>{...nodes}</>
  );
}

function AirportMarker({ airport, onClick, onRemoveClick, indexes, connectable, removable, disabled }: { airport: WithRequired<Airport, 'location'>, onClick: () => void, onRemoveClick: () => void, indexes: ReadonlyArray<number>, connectable: boolean, removable: boolean, disabled: boolean }) {
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

  let content = (
    <Button variant={connectable ? 'normal' : 'primary'} onClick={onClick} disabled={disabled}>
      {badge}{airport.iataCode ?? airport.icaoCode ?? airport.name}
    </Button>
  );

  if (removable) {
    content = (
      <SpaceBetween size={'xs'} direction={'horizontal'}>
        {content}
        <Button variant={'icon'} iconName={'remove'} onClick={onRemoveClick} />
      </SpaceBetween>
    );
  }

  return (
    <Marker longitude={airport.location.lng} latitude={airport.location.lat}>
      {content}
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