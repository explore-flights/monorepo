import { Aircraft, Airports, Connections } from '../../lib/api/api.model';
import React, { useMemo } from 'react';
import { DateTime } from 'luxon';
import { ExpandableSection, Tabs, TabsProps } from '@cloudscape-design/components';
import { ConnectionsGraph } from './connections-graph';
import { ConnectionsTable } from './connections-table';
import { ConnectionsMap } from './connections-map';

export interface ConnectionsTabsProps {
  connections?: Connections;
  airports: Airports;
  aircraft?: ReadonlyArray<Aircraft>;
}

export function ConnectionsTabs({ connections, airports, aircraft }: ConnectionsTabsProps) {
  if (connections === undefined) {
    return undefined;
  }

  const aircraftLookup = useMemo(() => {
    if (!aircraft) {
      return undefined;
    }

    const lookup: Record<string, Aircraft> = {};
    for (const a of aircraft) {
      lookup[a.code] = a;
    }

    return lookup;
  }, [aircraft]);

  const tabs = useMemo(() => {
    return Object.entries(groupByDepartureDate(connections))
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, connections]) => ({
        id: date,
        label: DateTime.fromISO(date).toLocaleString(DateTime.DATE_FULL),
        content: (
          <>
            <ExpandableSection headerText={'Graph'} defaultExpanded={true} variant={'stacked'} disableContentPaddings={true}>
              <ConnectionsGraph connections={connections} aircraftLookup={aircraftLookup} />
            </ExpandableSection>
            <ExpandableSection headerText={'Map'} defaultExpanded={false} variant={'stacked'} disableContentPaddings={true}>
              <ConnectionsMap connections={connections} airports={airports} aircraftLookup={aircraftLookup} />
            </ExpandableSection>
            <ExpandableSection headerText={'Table'} defaultExpanded={false} variant={'stacked'}>
              <ConnectionsTable connections={connections} aircraftLookup={aircraftLookup} />
            </ExpandableSection>
          </>
        ),
      } satisfies TabsProps.Tab))
  }, [connections, aircraftLookup]);

  return (
    <Tabs variant={'default'} tabs={tabs} />
  );
}

function groupByDepartureDate(connections: Connections): Record<string, Connections> {
  const result: Record<string, Connections> = {};

  for (const connection of connections.connections) {
    const flight = connections.flights[connection.flightId];
    const departureDate = DateTime.fromISO(flight.departureTime, { setZone: true }).toISODate()!;

    result[departureDate] = {
      connections: [
        ...(result[departureDate]?.connections ?? []),
        connection,
      ],
      flights: connections.flights,
    };
  }

  return result;
}