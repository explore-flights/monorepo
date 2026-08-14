import 'maplibre-gl/dist/maplibre-gl.css';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import MapCanvas, {
  Layer,
  Marker,
  NavigationControl,
  Source,
  type MapRef,
} from 'react-map-gl/maplibre';
import { MapPin } from 'lucide-react';
import { colorful } from '@versatiles/style';
import { greatCircle } from '@turf/great-circle';
import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import type { Airport } from '@/api/types';
import { usePreferences } from '@/app/preferences';
import { classNames } from '@/lib/format';
import { Button, Card } from './primitives';
import styles from './FlightMap.module.css';

interface RouteLine {
  from: Airport;
  to: Airport;
  label?: string;
  frequency?: number;
}
interface AirportMarkerGroup {
  airports: Airport[];
  location: Airport['location'];
}
type Coordinate = [number, number];
type FlightMapStyle = CSSProperties & { '--flight-map-height': string };
const emptyAirports: Airport[] = [];
const airportMarkerGroupRadiusKm = 0.5;

export function FlightMap({
  routes,
  airports = emptyAirports,
  height = 480,
  airportLinks = false,
}: {
  routes: RouteLine[];
  airports?: Airport[];
  height?: number;
  airportLinks?: boolean;
}) {
  const mapRef = useRef<MapRef>(null);
  const { canUseMaps, saveConsent, consent, effectiveTheme } = usePreferences();
  const [selectedAirportId, setSelectedAirportId] = useState<string>();
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
  const displayedAirports = useMemo(
    () => uniqueAirports([...airports, ...routes.flatMap((route) => [route.from, route.to])]),
    [airports, routes],
  );
  const airportMarkerGroups = useMemo(
    () => groupNearbyAirports(displayedAirports),
    [displayedAirports],
  );
  const activeAirportId = displayedAirports.some((airport) => airport.id === selectedAirportId)
    ? selectedAirportId
    : undefined;
  const visibleRoutes = useMemo(() => {
    if (!activeAirportId) {
      return routes;
    }

    return routes.filter(
      (route) => route.from.id === activeAirportId || route.to.id === activeAirportId,
    );
  }, [activeAirportId, routes]);
  const maxFrequency = Math.max(...routes.map((route) => route.frequency ?? 0), 1);
  const features = useMemo(
    () =>
      [...visibleRoutes]
        .sort((left, right) => (left.frequency ?? 0) - (right.frequency ?? 0))
        .map((route) =>
          greatCircle(
            [route.from.location.lng, route.from.location.lat],
            [route.to.location.lng, route.to.location.lat],
            {
              properties: {
                label: route.label,
                frequencyLabel: route.frequency ? `${route.frequency} flights` : '',
                frequencyWeight: (route.frequency ?? 0) / maxFrequency,
              },
            },
          ),
        ),
    [maxFrequency, visibleRoutes],
  );
  const bounds = useMemo(
    () =>
      getBounds([
        ...airports.map((airport): Coordinate => [airport.location.lng, airport.location.lat]),
        ...features.flatMap((feature) => geometryCoordinates(feature.geometry.coordinates)),
      ]),
    [airports, features],
  );
  useEffect(() => {
    if (!bounds) {
      return;
    }

    mapRef.current?.fitBounds(bounds, { padding: 70, duration: 500 });
  }, [bounds]);
  if (!canUseMaps) {
    return (
      <Card className={styles.consent} style={{ minHeight: height }}>
        <div className={styles.consentIcon}>
          <MapPin />
        </div>
        <h3>Enable the interactive map</h3>
        <p>Map tiles are fetched from VersaTiles. Enable map consent to use this view.</p>
        <Button onClick={() => saveConsent(new Set([...consent, 5]))}>Enable map</Button>
      </Card>
    );
  }
  const geojson = { type: 'FeatureCollection' as const, features };
  const mapContainerStyle: FlightMapStyle = { '--flight-map-height': `${height}px` };
  return (
    <div className={styles.wrap} data-map-theme={effectiveTheme} style={mapContainerStyle}>
      <MapCanvas
        ref={mapRef}
        key={effectiveTheme}
        initialViewState={
          bounds
            ? { bounds, fitBoundsOptions: { padding: 70 } }
            : { longitude: 8, latitude: 35, zoom: 1.5 }
        }
        mapStyle={mapStyle}
        workerUrl={workerUrl}
      >
        <NavigationControl position='top-right' />
        <Source id='routes' type='geojson' data={geojson}>
          <Layer
            id='route-shadow'
            type='line'
            paint={{
              'line-color': dark ? '#000000' : '#0b1019',
              'line-width': 5,
              'line-opacity': dark ? 0.35 : 0.16,
            }}
          />
          <Layer
            id='route-lines'
            type='line'
            paint={{
              'line-color': [
                'interpolate',
                ['linear'],
                ['get', 'frequencyWeight'],
                0,
                dark ? '#53627a' : '#a9b9d6',
                0.5,
                dark ? '#7899d6' : '#668ee8',
                1,
                dark ? '#a8c5ff' : '#1457e6',
              ],
              'line-width': 2.5,
              'line-opacity': 0.95,
            }}
          />
          <Layer
            id='route-frequency-labels'
            type='symbol'
            filter={['!=', ['get', 'frequencyLabel'], '']}
            layout={{
              'symbol-placement': 'line-center',
              'text-field': ['get', 'frequencyLabel'],
              'text-font': ['noto_sans_bold'],
              'text-size': 12,
              'text-allow-overlap': false,
              'text-ignore-placement': false,
              'text-keep-upright': true,
              'text-letter-spacing': 0.02,
            }}
            paint={{
              'text-color': dark ? '#edf3ff' : '#122044',
              'text-halo-color': dark ? '#111824' : '#ffffff',
              'text-halo-width': 2,
              'text-halo-blur': 1,
            }}
          />
        </Source>
        {airportMarkerGroups.map((group) => {
          const groupSelected = group.airports.some((airport) => airport.id === activeAirportId);
          return (
            <Marker
              key={group.airports.map((airport) => airport.id).join(':')}
              longitude={group.location.lng}
              latitude={group.location.lat}
              anchor='bottom'
            >
              <div
                className={classNames(
                  styles.markerGroup,
                  groupSelected && styles.active,
                  activeAirportId && !groupSelected && styles.muted,
                )}
              >
                {group.airports.map((airport) => {
                  const selected = airport.id === activeAirportId;
                  const markerClassName = classNames(styles.marker, selected && styles.active);
                  const markerContent = (
                    <>
                      <MapPin size={18} />
                      <span>{airport.iataCode}</span>
                    </>
                  );
                  if (airportLinks) {
                    return (
                      <Link
                        key={airport.id}
                        className={markerClassName}
                        to={`/airport/${airport.id}`}
                        title={`View ${airport.iataCode} — ${airport.name}`}
                        aria-label={`View ${airport.iataCode} — ${airport.name}`}
                        onClick={(event) => event.stopPropagation()}
                      >
                        {markerContent}
                      </Link>
                    );
                  }
                  return (
                    <button
                      key={airport.id}
                      type='button'
                      className={markerClassName}
                      title={
                        selected
                          ? 'Show all routes'
                          : `Show routes for ${airport.iataCode} — ${airport.name}`
                      }
                      aria-label={
                        selected
                          ? `Show all routes; ${airport.iataCode} is selected`
                          : `Show routes for ${airport.iataCode} — ${airport.name}`
                      }
                      aria-pressed={selected}
                      onClick={(event) => {
                        event.stopPropagation();
                        setSelectedAirportId(selected ? undefined : airport.id);
                      }}
                    >
                      {markerContent}
                    </button>
                  );
                })}
              </div>
            </Marker>
          );
        })}
      </MapCanvas>
    </div>
  );
}

function uniqueAirports(airports: Airport[]) {
  return [...new Map(airports.map((a) => [a.id, a])).values()];
}

function groupNearbyAirports(airports: Airport[]): AirportMarkerGroup[] {
  const visitedAirportIds = new Set<string>();
  const groups: AirportMarkerGroup[] = [];
  for (const airport of airports) {
    if (visitedAirportIds.has(airport.id)) {
      continue;
    }

    const groupedAirports: Airport[] = [];
    const pendingAirports = [airport];
    visitedAirportIds.add(airport.id);
    while (pendingAirports.length > 0) {
      const current = pendingAirports.shift();
      if (!current) {
        continue;
      }

      groupedAirports.push(current);
      for (const candidate of airports) {
        if (
          visitedAirportIds.has(candidate.id) ||
          airportDistanceKm(current, candidate) > airportMarkerGroupRadiusKm
        ) {
          continue;
        }

        visitedAirportIds.add(candidate.id);
        pendingAirports.push(candidate);
      }
    }

    groupedAirports.sort((left, right) => left.iataCode.localeCompare(right.iataCode));
    groups.push({ airports: groupedAirports, location: airport.location });
  }

  return groups;
}

function airportDistanceKm(left: Airport, right: Airport) {
  const earthRadiusKm = 6371;
  const leftLatitude = toRadians(left.location.lat);
  const rightLatitude = toRadians(right.location.lat);
  const latitudeDifference = rightLatitude - leftLatitude;
  const longitudeDifference = toRadians(right.location.lng - left.location.lng);
  const haversine =
    Math.sin(latitudeDifference / 2) ** 2 +
    Math.cos(leftLatitude) * Math.cos(rightLatitude) * Math.sin(longitudeDifference / 2) ** 2;

  return 2 * earthRadiusKm * Math.asin(Math.sqrt(haversine));
}

function toRadians(value: number) {
  return (value * Math.PI) / 180;
}

function geometryCoordinates(coordinates: number[][] | number[][][]): Coordinate[] {
  const lines = isLineCoordinates(coordinates) ? [coordinates] : coordinates;
  return lines.flatMap((line) => line.map(([lng, lat]): Coordinate => [lng, lat]));
}

function isLineCoordinates(coordinates: number[][] | number[][][]): coordinates is number[][] {
  return typeof coordinates[0]?.[0] === 'number';
}

function getBounds(coordinates: Coordinate[]): [[number, number], [number, number]] | undefined {
  if (!coordinates.length) {
    return;
  }
  const [minLng, maxLng] = longitudeBounds(coordinates.map(([lng]) => lng));
  const lats = coordinates.map(([, lat]) => lat);
  const minLat = Math.min(...lats),
    maxLat = Math.max(...lats);
  return [
    [minLng === maxLng ? minLng - 1 : minLng, minLat === maxLat ? minLat - 1 : minLat],
    [minLng === maxLng ? maxLng + 1 : maxLng, maxLat === minLat ? maxLat + 1 : maxLat],
  ];
}

function longitudeBounds(longitudes: number[]): [number, number] {
  const sorted = longitudes
    .map((value) => ((value % 360) + 360) % 360)
    .sort((left, right) => left - right);
  if (sorted.length === 1) {
    return [sorted[0], sorted[0]];
  }
  let largestGap = -1,
    gapIndex = 0;
  for (let index = 0; index < sorted.length; index++) {
    const next = index === sorted.length - 1 ? sorted[0] + 360 : sorted[index + 1];
    const gap = next - sorted[index];
    if (gap > largestGap) {
      largestGap = gap;
      gapIndex = index;
    }
  }
  let min = sorted[(gapIndex + 1) % sorted.length];
  let max = sorted[gapIndex];
  if (max < min) {
    max += 360;
  }
  while ((min + max) / 2 > 180) {
    min -= 360;
    max -= 360;
  }
  while ((min + max) / 2 < -180) {
    min += 360;
    max += 360;
  }
  return [min, max];
}
