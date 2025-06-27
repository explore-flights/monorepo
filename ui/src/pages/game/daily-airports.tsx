import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  useAirports,
  useConnectionGameChallenge,
  useDestinationsNoInitial,
} from '../../components/util/state/data';
import {
  Alert,
  Badge,
  Box,
  Button, ColumnLayout,
  Container,
  ContentLayout,
  Header, Modal, Popover, SpaceBetween, Spinner, Toggle
} from '@cloudscape-design/components';
import { distance } from '@turf/turf';
import { MaplibreMap, SmartLine } from '../../components/maplibre/maplibre-map';
import { Marker } from 'react-map-gl/maplibre';
import { Airport, AirportId, DestinationReport } from '../../lib/api/api.model';
import { WithRequired } from '@tanstack/react-query';
import { CodeView } from '@cloudscape-design/code-view';
import jsonHighlight from '@cloudscape-design/code-view/highlight/json';
import { Duration } from 'luxon';

export function DailyAirports() {
  const { lookupById } = useAirports().data;
  const [offset, setOffset] = useState(0);
  const connectionGameChallengeQuery = useConnectionGameChallenge(offset);
  const challenge = useMemo<[Airport, Airport, string, number] | null>(() => {
    if (connectionGameChallengeQuery.isLoading || !connectionGameChallengeQuery.data) {
      return null;
    }

    const { departureAirportId, arrivalAirportId, seed, offset } = connectionGameChallengeQuery.data;
    const departureAirport = lookupById.get(departureAirportId);
    const arrivalAirport = lookupById.get(arrivalAirportId);

    if (!departureAirport || !arrivalAirport) {
      return null;
    }

    return [departureAirport, arrivalAirport, seed, offset] as const;
  }, [lookupById, connectionGameChallengeQuery.data, connectionGameChallengeQuery.isLoading]);

  const loadNext = useCallback(() => {
    setOffset((prev) => prev + 1);
  }, []);

  return (
    <ContentLayout header={<Header variant={'h1'}>Daily Airports</Header>}>
      {
        challenge
          ? <DailyAirportsGame seed={challenge[2]} offset={challenge[3]} departureAirport={challenge[0]} arrivalAirport={challenge[1]} loadNext={loadNext} />
          : <Spinner size={'large'} />
      }
    </ContentLayout>
  );
}

function DailyAirportsGame({ seed, offset, departureAirport, arrivalAirport, loadNext }: { seed: string, offset: number, departureAirport: Airport, arrivalAirport: Airport, loadNext: () => void }) {
  const firstDestinationReport = useMemo<DestinationReport>(() => ({
    airport: departureAirport,
    minDurationSeconds: 0,
  }), [departureAirport]);

  const [selectedDestinations, setSelectedDestinations] = useState<ReadonlyArray<DestinationReport>>([firstDestinationReport]);

  const addDestination = useCallback((destination: DestinationReport) => {
    setSelectedDestinations((prev) => [...prev, destination]);
  }, []);

  const removeDestination = useCallback((destination: DestinationReport) => {
    setSelectedDestinations((prev) => {
      let idx = prev.findLastIndex((v) => v.airport.id === destination.airport.id);
      if (idx === -1 || idx === 0) {
        return prev;
      }

      return prev.toSpliced(idx, prev.length - idx);
    });
  }, []);

  const resetDestinations = useCallback(() => {
    setSelectedDestinations([firstDestinationReport]);
  }, [firstDestinationReport]);

  const lastAirportId = selectedDestinations[selectedDestinations.length - 1].airport.id;
  const lastAirportDestinationsQuery = useDestinationsNoInitial(lastAirportId);
  const lastAirportDestinations = lastAirportDestinationsQuery.data ?? [];
  const lastAirportDestinationsLoading = lastAirportDestinationsQuery.isLoading;

  const [modalVisible, setModalVisible] = useState(false);
  const [modalState, setModalState] = useState<{ title: string, content: React.ReactNode, showNext: boolean }>({ title: '', content: '', showNext: false });
  useEffect(() => {
    if (lastAirportDestinationsLoading) {
      return;
    }

    const [distance, duration] = totalDistanceAndDuration(selectedDestinations);
    const isDone = selectedDestinations.findIndex((v) => v.airport.id === arrivalAirport.id) !== -1;

    const doubleVisits = (() => {
      const seen = new Set<AirportId>();
      let doubleVisits = 0;

      for (const dest of selectedDestinations) {
        if (seen.has(dest.airport.id)) {
          doubleVisits++;
        }

        seen.add(dest.airport.id);
      }

      return doubleVisits;
    })();

    if (isDone) {
      setModalState({
        title: 'Task complete!',
        content: (
          <SuccessDisplay
            distance={distance}
            duration={duration}
            totalAirports={selectedDestinations.length}
            doubleVisits={doubleVisits}
            seed={seed}
            offset={offset}
          />
        ),
        showNext: true,
      });
      setModalVisible(true);
    } else if (selectedDestinations.length > 1 && lastAirportDestinations.length < 1) {
      setModalState({
        title: 'Game over!',
        content: (
          <Alert type={'error'}>
            <Box>GameID: {seed}/{offset}</Box>
            <Box>Total Distance: {distance.toFixed(2)} mi</Box>
            <Box>Total Duration: {duration.rescale().toHuman({ listStyle: 'narrow', unitDisplay: 'narrow' })}</Box>
            <Box>Airports visited: {selectedDestinations.length}</Box>
            <Box>Double visits: {doubleVisits}</Box>
          </Alert>
        ),
        showNext: false,
      });
      setModalVisible(true);
    }
  }, [seed, offset, arrivalAirport, selectedDestinations, lastAirportDestinations, lastAirportDestinationsLoading]);

  return (
    <>
      <MaplibreMap
        height={'80vh'}
        initialLat={departureAirport.location?.lat ?? 0.0}
        initialLng={departureAirport.location?.lng ?? 0.0}
        controls={[
          (
            <Container>
              <TotalDistance selectedDestinations={selectedDestinations} />
            </Container>
          ),
          (
            <Container>
              <ArrivalAirport arrivalAirport={arrivalAirport} />
            </Container>
          ),
          (
            <Button onClick={resetDestinations} disabled={selectedDestinations.length < 2}>Reset</Button>
          ),
        ]}
      >
        <SelectedAirportsMarkers
          destinations={selectedDestinations}
          tailConnections={lastAirportDestinations}
          addDestination={addDestination}
          removeDestination={removeDestination}
        />
      </MaplibreMap>

      <Modal
        header={modalState.title}
        visible={modalVisible}
        size={'medium'}
        footer={
          <Box float={'right'}>
            <SpaceBetween size={'xs'} direction={'horizontal'}>
              <Button onClick={() => { resetDestinations(); setModalVisible(false); }} disabled={selectedDestinations.length < 1}>Reset</Button>
              <Button variant={'primary'} onClick={() => { loadNext(); setModalVisible(false); }} disabled={!modalState.showNext}>Next Game</Button>
            </SpaceBetween>
          </Box>
        }
        onDismiss={() => setModalVisible(false)}
      >
        {modalState.content}
      </Modal>
    </>
  );
}

interface SelectedAirportProps {
  destinations: ReadonlyArray<DestinationReport>;
  addDestination: (destination: DestinationReport) => void;
  removeDestination: (destination: DestinationReport) => void;
}

function SelectedAirportsMarkers({ destinations, tailConnections, addDestination, removeDestination }: SelectedAirportProps & { tailConnections: ReadonlyArray<DestinationReport> }) {
  const nodes = useMemo(() => {
    const indexesByAirportId: Map<AirportId, Array<number>> = new Map();
    for (let i = 0; i < destinations.length; i++) {
      const airportId = destinations[i].airport.id;
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

    for (let i = 0; i < destinations.length; i++) {
      const destination = destinations[i];
      const _airport = destination.airport;
      if (!_airport.location) {
        continue;
      }

      const airport = { ..._airport, location: _airport.location };
      const indexes = indexesByAirportId.get(airport.id)!;

      // add the marker for the last index only
      if (i === indexes[indexes.length - 1]) {
        const isTail = i >= destinations.length - 1;
        const hasTailConnection = tailConnections.findIndex((v) => v.airport.id === airport.id) !== -1;

        if (isTail || !hasTailConnection) {
          nodes.push(
            <AirportMarker
              airport={airport}
              onClick={() => {}}
              onRemoveClick={() => removeDestination(destination)}
              indexes={indexes}
              connectable={false}
              removable={i > 0 && isTail}
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
        const destination = tailConnections[i];
        const _airport = destination.airport;
        if (!_airport.location || _airport.id === previousAirportId) {
          continue;
        }

        const airport = { ..._airport, location: _airport.location };
        const indexes = indexesByAirportId.get(airport.id) ?? [];

        nodes.push(
          <AirportMarker
            airport={airport}
            onClick={() => addDestination(destination)}
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

function SuccessDisplay({ distance, duration, totalAirports, doubleVisits, seed, offset }: { distance: number, duration: Duration<true>, totalAirports: number, doubleVisits: number, seed: string, offset: number }) {
  const [scoreCalc, setScoreCalc] = useState({
    distance: true,
    duration: false,
    totalAirportsPenalty: false,
    doubleVisitPenalty: false,
  });

  const score = useMemo(() => {
    let score = 0.0;
    if (scoreCalc.distance) {
      score += distance;
    }

    if (scoreCalc.duration) {
      score += duration.toMillis() / 10000;
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
  }, [distance, duration, totalAirports, doubleVisits, scoreCalc]);

  return (
    <ColumnLayout columns={1}>
      <ColumnLayout columns={2}>
        <Toggle checked={scoreCalc.distance} onChange={(e) => setScoreCalc((prev) => ({ ...prev, distance: e.detail.checked }))}>Distance</Toggle>
        <Toggle checked={scoreCalc.duration} onChange={(e) => setScoreCalc((prev) => ({ ...prev, duration: e.detail.checked }))}>Duration</Toggle>
        <Toggle checked={scoreCalc.totalAirportsPenalty} onChange={(e) => setScoreCalc((prev) => ({ ...prev, totalAirportsPenalty: e.detail.checked }))}>Total Airports Penalty</Toggle>
        <Toggle checked={scoreCalc.doubleVisitPenalty} onChange={(e) => setScoreCalc((prev) => ({ ...prev, doubleVisitPenalty: e.detail.checked }))}>Double Visit Penalty</Toggle>
      </ColumnLayout>

      <Alert type={'success'}>
        <Box>GameID: {seed}/{offset}</Box>
        <Box>Total Distance: {distance.toFixed(2)} mi</Box>
        <Box>Total Duration: {duration.rescale().toHuman({ listStyle: 'narrow', unitDisplay: 'narrow' })}</Box>
        <Box>Airports visited: {totalAirports}</Box>
        <Box>Double visits: {doubleVisits}</Box>
        <Box>Score (lower is better): {score.toFixed(0)}</Box>
      </Alert>
    </ColumnLayout>
  );
}

function TotalDistance({ selectedDestinations }: { selectedDestinations: ReadonlyArray<DestinationReport> }) {
  const [distance, duration] = totalDistanceAndDuration(selectedDestinations);
  return (
    <Box>{distance.toFixed(2)} mi / {duration.rescale().toHuman({ listStyle: 'narrow', unitDisplay: 'narrow' })}</Box>
  );
}

function ArrivalAirport({ arrivalAirport }: { arrivalAirport: Airport }) {
  return (
    <SpaceBetween size={'xxs'} direction={'horizontal'}>
      <Box>Find a connection to:</Box>
      <Popover content={<CodeView highlight={jsonHighlight} content={JSON.stringify(arrivalAirport, null, '\t')} />} dismissButton={false}>
        <Box variant={'samp'}>{arrivalAirport.iataCode}</Box>
      </Popover>
    </SpaceBetween>
  );
}

function totalDistanceAndDuration(destinations: ReadonlyArray<DestinationReport>): [number, Duration<true>] {
  let previousAirportLocation: [number, number] | null = null;
  let totalDistance = 0.0;
  let totalDuration = Duration.fromMillis(0);

  for (const dest of destinations) {
    const location = [dest.airport.location?.lng ?? 0.0, dest.airport.location?.lat ?? 0.0] satisfies [number, number];
    if (previousAirportLocation != null) {
      totalDistance += distance(previousAirportLocation, location, { units: 'miles' });
    }

    totalDuration = totalDuration.plus(Duration.fromMillis(dest.minDurationSeconds * 1000));

    previousAirportLocation = location;
  }

  return [totalDistance, totalDuration] as const;
}
