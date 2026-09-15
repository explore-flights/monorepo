import 'maplibre-gl/dist/maplibre-gl.css';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import MapCanvas, {
  FullscreenControl,
  Layer,
  Marker,
  NavigationControl,
  Source,
  type MapRef,
} from 'react-map-gl/maplibre';
import { colorful } from '@versatiles/style';
import { Plane } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { usePreferences } from '@/app/preferences';
import { geometryCoordinates, getMapBounds, mapFitPadding } from '@/components/mapBounds';
import { Button, Card, ErrorState, Loading, PageHeader } from '@/components/primitives';
import { dateTimeLabel } from '@/lib/format';
import { bearing, greatCirclePosition, routeGeometry, type Coordinate } from './geometry';
import { useLiveFlights } from './useLiveFlights';
import { PlaybackControls } from './PlaybackControls';
import styles from './LivePage.module.css';

export function LivePage() {
  const mapRef = useRef<MapRef>(null);
  const query = useLiveFlights();
  const { now } = query;
  const [mapBearing, setMapBearing] = useState(0);
  const [selectedId, setSelectedId] = useState<string>();
  const { canUseMaps, saveConsent, consent, effectiveTheme } = usePreferences();
  const dark = effectiveTheme === 'dark';
  const mapStyle = useMemo(
    () =>
      colorful({
        baseUrl: 'https://tiles.versatiles.org',
        language: 'en',
        recolor: { invertBrightness: dark },
      }),
    [dark],
  );
  const flights = (query.data?.flights ?? [])
    .filter(
      (flight) => Date.parse(flight.departureTime) <= now && Date.parse(flight.arrivalTime) > now,
    )
    .flatMap((flight) => {
      const departureAirport = query.data?.airports[flight.departureAirportId];
      const arrivalAirport = query.data?.airports[flight.arrivalAirportId];
      if (!departureAirport || !arrivalAirport) {
        return [];
      }
      const from: Coordinate = [departureAirport.location.lng, departureAirport.location.lat];
      const to: Coordinate = [arrivalAirport.location.lng, arrivalAirport.location.lat];
      const progress = Math.max(
        0,
        Math.min(
          1,
          (now - Date.parse(flight.departureTime)) /
            (Date.parse(flight.arrivalTime) - Date.parse(flight.departureTime)),
        ),
      );
      const position = greatCirclePosition(from, to, progress);
      const heading = bearing(
        position,
        greatCirclePosition(from, to, Math.min(1, progress + 0.0001)),
      );
      return [
        {
          ...flight,
          departureAirport,
          arrivalAirport,
          from,
          to,
          progress,
          position,
          heading,
          label: `${flight.flightNumber.airlineId}${flight.flightNumber.number}${flight.flightNumber.suffix ?? ''}`,
        },
      ];
    });
  const selected = flights.find((flight) => flight.id === selectedId);
  function fitCoordinates(coordinates: Coordinate[]) {
    const bounds = getMapBounds(coordinates);
    if (!bounds) {
      return;
    }

    mapRef.current?.fitBounds(bounds, { padding: mapFitPadding, duration: 500 });
  }
  function clearSelection() {
    if (!selectedId) {
      return;
    }

    setSelectedId(undefined);
    fitCoordinates(flights.map((flight) => flight.position));
  }
  const route = {
    type: 'FeatureCollection' as const,
    features: selected
      ? [
          {
            type: 'Feature' as const,
            properties: { flown: true },
            geometry: routeGeometry(selected.from, selected.to, 0, selected.progress),
          },
          {
            type: 'Feature' as const,
            properties: { flown: false },
            geometry: routeGeometry(selected.from, selected.to, selected.progress, 1),
          },
        ]
      : [],
  };
  return (
    <div className='page'>
      <PageHeader
        title='Live flights'
        description='Estimated flights in the air based on published schedules. This is not live aircraft tracking.'
      />
      {query.isPending && <Loading label='Loading flights in the air…' />}
      {query.error && <ErrorState error={query.error} />}
      {query.data && !query.error && flights.length === 0 && (
        <p role='status'>No flights are scheduled to be in the air at this time.</p>
      )}
      {!canUseMaps ? (
        <Card className={styles.consent}>
          <Plane />
          <h2>Enable the interactive map</h2>
          <p>Map tiles are fetched from VersaTiles. Enable map consent to use this view.</p>
          <Button onClick={() => saveConsent(new Set([...consent, 5]))}>Enable map</Button>
        </Card>
      ) : (
        <div className={styles.map} data-map-theme={effectiveTheme}>
          <MapCanvas
            ref={mapRef}
            key={effectiveTheme}
            initialViewState={{ longitude: 8, latitude: 35, zoom: 1.5 }}
            mapStyle={mapStyle}
            workerUrl={workerUrl}
            onLoad={() => setMapBearing(0)}
            onRotate={(event) => setMapBearing(event.viewState.bearing)}
            onClick={clearSelection}
          >
            <NavigationControl position='top-right' />
            <FullscreenControl position='top-right' />
            <div className={styles.mapControls} onClick={(event) => event.stopPropagation()}>
              <PlaybackControls
                now={now}
                speed={query.speed}
                seek={(time) => {
                  clearSelection();
                  query.seek(time);
                }}
                setSpeed={query.setSpeed}
                goLive={() => {
                  clearSelection();
                  query.goLive();
                }}
                flightCount={flights.length}
              />
            </div>
            <Source id='live-route' type='geojson' data={route}>
              <Layer
                id='live-flown'
                type='line'
                filter={['==', ['get', 'flown'], true]}
                paint={{ 'line-color': dark ? '#a8c5ff' : '#1457e6', 'line-width': 3 }}
              />
              <Layer
                id='live-remaining'
                type='line'
                filter={['==', ['get', 'flown'], false]}
                layout={{ 'line-cap': 'round' }}
                paint={{
                  'line-color': dark ? '#a8c5ff' : '#1457e6',
                  'line-width': 3,
                  'line-dasharray': [0.2, 2],
                }}
              />
            </Source>
            {(selected ? [selected] : flights).map((flight) => (
              <Marker
                key={flight.id}
                longitude={flight.position[0]}
                latitude={flight.position[1]}
                anchor='left'
                offset={[-14, 0]}
                style={{ zIndex: selectedId === flight.id ? 1 : 0 }}
              >
                <button
                  type='button'
                  className={styles.aircraft}
                  aria-pressed={selectedId === flight.id}
                  aria-label={`${flight.label}, ${flight.departureAirport.iataCode} to ${flight.arrivalAirport.iataCode}. ${selectedId === flight.id ? 'Hide' : 'Show'} route`}
                  onClick={(event) => {
                    event.stopPropagation();
                    if (selectedId === flight.id) {
                      clearSelection();
                      return;
                    }

                    setSelectedId(flight.id);
                    fitCoordinates(
                      geometryCoordinates(routeGeometry(flight.from, flight.to, 0, 1).coordinates),
                    );
                  }}
                >
                  <Plane
                    size={18}
                    fill='currentColor'
                    style={{ transform: `rotate(${flight.heading - mapBearing - 45}deg)` }}
                  />
                  <span>
                    <strong>{flight.label}</strong>
                    <span>
                      {flight.departureAirport.iataCode} → {flight.arrivalAirport.iataCode}
                    </span>
                  </span>
                </button>
              </Marker>
            ))}
          </MapCanvas>
        </div>
      )}
      <div className={styles.details} aria-live='polite'>
        {selected ? (
          <>
            <div>
              <Link to={`/flight/${selected.label}`}>{selected.label}</Link> ·{' '}
              {selected.departureAirport.name} → {selected.arrivalAirport.name}
            </div>
            <div>
              Departure {dateTimeLabel(selected.departureTime)} · Arrival{' '}
              {dateTimeLabel(selected.arrivalTime)}
            </div>
            <div className={styles.legend}>
              <span>
                <i />
                Flown
              </span>
              <span>
                <i className={styles.dotted} />
                Remaining
              </span>
              <Button onClick={clearSelection}>Hide route</Button>
            </div>
          </>
        ) : (
          <p>
            Select an aircraft to see its route. Solid shows the estimated portion flown; dotted
            shows the remaining portion.
          </p>
        )}
      </div>
    </div>
  );
}
