import 'maplibre-gl/dist/maplibre-gl.css';
import classes from './maplibre-map.module.scss';
import React, { useEffect, useMemo, useState } from 'react';
import {
  FullscreenControl,
  Layer,
  Map,
  Marker,
  MarkerProps,
  ScaleControl,
  Source,
  useMap
} from 'react-map-gl/maplibre';
import {
  Box,
  Button,
  ButtonProps,
  Container, Grid,
  Header,
  Link,
  Popover,
  PopoverProps, SpaceBetween
} from '@cloudscape-design/components';
import { greatCircle } from '@turf/turf';
import { useConsent } from '../util/state/use-consent';
import { ConsentLevel } from '../../lib/consent.model';
import { usePreferences } from '../util/state/use-preferences';
import { ColorScheme } from '../../lib/preferences.model';
import { LineLayerSpecification } from '@maplibre/maplibre-gl-style-spec';

function ComponentResize() {
  const map = useMap();
  useEffect(() => {
    map.current?.resize();
  }, [map.current]);

  return null;
}

export interface MaplibreMapProps {
  height: string | number;
}

export function MaplibreMap(props: React.PropsWithChildren<MaplibreMapProps>) {
  const [allowOnce, setAllowOnce] = useState(false);
  const [consentLevels] = useConsent();

  if (!allowOnce && !consentLevels.has(ConsentLevel.VERSATILES)) {
    return <MaplibreMapConsent {...props} onAllowOnceClick={() => setAllowOnce(true)} />;
  }

  return <MaplibreMapInternal {...props} />;
}

function MaplibreMapConsent({ height, onAllowOnceClick }: { height: string | number, onAllowOnceClick: () => void }) {
  const [consentLevels, setConsentLevels] = useConsent();

  function onAllowClick() {
    setConsentLevels([...consentLevels, ConsentLevel.VERSATILES]);
  }

  return (
    <div className={classes['consent']} style={{ height: height, width: 'auto' }}>
      <div className={classes['consent-container']}>
        <div className={classes['consent-content']}>
          <Grid gridDefinition={[{ colspan: { default: 12, xs: 10, s: 8 }, offset: { default: 0, xs: 1, s: 2 } }]}>
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
          </Grid>
        </div>
      </div>
    </div>
  );
}

function MaplibreMapInternal({ children, height }: React.PropsWithChildren<MaplibreMapProps>) {
  const [preferences] = usePreferences();
  const mapStyleURL = useMemo(() => {
    // https://github.com/versatiles-org/versatiles-style
    const variant = ({
      [ColorScheme.DARK]: 'eclipse',
      [ColorScheme.LIGHT]: 'colorful',
    })[preferences.effectiveColorScheme];

    return `https://tiles.versatiles.org/assets/styles/${variant}/style.json`;
  }, [preferences.effectiveColorScheme]);

  return (
    <Map
      style={{ height: height }}
      initialViewState={{
        longitude: 0.0,
        latitude: 0.0,
        zoom: 0,
      }}
      mapStyle={mapStyleURL}
    >
      <ComponentResize />
      <FullscreenControl />
      <ScaleControl />
      {children}
    </Map>
  );
}

export interface PopupMarkerProps extends MarkerProps {
  button: ButtonProps;
  popover: Omit<PopoverProps, 'triggerType'>;
}

export function PopupMarker({ children, button, popover, ...markerProps }: React.PropsWithChildren<PopupMarkerProps>) {
  return (
    <Marker {...markerProps}>
      <Popover {...popover} triggerType={'custom'}>
        <Button {...button}>{children}</Button>
      </Popover>
    </Marker>
  );
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
  const lineColor = useMemo(() => ({
    [ColorScheme.DARK]: '#c6c6cd',
    [ColorScheme.LIGHT]: '#000000',
  })[preferences.effectiveColorScheme], [preferences.effectiveColorScheme]);

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
