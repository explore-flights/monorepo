import React from 'react';
import { Aircraft, Airport } from '../../lib/api/api.model';
import { Box, Popover } from '@cloudscape-design/components';
import { CodeView } from '@cloudscape-design/code-view';
import jsonHighlight from '@cloudscape-design/code-view/highlight/json';
import { aircraftConfigurationVersionToName } from '../../lib/consts';

export function AirportText({ code, airport }: { code: string, airport?: Airport }) {
  const content = <Box variant={'samp'}>{code}</Box>;
  if (!airport) {
    return content;
  }

  return <Popover content={airport.name} dismissButton={false}>{content}</Popover>;
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
