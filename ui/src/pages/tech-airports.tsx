import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useAirports, useDestinationsNoInitial } from '../components/util/state/data';
import {
  Alert,
  Badge,
  Box,
  Button,
  Container,
  ContentLayout,
  Header, Modal, Popover, SpaceBetween, StatusIndicator
} from '@cloudscape-design/components';
import { distance } from '@turf/turf';
import { MaplibreMap, SmartLine } from '../components/maplibre/maplibre-map';
import { Marker } from 'react-map-gl/maplibre';
import { Airport, AirportId } from '../lib/api/api.model';
import { WithRequired } from '@tanstack/react-query';
import { CodeView } from '@cloudscape-design/code-view';
import jsonHighlight from '@cloudscape-design/code-view/highlight/json';

const TECH_AIRPORTS: ReadonlyArray<string> = [
  'TLS',
  'AES',
  'SVG',
  'NAT',
  'SSH',
  'SHA',
  'AMD',
];

export function TechAirports() {
  const { airports, lookupByIata } = useAirports().data;

  const requiredAirports = useMemo<ReadonlyArray<Airport>>(() => {
    return TECH_AIRPORTS.map((iata) => lookupByIata.get(iata)).filter(v => !!v);
  }, [lookupByIata]);

  const [selectedAirports, setSelectedAirports] = useState<ReadonlyArray<Airport>>([]);

  const addAirport = useCallback((airport: Airport) => {
    setSelectedAirports((prev) => [...prev, airport]);
  }, []);

  const removeAirport = useCallback((airport: Airport) => {
    setSelectedAirports((prev) => {
      let idx = prev.findLastIndex((v) => v.id === airport.id);
      if (idx === -1) {
        return prev;
      }

      return prev.toSpliced(idx, prev.length - idx);
    });
  }, []);

  const resetAirports = useCallback(() => {
    setSelectedAirports([]);
  }, []);

  const lastAirportId = selectedAirports.length > 0 ? selectedAirports[selectedAirports.length - 1].id : undefined;
  const rawLastAirportDestinations = useDestinationsNoInitial(lastAirportId).data;
  const lastAirportDestinations = rawLastAirportDestinations ?? [];
  const lastAirportDestinationsPending = !rawLastAirportDestinations;

  const markersAndLines = useMemo(() => {
    if (selectedAirports.length > 0) {
      return (
        <SelectedAirportsMarkers
          airports={selectedAirports}
          tailConnections={lastAirportDestinations}
          addAirport={addAirport}
          removeAirport={removeAirport}
        />
      );
    }

    return (
      <AllAirportsMarkers airports={airports} onAirportClick={addAirport} />
    );
  }, [airports, selectedAirports, lastAirportDestinations, addAirport, removeAirport]);

  const [modalVisible, setModalVisible] = useState(false);
  const [modalState, setModalState] = useState<{ title: string, content: React.ReactNode, }>({ title: '', content: '' });
  useEffect(() => {
    if (lastAirportDestinationsPending) {
      return;
    }

    const distance = totalDistance(selectedAirports);
    const isDone = requiredAirports.length > 0 && (() => {
      for (const airport of requiredAirports) {
        if (selectedAirports.findIndex((v) => v.id === airport.id) === -1) {
          return false;
        }
      }

      return true;
    })();

    const doubleVisits = (() => {
      const seen = new Set<AirportId>();
      let doubleVisits = 0;

      for (const airport of selectedAirports) {
        if (seen.has(airport.id)) {
          doubleVisits++;
        }

        seen.add(airport.id);
      }

      return doubleVisits;
    })();

    const score = distance * Math.exp(doubleVisits * 0.2);

    if (isDone) {
      setModalState({
        title: 'Task complete!',
        content: (
          <Alert type={'success'}>
            <Box>Total Distance: {distance.toFixed(2)} mi</Box>
            <Box>Airports visited: {selectedAirports.length}</Box>
            <Box>Double visits: {doubleVisits}</Box>
            <Box>Score (lower is better): {score.toFixed(0)}</Box>
          </Alert>
        ),
      });
      setModalVisible(true);
    } else if (selectedAirports.length > 0 && lastAirportDestinations.length < 1) {
      setModalState({
        title: 'Game over!',
        content: (
          <Alert type={'error'}>
            <Box>Total Distance: {distance.toFixed(2)} mi</Box>
            <Box>Airports visited: {selectedAirports.length}</Box>
            <Box>Double visits: {doubleVisits}</Box>
          </Alert>
        ),
      });
      setModalVisible(true);
    }
  }, [requiredAirports, selectedAirports, lastAirportDestinations, lastAirportDestinationsPending]);

  return (
    <ContentLayout header={<Header variant={'h1'}>Tech Airports Any%</Header>}>
      <MaplibreMap
        height={'80vh'}
        controls={[
          (
            <Container>
              <Box>{totalDistance(selectedAirports).toFixed(2)} mi</Box>
            </Container>
          ),
          (
            <Container>
              <AirportChecklist requiredAirports={requiredAirports} selectedAirports={selectedAirports} />
            </Container>
          ),
          (
            <Button onClick={resetAirports} disabled={selectedAirports.length < 1}>Reset</Button>
          ),
        ]}
      >
        {markersAndLines}
      </MaplibreMap>
      <Modal
        header={modalState.title}
        visible={modalVisible}
        size={'medium'}
        footer={<Button onClick={() => { resetAirports(); setModalVisible(false); }} disabled={selectedAirports.length < 1}>Reset</Button>}
        onDismiss={() => setModalVisible(false)}
      >
        {modalState.content}
      </Modal>
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
}

function SelectedAirportsMarkers({ airports, tailConnections, addAirport, removeAirport }: SelectedAirportProps & { tailConnections: ReadonlyArray<Airport> }) {
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
              onClick={() => {}}
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
  }, [airports, tailConnections, addAirport, removeAirport]);

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
      {badge}{airport.iataCode}
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

function AirportChecklist({ requiredAirports, selectedAirports }: { requiredAirports: ReadonlyArray<Airport>, selectedAirports: ReadonlyArray<Airport> }) {
  const nodes = useMemo(() => {
    const nodes: Array<React.ReactNode> = [];
    for (const airport of requiredAirports) {
      const visited = selectedAirports.findIndex((v) => v.id === airport.id) !== -1;
      nodes.push(
        <Popover content={<CodeView highlight={jsonHighlight} content={JSON.stringify(airport, null, '\t')} />} dismissButton={false}>
          <StatusIndicator type={visited ? 'success' : 'error'}>{airport.iataCode}</StatusIndicator>
        </Popover>
      );
    }

    return nodes;
  }, [requiredAirports, selectedAirports]);

  return (
    <SpaceBetween size={'m'} direction={'horizontal'}>
      {...nodes}
    </SpaceBetween>
  );
}

function totalDistance(airports: ReadonlyArray<Airport>): number {
  let previousAirportLocation: [number, number] | null = null;
  let totalDistance = 0.0;

  for (const airport of airports) {
    const location = [airport.location?.lng ?? 0.0, airport.location?.lat ?? 0.0] satisfies [number, number];
    if (previousAirportLocation != null) {
      totalDistance += distance(previousAirportLocation, location, { units: 'miles' });
    }

    previousAirportLocation = location;
  }

  return totalDistance;
}
