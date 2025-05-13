import React, { useMemo } from 'react';
import { DateTime } from 'luxon';
import { Tabs, TabsProps } from '@cloudscape-design/components';
import { ConnectionsGraph } from './connections-graph';
import { ConnectionsResponse } from '../../lib/api/api.model';

export interface ConnectionsGraphTabsProps {
  connections: ConnectionsResponse;
}

export function ConnectionsGraphTabs({ connections }: ConnectionsGraphTabsProps) {
  const tabs = useMemo(() => {
    return Object.entries(groupByDepartureDate(connections))
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, connections]) => ({
        id: date,
        label: DateTime.fromISO(date).toLocaleString(DateTime.DATE_FULL),
        content: <ConnectionsGraph connections={connections} />,
      } satisfies TabsProps.Tab))
  }, [connections]);

  return (
    <Tabs variant={'default'} tabs={tabs} />
  );
}

function groupByDepartureDate(connections: ConnectionsResponse): Record<string, ConnectionsResponse> {
  const result: Record<string, ConnectionsResponse> = {};

  for (const connection of connections.connections) {
    const flight = connections.flights[connection.flightId];
    const departureDate = DateTime.fromISO(flight.departureTime, { setZone: true }).toISODate()!;

    result[departureDate] = {
      connections: [
        ...(result[departureDate]?.connections ?? []),
        connection,
      ],
      flights: connections.flights,
      airlines: connections.airlines,
      airports: connections.airports,
      aircraft: connections.aircraft,
    };
  }

  return result;
}