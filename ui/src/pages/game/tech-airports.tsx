import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useAirports, useDestinationsNoInitial } from '../../components/util/state/data';
import {
  Alert,
  Badge,
  Box,
  Button, ColumnLayout,
  Container,
  ContentLayout,
  Header, Modal, Popover, SpaceBetween, StatusIndicator, Toggle
} from '@cloudscape-design/components';
import { distance } from '@turf/turf';
import { MaplibreMap, SmartLine } from '../../components/maplibre/maplibre-map';
import { Airport, AirportId } from '../../lib/api/api.model';
import { CodeView } from '@cloudscape-design/code-view';
import jsonHighlight from '@cloudscape-design/code-view/highlight/json';
import { AirportMarker } from '../../components/maplibre/marker';

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

  const [selectedDestinations, setSelectedDestinations] = useState<ReadonlyArray<Airport>>([]);

  const addDestination = useCallback((destination: Airport) => {
    setSelectedDestinations((prev) => [...prev, destination]);
  }, []);

  const removeDestination = useCallback((destination: Airport) => {
    setSelectedDestinations((prev) => {
      const idx = prev.findLastIndex((v) => v.id === destination.id);
      if (idx === -1) {
        return prev;
      }

      return prev.toSpliced(idx, prev.length - idx);
    });
  }, []);

  const resetDestinations = useCallback(() => {
    setSelectedDestinations([]);
  }, []);

  const lastAirportId = selectedDestinations.length > 0 ? selectedDestinations[selectedDestinations.length - 1].id : undefined;
  const rawLastAirportDestinations = useDestinationsNoInitial(lastAirportId).data;
  const lastAirportDestinations = rawLastAirportDestinations ?? [];
  const lastAirportDestinationsPending = !rawLastAirportDestinations;

  const [modalVisible, setModalVisible] = useState(false);
  const [modalState, setModalState] = useState<{ title: string, content: React.ReactNode, }>({ title: '', content: '' });
  useEffect(() => {
    if (lastAirportDestinationsPending) {
      return;
    }

    const distance = totalDistance(selectedDestinations);
    const isDone = requiredAirports.length > 0 && (() => {
      for (const airport of requiredAirports) {
        if (selectedDestinations.findIndex((v) => v.id === airport.id) === -1) {
          return false;
        }
      }

      return true;
    })();

    const doubleVisits = (() => {
      const seen = new Set<AirportId>();
      let doubleVisits = 0;

      for (const dest of selectedDestinations) {
        if (seen.has(dest.id)) {
          doubleVisits++;
        }

        seen.add(dest.id);
      }

      return doubleVisits;
    })();

    if (isDone) {
      setModalState({
        title: 'Task complete!',
        content: (
          <SuccessDisplay distance={distance} totalAirports={selectedDestinations.length} doubleVisits={doubleVisits} />
        ),
      });
      setModalVisible(true);
    } else if (selectedDestinations.length > 0 && lastAirportDestinations.length < 1) {
      setModalState({
        title: 'Game over!',
        content: (
          <Alert type={'error'}>
            <Box>Total Distance: {distance.toFixed(2)} mi</Box>
            <Box>Airports visited: {selectedDestinations.length}</Box>
            <Box>Double visits: {doubleVisits}</Box>
          </Alert>
        ),
      });
      setModalVisible(true);
    }
  }, [requiredAirports, selectedDestinations, lastAirportDestinations, lastAirportDestinationsPending]);

  return (
    <ContentLayout header={<Header variant={'h1'}>Tech Airports Any%</Header>}>
      <MaplibreMap
        height={'80vh'}
        controls={[
          (
            <Container>
              <TotalDistance selectedDestinations={selectedDestinations} />
            </Container>
          ),
          (
            <Container>
              <AirportChecklist requiredAirports={requiredAirports} selectedDestinations={selectedDestinations} />
            </Container>
          ),
          (
            <Button onClick={resetDestinations} disabled={selectedDestinations.length < 1}>Reset</Button>
          ),
        ]}
      >
        {
          selectedDestinations.length > 0
            ? (
              <SelectedAirportsMarkers
                destinations={selectedDestinations}
                tailConnections={lastAirportDestinations}
                addDestination={addDestination}
                removeDestination={removeDestination}
              />
            )
            : <AllAirportsMarkers airports={airports} onAirportClick={addDestination} />
        }
      </MaplibreMap>

      <Modal
        header={modalState.title}
        visible={modalVisible}
        size={'medium'}
        footer={<Button onClick={() => { resetDestinations(); setModalVisible(false); }} disabled={selectedDestinations.length < 1}>Reset</Button>}
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
        <InternalAirportMarker
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
  destinations: ReadonlyArray<Airport>;
  addDestination: (destination: Airport) => void;
  removeDestination: (destination: Airport) => void;
}

function SelectedAirportsMarkers({ destinations, tailConnections, addDestination, removeDestination }: SelectedAirportProps & { tailConnections: ReadonlyArray<Airport> }) {
  const nodes = useMemo(() => {
    const indexesByAirportId: Map<AirportId, Array<number>> = new Map();
    for (let i = 0; i < destinations.length; i++) {
      const airportId = destinations[i].id;
      let indexes = indexesByAirportId.get(airportId);
      if (!indexes) {
        indexes = [];
        indexesByAirportId.set(airportId, indexes);
      }

      indexes.push(i);
    }

    const nodes: Array<React.ReactNode> = [];
    let previousAirportLocation: [number, number] | null = null;

    for (let i = 0; i < destinations.length; i++) {
      const airport = destinations[i];
      const indexes = indexesByAirportId.get(airport.id)!;

      // add the marker for the last index only
      if (i === indexes[indexes.length - 1]) {
        const isTail = i >= destinations.length - 1;
        const hasTailConnection = tailConnections.findIndex((v) => v.id === airport.id) !== -1;

        if (isTail || !hasTailConnection) {
          nodes.push(
            <InternalAirportMarker
              airport={airport}
              onClick={() => {}}
              onRemoveClick={() => removeDestination(airport)}
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

      previousAirportLocation = [airport.location.lng, airport.location.lat];
    }

    if (previousAirportLocation != null) {
      for (let i = 0; i < tailConnections.length; i++) {
        const airport = tailConnections[i];
        const indexes = indexesByAirportId.get(airport.id) ?? [];

        nodes.push(
          <InternalAirportMarker
            airport={airport}
            onClick={() => addDestination(airport)}
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
  }, [destinations, tailConnections, addDestination, removeDestination]);

  return (
    <>{...nodes}</>
  );
}

function InternalAirportMarker({ airport, onClick, onRemoveClick, indexes, connectable, removable, disabled }: { airport: Airport, onClick: () => void, onRemoveClick: () => void, indexes: ReadonlyArray<number>, connectable: boolean, removable: boolean, disabled: boolean }) {
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
    <AirportMarker airport={airport}>
      {content}
    </AirportMarker>
  );
}

function SuccessDisplay({ distance, totalAirports, doubleVisits }: { distance: number, totalAirports: number, doubleVisits: number }) {
  const [scoreCalc, setScoreCalc] = useState({
    distance: true,
    totalAirportsPenalty: false,
    doubleVisitPenalty: false,
  });

  const score = useMemo(() => {
    let score = 0.0;
    if (scoreCalc.distance) {
      score += distance;
    }

    if (scoreCalc.totalAirportsPenalty) {
      score *= Math.exp(totalAirports * 0.05);
    }

    if (scoreCalc.doubleVisitPenalty) {
      score *= Math.exp(doubleVisits * 0.2);
    }

    if (score === 0.0) {
      score = Number.MAX_SAFE_INTEGER;
    }

    return score;
  }, [distance, totalAirports, doubleVisits, scoreCalc]);

  return (
    <ColumnLayout columns={1}>
      <ColumnLayout columns={2}>
        <Toggle checked={scoreCalc.distance} onChange={(e) => setScoreCalc((prev) => ({ ...prev, distance: e.detail.checked }))}>Distance</Toggle>
        <Toggle checked={scoreCalc.totalAirportsPenalty} onChange={(e) => setScoreCalc((prev) => ({ ...prev, totalAirportsPenalty: e.detail.checked }))}>Total Airports Penalty</Toggle>
        <Toggle checked={scoreCalc.doubleVisitPenalty} onChange={(e) => setScoreCalc((prev) => ({ ...prev, doubleVisitPenalty: e.detail.checked }))}>Double Visit Penalty</Toggle>
      </ColumnLayout>

      <Alert type={'success'}>
        <Box>Total Distance: {distance.toFixed(2)} mi</Box>
        <Box>Airports visited: {totalAirports}</Box>
        <Box>Double visits: {doubleVisits}</Box>
        <Box>Score (lower is better): {score.toFixed(0)}</Box>
      </Alert>
    </ColumnLayout>
  );
}

function TotalDistance({ selectedDestinations }: { selectedDestinations: ReadonlyArray<Airport> }) {
  const distance = totalDistance(selectedDestinations);
  return (
    <Box>{distance.toFixed(2)} mi</Box>
  );
}

function AirportChecklist({ requiredAirports, selectedDestinations }: { requiredAirports: ReadonlyArray<Airport>, selectedDestinations: ReadonlyArray<Airport> }) {
  const nodes = useMemo(() => {
    const nodes: Array<React.ReactNode> = [];
    for (const airport of requiredAirports) {
      const visited = selectedDestinations.findIndex((v) => v.id === airport.id) !== -1;
      nodes.push(
        <Popover content={<CodeView highlight={jsonHighlight} content={JSON.stringify(airport, null, '\t')} />} dismissButton={false}>
          <StatusIndicator type={visited ? 'success' : 'error'}>{airport.iataCode}</StatusIndicator>
        </Popover>
      );
    }

    return nodes;
  }, [requiredAirports, selectedDestinations]);

  return (
    <SpaceBetween size={'m'} direction={'horizontal'}>
      {...nodes}
    </SpaceBetween>
  );
}

function totalDistance(destinations: ReadonlyArray<Airport>): number {
  let previousAirportLocation: [number, number] | null = null;
  let totalDistance = 0.0;

  for (const dest of destinations) {
    const location = [dest.location.lng, dest.location.lat] satisfies [number, number];
    if (previousAirportLocation != null) {
      totalDistance += distance(previousAirportLocation, location, { units: 'miles' });
    }

    previousAirportLocation = location;
  }

  return totalDistance;
}
