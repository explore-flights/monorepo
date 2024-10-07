import { Aircraft, Connections } from '../../lib/api/api.model';
import React, { useMemo } from 'react';
import { DateTime } from 'luxon';
import { Tabs, TabsProps } from '@cloudscape-design/components';
import { ConnectionsGraph } from './connections-graph';

export interface ConnectionsGraphTabsProps {
  connections: Connections;
  aircraftLookup: Record<string, Aircraft>;
}

export function ConnectionsGraphTabs({ connections, aircraftLookup }: ConnectionsGraphTabsProps) {
  const tabs = useMemo(() => {
    return Object.entries(groupByDepartureDate(connections))
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, connections]) => ({
        id: date,
        label: DateTime.fromISO(date).toLocaleString(DateTime.DATE_FULL),
        content: <ConnectionsGraph connections={connections} aircraftLookup={aircraftLookup} />,
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