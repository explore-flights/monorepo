import React from 'react';
import { Aircraft, Airport } from '../../lib/api/api.model';
import {
  Badge,
  BadgeProps,
  Box,
  KeyValuePairs,
  Popover,
  SpaceBetween,
  StatusIndicator
} from '@cloudscape-design/components';
import { CodeView } from '@cloudscape-design/code-view';
import jsonHighlight from '@cloudscape-design/code-view/highlight/json';
import { aircraftConfigurationVersionToName } from '../../lib/consts';
import { MaplibreMapInline } from '../maplibre/maplibre-map';
import { Marker } from 'react-map-gl/maplibre';

export interface AirportTextProps {
  airport: Airport;
  renderWithPortal?: boolean;
  noPopover?: boolean;
  variant?: 'normal' | 'badge';
  badgeColor?: BadgeProps['color'];
}

export function AirportLongText(props: AirportTextProps) {
  const codes = [props.airport.iataCode];
  if (props.airport.icaoCode) {
    codes.push(props.airport.icaoCode);
  }

  let text: string;
  if (props.airport.name) {
    text = `${props.airport.name} (${codes.join('/')})`;
  } else {
    text = codes.join('/');
  }

  return (
    <AirportText {...props}>
      <Box>{text}</Box>
    </AirportText>
  );
}

export function AirportInlineText(props: AirportTextProps) {
  return (
    <AirportText {...props}>
      <SampText text={props.airport.iataCode} />
    </AirportText>
  );
}

function AirportText({ airport, renderWithPortal, noPopover, variant, badgeColor, children }: React.PropsWithChildren<AirportTextProps>) {
  let content = children;
  if (variant === 'badge' || badgeColor !== undefined) {
    content = (
      <Badge color={badgeColor}>{content}</Badge>
    );
  }

  if (noPopover) {
    return content;
  }

  return (
    <AirportPopover airport={airport} renderWithPortal={renderWithPortal}>{content}</AirportPopover>
  );
}

function AirportPopover({ airport, renderWithPortal, children }: React.PropsWithChildren<{ airport: Airport, renderWithPortal?: boolean }>) {
  return (
    <Popover
      renderWithPortal={renderWithPortal}
      dismissButton={true}
      size={'large'}
      content={<KeyValuePairs columns={1} minColumnWidth={1000} items={[
        {
          label: 'Name',
          value: airport.name ?? <UnknownProperty />,
        },
        {
          label: 'IATA Code',
          value: <SampText text={airport.iataCode} />,
        },
        {
          label: 'ICAO Code',
          value: airport.icaoCode
            ? <SampText text={airport.icaoCode} />
            : <UnknownProperty />,
        },
        {
          label: 'IATA Area Code',
          value: airport.iataAreaCode
            ? <SampText text={airport.iataAreaCode} />
            : <UnknownProperty />,
        },
        {
          label: 'Country Code',
          value: airport.countryCode
            ? <SampText text={airport.countryCode} />
            : <UnknownProperty />,
        },
        {
          label: 'City Code',
          value: airport.cityCode
            ? <SampText text={airport.cityCode} />
            : <UnknownProperty />,
        },
        {
          label: 'Timezone',
          value: airport.timezone
            ? <SampText text={airport.timezone} />
            : <UnknownProperty />,
        },
        {
          label: 'Location',
          value: airport.location
            ? (
              <SpaceBetween size={'xs'} direction={'vertical'}>
                <Box>Latitude: {airport.location.lat}, Longitude: {airport.location.lng}</Box>
                <MaplibreMapInline initialLat={airport.location.lat} initialLng={airport.location.lng} initialZoom={2}>
                  <Marker latitude={airport.location.lat} longitude={airport.location.lng}>
                    <Badge color={'green'}>{airport.iataCode}</Badge>
                  </Marker>
                </MaplibreMapInline>
              </SpaceBetween>
            )
            : <UnknownProperty />,
        },
      ]} />}
    >{children}</Popover>
  );
}

export function AircraftText({ code, aircraft }: { code: string, aircraft?: Aircraft }) {
  const content = <Box variant={'samp'}>{code}</Box>;
  if (!aircraft) {
    return content;
  }

  return <AircraftCellPopover value={aircraft}>{content}</AircraftCellPopover>;
}

function AircraftCellPopover({ value, children }: React.PropsWithChildren<{ value: Aircraft }>) {
  return (
    <Popover header={value.name} content={<CodeView content={JSON.stringify(value, null, 2)} highlight={jsonHighlight} />} size={'large'}>
      {children}
    </Popover>
  )
}

export function AircraftConfigurationVersionText({ value, popoverContent }: { value: string, popoverContent?: React.ReactNode }) {
  const name = aircraftConfigurationVersionToName(value);
  const content = <Box variant={'samp'}>{name ?? value}</Box>;

  if (popoverContent) {
    return (
      <Popover header={value} content={popoverContent}>{content}</Popover>
    );
  }

  if (name) {
    return (
      <Popover content={value} dismissButton={false}>{content}</Popover>
    );
  }

  return content;
}

function SampText({ text }: { text: string }) {
  return (
    <Box variant={'samp'} color={'inherit'}>{text}</Box>
  );
}

function UnknownProperty() {
  return (
    <StatusIndicator type={'info'}>unknown</StatusIndicator>
  );
}
