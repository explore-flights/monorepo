import 'maplibre-gl/dist/maplibre-gl.css';
import classes from './maplibre-map.module.scss';
import React, { useEffect, useMemo, useState } from 'react';
import {
  FullscreenControl,
  Layer,
  Map,
  ScaleControl,
  Source,
  useMap
} from 'react-map-gl/maplibre';
import {
  Box,
  Button,
  Container,
  Grid,
  Header,
  Link,
  SpaceBetween, Spinner, ToggleButton
} from '@cloudscape-design/components';
import { greatCircle } from '@turf/turf';
import { useConsent } from '../util/state/use-consent';
import { ConsentLevel } from '../../lib/consent.model';
import { usePreferences } from '../util/state/use-preferences';
import { ColorScheme } from '../../lib/preferences.model';
import { LineLayerSpecification } from '@maplibre/maplibre-gl-style-spec';
import { colorful } from '@versatiles/style';
import { FitBoundsOptions, LngLatBoundsLike } from 'maplibre-gl';

function ComponentResize() {
  const map = useMap();
  useEffect(() => {
    map.current?.resize();
  }, [map.current]);

  return null;
}

export interface MaplibreMapProps {
  height: string | number;
  controls?: ReadonlyArray<React.ReactNode>;
  initialLng?: number;
  initialLat?: number;
  initialZoom?: number;
  loading?: boolean;
  displayControls?: {
    fullscreen: boolean;
    scale: boolean;
    globeTransition: boolean;
  };
}

export function MaplibreMap(props: React.PropsWithChildren<MaplibreMapProps>) {
  const [allowOnce, setAllowOnce] = useState(false);
  const [consentLevels] = useConsent();

  if (!allowOnce && !consentLevels.has(ConsentLevel.VERSATILES)) {
    return <MaplibreMapConsent {...props} onAllowOnceClick={() => setAllowOnce(true)} />;
  } else if (props.loading) {
    return <MaplibreMapLoading {...props} />;
  }

  return <MaplibreMapInternal {...props} />;
}

export function MaplibreMapInline(props: React.PropsWithChildren<Omit<MaplibreMapProps, 'height'>>) {
  return (
    <MaplibreMap height={'200px'} displayControls={{ fullscreen: true, scale: false, globeTransition: false }} {...props} />
  );
}

function MaplibreMapConsent({ height, onAllowOnceClick }: { height: string | number, onAllowOnceClick: () => void }) {
  const [consentLevels, setConsentLevels] = useConsent();

  function onAllowClick() {
    setConsentLevels([...consentLevels, ConsentLevel.VERSATILES]);
  }

  return (
    <MaplibreMapOverlay height={height}>
      <Container
        header={<Header>VersaTiles Consent</Header>}
        footer={
          <SpaceBetween size={'xs'} direction={'horizontal'}>
            <Button variant={'primary'} onClick={onAllowClick}>Allow &amp; Remember</Button>
            <Button variant={'normal'} onClick={onAllowOnceClick}>Allow Once</Button>
          </SpaceBetween>
        }
      >
        <SpaceBetween direction={'vertical'} size={'xs'}>
          <Box>The map component loads resources from URLs provided by <Link href={'https://versatiles.org/'} external={true}>VersaTiles</Link>.</Box>
          <Box>Your browser will automatically transfer connection metadata like your IP-Address and User-Agent to VersaTiles.</Box>
          <Box>By using the map component you accept and allow this from happening. You can always opt-out of this by updating your privacy preferences.</Box>
        </SpaceBetween>
      </Container>
    </MaplibreMapOverlay>
  );
}

function MaplibreMapLoading({ height }: { height: string | number }) {
  return (
    <MaplibreMapOverlay height={height}>
      <Container>
        <SpaceBetween size={'m'} direction={'horizontal'} alignItems={'center'}>
          <Spinner size={'large'} />
          <Box variant={'span'} fontSize={'heading-xl'}>Loading ...</Box>
        </SpaceBetween>
      </Container>
    </MaplibreMapOverlay>
  );
}

function MaplibreMapOverlay({ height, children }: React.PropsWithChildren<{ height: string | number }>) {
  return (
    <div className={classes['consent']} style={{ minHeight: height, width: 'auto' }}>
      <div className={classes['consent-container']}>
        <div className={classes['consent-content']}>
          <Grid gridDefinition={[{ colspan: { default: 12, xs: 10, s: 8 }, offset: { default: 0, xs: 1, s: 2 } }]}>
            {children}
          </Grid>
        </div>
      </div>
    </div>
  );
}

function MaplibreMapInternal({ children, height, controls, initialLat, initialLng, initialZoom, displayControls }: React.PropsWithChildren<MaplibreMapProps>) {
  const [preferences] = usePreferences();
  const [projection, setProjection] = useState<'globe' | 'mercator'>('mercator');
  const mapStyle = useMemo(() => {
    return colorful({
      baseUrl: 'https://tiles.versatiles.org',
      language: 'en',
      recolor: {
        invertBrightness: preferences.effectiveColorScheme === ColorScheme.DARK,
      },
    });
  }, [preferences.effectiveColorScheme]);

  return (
    <Map
      style={{ height: height }}
      initialViewState={{
        longitude: initialLng ?? 0.0,
        latitude: initialLat ?? 0.0,
        zoom: initialZoom ?? 3,
      }}
      projection={projection}
      mapStyle={mapStyle}
    >
      <ComponentResize />
      <div style={{ float: 'left', marginTop: '10px', marginLeft: '10px' }}>
        <SpaceBetween size={'m'} direction={'horizontal'} alignItems={'center'}>
          {(displayControls?.globeTransition ?? true) && <GlobeTransition projection={projection} setProjection={setProjection} />}
          {...(controls ?? [])}
        </SpaceBetween>
      </div>
      {(displayControls?.fullscreen ?? true) && <FullscreenControl />}
      {(displayControls?.scale ?? true) && <ScaleControl />}
      {children}
    </Map>
  );
}

function GlobeTransition({ projection, setProjection }: { projection: 'globe' | 'mercator', setProjection: (projection: 'globe' | 'mercator') => void }) {
  return (
    <ToggleButton
      pressed={projection === 'globe'}
      onChange={(e) => setProjection(e.detail.pressed ? 'globe' : 'mercator')}
      iconName={'globe'}
      pressedIconName={'map'}
    ></ToggleButton>
  );
}

export function FitBounds({ bounds, options }: { bounds: LngLatBoundsLike, options?: FitBoundsOptions }) {
  const map = useMap();
  useEffect(() => {
    map.current?.fitBounds(bounds, options);
  }, [map.current, bounds, options]);

  return null;
}

export function SmartLine({ src, dst, dashed }: { src: [number, number], dst: [number, number], dashed?: boolean }) {
  const [srcLng, srcLat] = src;
  const [dstLng, dstLat] = dst;
  const feature = useMemo(() => {
    const result: Array<[number, number]> = [];
    if (srcLng > dstLng) {
      result.push([srcLng, srcLat], [dstLng, dstLat]);
    } else {
      result.push([dstLng, dstLat], [srcLng, srcLat]);
    }

    if (result[0][0] - result[1][0] >= 180) {
      result[1][0] += 360;
    }

    return greatCircle(result[0], result[1]);
  }, [srcLng, srcLat, dstLng, dstLat]);

  const [sourceId, layerId] = useMemo(() => {
    const baseId = `${Date.now()}-${Math.random()}`;
    const sourceId = `SOURCE:${baseId}`;
    const layerId = `LAYER:${sourceId}`;

    return [sourceId, layerId];
  }, [feature]);

  const [preferences] = usePreferences();
  const paint = useMemo(() => {
    let paint: LineLayerSpecification['paint'] = {
      'line-width': 3,
      'line-color': ({
        [ColorScheme.DARK]: '#c6c6cd',
        [ColorScheme.LIGHT]: '#000000',
      })[preferences.effectiveColorScheme],
    };

    if (dashed) {
      paint['line-dasharray'] = [1, 1];
    }

    return paint;
  }, [preferences.effectiveColorScheme, dashed]);

  return (
    <Source
      key={sourceId}
      id={sourceId}
      type={'geojson'}
      data={feature}
    >
      <Layer key={layerId} id={layerId} type={'line'} source={sourceId} paint={paint} />
    </Source>
  );
}
