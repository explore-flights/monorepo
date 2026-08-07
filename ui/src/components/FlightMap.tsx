import 'maplibre-gl/dist/maplibre-gl.css';
import MapCanvas, { Layer, Marker, NavigationControl, Source } from 'react-map-gl/maplibre';
import { MapPin } from 'lucide-react';
import { colorful } from '@versatiles/style';
import { greatCircle } from '@turf/great-circle';
import { useEffect, useMemo, useState, type CSSProperties } from 'react';
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
type Coordinate = [number, number];
type FlightMapStyle = CSSProperties & { '--flight-map-height': string };

export function FlightMap({
  routes,
  airports = [],
  height = 480,
}: {
  routes: RouteLine[];
  airports?: Airport[];
  height?: number;
}) {
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
  const all = [...airports, ...routes.flatMap((route) => [route.from, route.to])];
  const displayedAirports = uniqueAirports(all);
  const activeAirportId = displayedAirports.some((airport) => airport.id === selectedAirportId)
    ? selectedAirportId
    : undefined;
  useEffect(() => {
    if (
      selectedAirportId &&
      !displayedAirports.some((airport) => airport.id === selectedAirportId)
    ) {
      setSelectedAirportId(undefined);
    }
  }, [displayedAirports, selectedAirportId]);
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
  const visibleRoutes = activeAirportId
    ? routes.filter((route) => route.from.id === activeAirportId || route.to.id === activeAirportId)
    : routes;
  const maxFrequency = Math.max(...routes.map((route) => route.frequency ?? 0), 1);
  const features = [...visibleRoutes]
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
    );
  const bounds = getBounds([
    ...airports.map((airport): Coordinate => [airport.location.lng, airport.location.lat]),
    ...features.flatMap((feature) => geometryCoordinates(feature.geometry.coordinates)),
  ]);
  const geojson = { type: 'FeatureCollection' as const, features };
  const mapContainerStyle: FlightMapStyle = { '--flight-map-height': `${height}px` };
  return (
    <div className={styles.wrap} data-map-theme={effectiveTheme} style={mapContainerStyle}>
      <MapCanvas
        key={effectiveTheme}
        initialViewState={
          bounds
            ? { bounds, fitBoundsOptions: { padding: 70 } }
            : { longitude: 8, latitude: 35, zoom: 1.5 }
        }
        mapStyle={mapStyle}
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
        {displayedAirports.map((airport) => {
          const selected = airport.id === activeAirportId;
          return (
            <Marker
              key={airport.id}
              longitude={airport.location.lng}
              latitude={airport.location.lat}
              anchor='bottom'
            >
              <button
                type='button'
                className={classNames(
                  styles.marker,
                  selected && styles.active,
                  activeAirportId && !selected && styles.muted,
                )}
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
                <MapPin size={18} />
                <span>{airport.iataCode}</span>
              </button>
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
