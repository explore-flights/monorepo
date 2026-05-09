import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useAirports, useConnectionGameChallenge, useDestinationsNoInitial } from '../../components/util/state/data';
import {
  Alert,
  Badge,
  Box,
  Button,
  ColumnLayout,
  Container,
  ContentLayout,
  CopyToClipboard,
  Form,
  FormField,
  Header,
  IconProps,
  Input,
  KeyValuePairs,
  Modal,
  Popover,
  Slider,
  SpaceBetween,
  Spinner,
  Toggle
} from '@cloudscape-design/components';
import { distance } from '@turf/turf';
import { MaplibreMap, SmartLine } from '../../components/maplibre/maplibre-map';
import { useMap } from 'react-map-gl/maplibre';
import { Airport, AirportId, isJsonObject, JsonType } from '../../lib/api/api.model';
import { DateTime } from 'luxon';
import { useDependentState } from '../../components/util/state/use-dependent-state';
import { ConsentLevel } from '../../lib/consent.model';
import { useSearchParams } from 'react-router-dom';
import { useBrowserStore } from '../../components/util/context/browser-store';
import { AirportMarker } from '../../components/maplibre/marker';

interface GameParams {
  seed: string;
  minFlights: number;
  maxFlights: number;
}

function gameParamsFromSearch(search: URLSearchParams): Partial<GameParams> {
  const gameParams: Partial<GameParams> = {};

  if (search.has('seed')) {
    gameParams.seed = search.get('seed')!;
  }

  if (search.has('minFlights')) {
    const minFlights = Number.parseInt(search.get('minFlights')!);
    if (!Number.isNaN(minFlights)) {
      gameParams.minFlights = minFlights;
    }
  }

  if (search.has('maxFlights')) {
    const maxFlights = Number.parseInt(search.get('maxFlights')!);
    if (!Number.isNaN(maxFlights)) {
      gameParams.maxFlights = maxFlights;
    }
  }

  return gameParams;
}

function gameParamsFromStorage(todayUTC: string, storage: string | null): Partial<GameParams> {
  const gameParams: Partial<GameParams> = {};
  if (storage) {
    const json = JSON.parse(storage) as JsonType;
    if (isJsonObject(json)) {
      if (typeof json['seed'] === 'string' && json['seed'].startsWith(todayUTC + '/')) {
        gameParams.seed = json['seed'];
      }

      if (typeof json['minFlights'] === 'number') {
        gameParams.minFlights = json['minFlights'];
      }

      if (typeof json['maxFlights'] === 'number') {
        gameParams.maxFlights = json['maxFlights'];
      }
    }
  }

  return gameParams;
}

function useGameParams() {
  const STORAGE_CONSENT = ConsentLevel.FUNCTIONALITY;
  const STORAGE_KEY = 'DailyAirports';
  const todayUTC = useMemo(() => DateTime.now().toUTC().toISODate(), []);
  const defaultGameParams = useMemo(() => ({
    seed: `${todayUTC}/0`,
    minFlights: 5,
    maxFlights: 10,
  } satisfies GameParams), [todayUTC]);

  const [searchParams, setSearchParams] = useSearchParams();
  const store = useBrowserStore();
  const [gameParams, setGameParamsInternal] = useState({
    ...defaultGameParams,
    ...gameParamsFromStorage(todayUTC, store.get(STORAGE_CONSENT, STORAGE_KEY)),
    ...gameParamsFromSearch(searchParams),
  } satisfies GameParams);

  useEffect(() => {
    setSearchParams(new URLSearchParams());
  }, []);

  function setGameParams(params: GameParams) {
    setGameParamsInternal(params);
    store.set(STORAGE_CONSENT, STORAGE_KEY, JSON.stringify(params));
  }

  return [gameParams, setGameParams] as const;
}

export function DailyAirports() {
  const { lookupById } = useAirports().data;

  const [gameParams, setGameParams] = useGameParams();
  const [tempGameParams, setTempGameParams] = useDependentState(gameParams);

  function loadNext() {
    const seed = gameParams.seed;
    const idx = seed.lastIndexOf('/');
    if (idx === -1) {
      setGameParams({
        ...gameParams,
        seed: `${seed}/0`,
      });
      return;
    }

    const seedPrefix = seed.substring(0, idx);
    const offset = Number.parseInt(seed.substring(idx + 1));
    if (Number.isNaN(offset)) {
      setGameParams({
        ...gameParams,
        seed: `${seedPrefix}/0`,
      });
    }

    setGameParams({
      ...gameParams,
      seed: `${seedPrefix}/${offset + 1}`,
    });
  }

  const connectionGameChallengeQuery = useConnectionGameChallenge(gameParams.seed, gameParams.minFlights, Math.max(gameParams.minFlights, gameParams.maxFlights));
  const challenge = useMemo<[Airport, Airport] | null>(() => {
    if (connectionGameChallengeQuery.isLoading || !connectionGameChallengeQuery.data) {
      return null;
    }

    const { departureAirportId, arrivalAirportId } = connectionGameChallengeQuery.data;
    const departureAirport = lookupById.get(departureAirportId);
    const arrivalAirport = lookupById.get(arrivalAirportId);

    if (!departureAirport || !arrivalAirport || !departureAirport.location || !arrivalAirport.location) {
      return null;
    }

    return [{ ...departureAirport, location: departureAirport.location }, { ...arrivalAirport, location: arrivalAirport.location }] as const;
  }, [lookupById, connectionGameChallengeQuery.data, connectionGameChallengeQuery.isLoading]);

  const isLoading = !challenge;
  const isFormChanged = gameParams.seed !== tempGameParams.seed || gameParams.minFlights !== tempGameParams.minFlights || gameParams.maxFlights !== tempGameParams.maxFlights;

  return (
    <ContentLayout header={<Header variant={'h1'}>Daily Airports</Header>}>
      <Container variant={'stacked'}>
        <Form actions={<Button variant={'primary'} disabled={isLoading || !isFormChanged} onClick={() => setGameParams(tempGameParams)}>Load</Button>}>
          <ColumnLayout columns={3}>
            <FormField label={'Seed'}>
              <Input
                type={'text'}
                value={tempGameParams.seed}
                disabled={isLoading}
                onChange={(e) => setTempGameParams((prev) => ({ ...prev, seed: e.detail.value }))}
              />
            </FormField>

            <FormField label={'Min Flights'}>
              <Slider
                min={1}
                max={10}
                value={tempGameParams.minFlights}
                disabled={isLoading}
                onChange={(e) => setTempGameParams((prev) => ({ ...prev, minFlights: e.detail.value }))}
              />
            </FormField>

            <FormField label={'Max Flights'}>
              <Slider
                min={tempGameParams.minFlights}
                max={10}
                value={Math.max(tempGameParams.minFlights, tempGameParams.maxFlights)}
                disabled={isLoading}
                onChange={(e) => setTempGameParams((prev) => ({ ...prev, maxFlights: e.detail.value }))}
              />
            </FormField>
          </ColumnLayout>
        </Form>
      </Container>
      <Container variant={'stacked'}>
        {
          challenge
            ? <DailyAirportsGame gameParams={gameParams} departureAirport={challenge[0]} arrivalAirport={challenge[1]} loadNext={loadNext} />
            : <Spinner size={'large'} />
        }
      </Container>
    </ContentLayout>
  );
}

function DailyAirportsGame({ gameParams, departureAirport, arrivalAirport, loadNext }: { gameParams: GameParams, departureAirport: Airport, arrivalAirport: Airport, loadNext: () => void }) {
  const [selectedDestinations, setSelectedDestinations] = useState<ReadonlyArray<Airport>>([departureAirport]);

  const addDestination = useCallback((destination: Airport) => {
    setSelectedDestinations((prev) => [...prev, destination]);
  }, []);

  const removeDestination = useCallback((destination: Airport) => {
    setSelectedDestinations((prev) => {
      const idx = prev.findLastIndex((v) => v.id === destination.id);
      if (idx === -1 || idx === 0) {
        return prev;
      }

      return prev.toSpliced(idx, prev.length - idx);
    });
  }, []);

  const resetDestinations = useCallback(() => {
    setSelectedDestinations([departureAirport]);
  }, [departureAirport]);

  const lastAirportId = selectedDestinations[selectedDestinations.length - 1].id;
  const lastAirportDestinationsQuery = useDestinationsNoInitial(lastAirportId);
  const lastAirportDestinations = lastAirportDestinationsQuery.data ?? [];
  const lastAirportDestinationsLoading = lastAirportDestinationsQuery.isLoading;

  const [modalVisible, setModalVisible] = useState(false);
  const [modalState, setModalState] = useState<{ title: string, content: React.ReactNode, showNext: boolean }>({ title: '', content: '', showNext: false });
  useEffect(() => {
    if (lastAirportDestinationsLoading) {
      return;
    }

    const distance = totalDistance(selectedDestinations);
    const isDone = selectedDestinations.findIndex((v) => v.id === arrivalAirport.id) !== -1;

    if (isDone) {
      setModalState({
        title: 'Task complete!',
        content: (
          <SuccessDisplay
            selectedDestinations={selectedDestinations}
            distance={distance}
            totalAirports={selectedDestinations.length}
            gameParams={gameParams}
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
            <Box>Seed: {gameParams.seed}</Box>
            <Box>Total Distance: {distance.toFixed(2)} mi</Box>
            <Box>Airports visited: {selectedDestinations.length}</Box>
          </Alert>
        ),
        showNext: false,
      });
      setModalVisible(true);
    }
  }, [gameParams, arrivalAirport, selectedDestinations, lastAirportDestinations, lastAirportDestinationsLoading]);

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
          searchForAirportId={arrivalAirport.id}
          destinations={selectedDestinations}
          tailConnections={lastAirportDestinations}
          addDestination={addDestination}
          removeDestination={removeDestination}
        />

        {
          lastAirportDestinations.findIndex((v) => v.id === arrivalAirport.id) === -1
          && arrivalAirport.location
          && lastAirportId !== arrivalAirport.id
            ? (
              <InternalAirportMarker
                iconName={'search'}
                airport={arrivalAirport}
                onClick={() => {}}
                onRemoveClick={() => {}}
                indexes={[]}
                connectable={false}
                removable={false}
                disabled={true}
              />
            )
            : null
        }
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
  searchForAirportId: AirportId;
  destinations: ReadonlyArray<Airport>;
  addDestination: (destination: Airport) => void;
  removeDestination: (destination: Airport) => void;
}

function SelectedAirportsMarkers({ searchForAirportId, destinations, tailConnections, addDestination, removeDestination }: SelectedAirportProps & { tailConnections: ReadonlyArray<Airport> }) {
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
              removable={i > 0 && isTail}
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
            iconName={airport.id === searchForAirportId ? 'search' : undefined}
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

function InternalAirportMarker({ iconName, airport, onClick, onRemoveClick, indexes, connectable, removable, disabled }: { iconName?: IconProps.Name, airport: Airport, onClick: () => void, onRemoveClick: () => void, indexes: ReadonlyArray<number>, connectable: boolean, removable: boolean, disabled: boolean }) {
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
    <Button iconName={iconName} variant={connectable ? 'normal' : 'primary'} onClick={onClick} disabled={disabled}>
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

function SuccessDisplay({ selectedDestinations, distance, totalAirports, gameParams }: { selectedDestinations: ReadonlyArray<Airport>, distance: number, totalAirports: number, gameParams: GameParams }) {
  const [scoreCalc, setScoreCalc] = useState({
    distance: true,
    totalAirportsPenalty: false,
  });

  const [score, scoreAllSettings] = useMemo(() => {
    let score = 0.0;
    let scoreAllSettings = 0.0;

    if (scoreCalc.distance) {
      score += distance;
    }

    scoreAllSettings += distance;

    if (scoreCalc.totalAirportsPenalty) {
      score *= Math.exp(totalAirports * 0.05);
    }

    scoreAllSettings *= Math.exp(totalAirports * 0.05);

    if (score === 0.0) {
      score = Number.MAX_SAFE_INTEGER;
    }

    return [score, scoreAllSettings] as const;
  }, [distance, totalAirports, scoreCalc]);

  const urlParams = new URLSearchParams();
  urlParams.set('seed', gameParams.seed);
  urlParams.set('minFlights', gameParams.minFlights.toString());
  urlParams.set('maxFlights', gameParams.maxFlights.toString());

  const copyLines = [
    `Distance: \`${distance.toFixed(2)} mi\``,
    `Total Airports: \`${totalAirports}\``,
    `Score (lower is better): ${scoreAllSettings.toFixed(0)}`,
    '',
    'Settings:',
    `Seed: \`${gameParams.seed}\``,
    `Min Flights: \`${gameParams.minFlights}\``,
    `Max Flights: \`${gameParams.maxFlights}\``,
    '',
    `My Route: ||${selectedDestinations.map((v) => v.iataCode).join(' - ')}||`,
    '',
    `Play this game now on https://explore.flights/game/dailyairports?${urlParams}`,
    `or start yourself on https://explore.flights/game/dailyairports`,
  ];

  return (
    <ColumnLayout columns={1}>
      <ColumnLayout columns={3}>
        <Toggle checked={scoreCalc.distance} onChange={(e) => setScoreCalc((prev) => ({ ...prev, distance: e.detail.checked }))}>Distance</Toggle>
        <Toggle checked={scoreCalc.totalAirportsPenalty} onChange={(e) => setScoreCalc((prev) => ({ ...prev, totalAirportsPenalty: e.detail.checked }))}>Total Airports Penalty</Toggle>
      </ColumnLayout>

      <Alert
        type={'success'}
        action={
          <CopyToClipboard
            copyButtonText={'Copy'}
            copySuccessText={'Copied!'}
            copyErrorText={'Failed to copy'}
            textToCopy={copyLines.join('\n')}
          />
        }
      >
        <Box>GameID: {gameParams.seed}</Box>
        <Box>Total Distance: {distance.toFixed(2)} mi</Box>
        <Box>Airports visited: {totalAirports}</Box>
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

function ArrivalAirport({ arrivalAirport }: { arrivalAirport: Airport }) {
  const map = useMap().current;
  function showOnMap() {
    if (!map) {
      return;
    }

    const loc = arrivalAirport.location;
    map.fitBounds([loc.lng, loc.lat, loc.lng, loc.lat], { zoom: 10 });
  }

  return (
    <SpaceBetween size={'xxs'} direction={'horizontal'}>
      <Box>Find a connection to:</Box>
      <Popover
        size={'large'}
        content={
          <ColumnLayout columns={1}>
            <KeyValuePairs
              columns={2}
              items={[
                {
                  label: 'Name',
                  value: arrivalAirport.name ?? '',
                },
                {
                  label: 'Timezone',
                  value: arrivalAirport.timezone ?? '',
                },
                {
                  label: 'IATA',
                  value: arrivalAirport.iataCode,
                },
                {
                  label: 'ICAO',
                  value: arrivalAirport.icaoCode ?? 'no icao code',
                },
                {
                  label: 'Country Code',
                  value: arrivalAirport.countryCode ?? '',
                },
                {
                  label: 'City Code',
                  value: arrivalAirport.cityCode ?? '',
                },
                {
                  label: 'Type',
                  value: arrivalAirport.type ?? '',
                },
              ]}
            />
            <Button onClick={showOnMap}>Show on map</Button>
          </ColumnLayout>
        }
        dismissButton={false}
      >
        <Box variant={'samp'}>{arrivalAirport.iataCode}</Box>
      </Popover>
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
