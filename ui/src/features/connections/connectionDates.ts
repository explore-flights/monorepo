import type { ConnectionBranch, ConnectionsData } from '@/api/types';

export function connectionDepartureDates(data: ConnectionsData): string[] {
  return [
    ...new Set(
      data.connections.flatMap((branch) => {
        const flight = data.flights[branch.flightId];
        return flight ? [flight.departureTime.slice(0, 10)] : [];
      }),
    ),
  ].sort();
}

export function connectionsOnDepartureDate(data: ConnectionsData, date: string): ConnectionsData {
  const connections = data.connections.filter(
    (branch) => data.flights[branch.flightId]?.departureTime.slice(0, 10) === date,
  );
  const flightIds = new Set<string>();
  function visit(branch: ConnectionBranch) {
    flightIds.add(branch.flightId);
    branch.outgoing.forEach(visit);
  }
  connections.forEach(visit);

  return {
    ...data,
    connections,
    flights: Object.fromEntries(Object.entries(data.flights).filter(([id]) => flightIds.has(id))),
  };
}
