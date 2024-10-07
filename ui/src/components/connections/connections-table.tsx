import { Aircraft, Connection, Connections, Flight, FlightNumber } from '../../lib/api/api.model';
import React, { useCallback, useMemo, useState } from 'react';
import { useCollection } from '@cloudscape-design/collection-hooks';
import { Header, Pagination, Popover, Table } from '@cloudscape-design/components';
import { DateTime } from 'luxon';
import { flightNumberToString } from '../../lib/util/flight';

interface ConnectionsTableBaseItem {
  readonly flightNumber?: FlightNumber;
  readonly departureTime: DateTime<true>;
  readonly departureAirport: string;
  readonly arrivalTime: DateTime<true>;
  readonly arrivalAirport: string;
  readonly aircraftOwner?: string;
  readonly aircraftType?: string;
  readonly registration?: string;
  readonly codeShares?: ReadonlyArray<FlightNumber>;
  readonly children?: ReadonlyArray<ConnectionsTableChildItem>;
}

interface ConnectionsTableParentItem extends ConnectionsTableBaseItem {
  readonly flightNumber: undefined;
  readonly aircraftOwner: undefined;
  readonly aircraftType: undefined;
  readonly registration: undefined;
  readonly codeShares: undefined;
  readonly children: ReadonlyArray<ConnectionsTableChildItem>;
}

interface ConnectionsTableChildItem extends ConnectionsTableBaseItem {
  readonly flightNumber: FlightNumber;
  readonly aircraftOwner: string;
  readonly aircraftType: string;
  readonly registration?: string;
  readonly codeShares: ReadonlyArray<FlightNumber>;
  readonly children: undefined;
}

type ConnectionsTableItem = ConnectionsTableParentItem | ConnectionsTableChildItem;

export interface ConnectionsTableProps {
  connections: Connections;
  aircraftLookup?: Record<string, Aircraft>;
}

export function ConnectionsTable({ connections, aircraftLookup }: ConnectionsTableProps) {
  const rawItems = useMemo(() => connectionsToTableItems(connections.connections, connections.flights), [connections]);
  const { items, collectionProps, paginationProps } = useCollection(rawItems, {
    sorting: {
      defaultState: {
        isDescending: false,
        sortingColumn: {
          sortingField: 'departureTime',
        },
      },
    },
    pagination: { pageSize: 25 },

  });
  const [expandedItems, setExpandedItems] = useState<ReadonlyArray<ConnectionsTableItem>>([]);

  return (
    <Table
      {...collectionProps}
      items={items}
      filter={<Header counter={`(${rawItems.length})`}>Connections</Header>}
      pagination={<Pagination {...paginationProps}  />}
      variant={'borderless'}
      columnDefinitions={[
        {
          id: 'flight_number',
          header: 'Flight Number',
          cell: (v) => v.flightNumber !== undefined ? flightNumberToString(v.flightNumber) : '',
        },
        {
          id: 'departure_time',
          header: 'Departure Time',
          cell: (v) => v.departureTime.toLocaleString(DateTime.DATETIME_FULL),
          sortingField: 'departureTime',
        },
        {
          id: 'departure_airport',
          header: 'Departure Airport',
          cell: (v) => v.departureAirport,
          sortingField: 'departureAirport',
        },
        {
          id: 'arrival_time',
          header: 'Arrival Time',
          cell: (v) => v.arrivalTime.toLocaleString(DateTime.DATETIME_FULL),
          sortingField: 'arrivalTime',
        },
        {
          id: 'arrival_airport',
          header: 'Arrival Airport',
          cell: (v) => v.arrivalAirport,
          sortingField: 'arrivalAirport',
        },
        {
          id: 'duration',
          header: 'Duration',
          cell: (v) => v.arrivalTime.diff(v.departureTime).rescale().toHuman({ unitDisplay: 'short' }),
          sortingComparator: useCallback((a: ConnectionsTableItem, b: ConnectionsTableItem) => {
            const aDuration = a.arrivalTime.diff(a.departureTime);
            const bDuration = b.arrivalTime.diff(b.departureTime);

            return aDuration.toMillis() - bDuration.toMillis();
          }, []),
        },
        {
          id: 'aircraft_owner',
          header: 'Aircraft Owner',
          cell: (v) => v.aircraftOwner,
        },
        {
          id: 'aircraft_type',
          header: 'Aircraft Type',
          cell: (v) => (
            v.aircraftType
              ? <AircraftType aircraftType={v.aircraftType} aircraft={aircraftLookup ? aircraftLookup[v.aircraftType] : undefined} />
              : undefined
          ),
        },
        {
          id: 'registration',
          header: 'Aircraft Registration',
          cell: (v) => v.registration,
        },
        {
          id: 'code_shares',
          header: 'Code Shares',
          cell: (v) => v.codeShares !== undefined ? v.codeShares.map(flightNumberToString).join(', ') : '',
        },
      ]}
      expandableRows={{
        getItemChildren: (item) => item.children ?? [],
        isItemExpandable: (item) => item.children !== undefined,
        expandedItems: expandedItems,
        onExpandableItemToggle: (e) => {
          const item = e.detail.item;
          const expand = e.detail.expanded;

          setExpandedItems((prev) => {
            if (expand) {
              return [...prev, item];
            }

            const index = prev.indexOf(item);
            if (index === -1) {
              return prev;
            }

            return prev.toSpliced(index, 1);
          });
        },
      }}
    />
  );
}

function AircraftType({ aircraftType, aircraft }: { aircraftType: string, aircraft?: Aircraft }) {
  if (!aircraft) {
    return aircraftType;
  }

  return (
    <Popover content={aircraft.name}>{aircraftType}</Popover>
  );
}

function connectionsToTableItems(connections: ReadonlyArray<Connection>, flights: Record<string, Flight>): ReadonlyArray<ConnectionsTableItem> {
  const result: Array<ConnectionsTableItem> = [];

  for (const expanded of expandConnections(connections, flights)) {
    if (expanded.length === 1) {
      result.push(expanded[0]);
    } else if (expanded.length > 1) {
      const first = expanded[0];
      const last = expanded[expanded.length - 1];

      result.push({
        flightNumber: undefined,
        departureTime: first.departureTime,
        departureAirport: first.departureAirport,
        arrivalTime: last.arrivalTime,
        arrivalAirport: last.arrivalAirport,
        aircraftOwner: undefined,
        aircraftType: undefined,
        registration: undefined,
        codeShares: undefined,
        children: expanded,
      } satisfies ConnectionsTableParentItem);
    }
  }

  return result;
}

function expandConnections(conns: ReadonlyArray<Connection>, flights: Record<string, Flight>): ReadonlyArray<ReadonlyArray<ConnectionsTableChildItem>> {
  const result: Array<ReadonlyArray<ConnectionsTableChildItem>> = [];
  for (const conn of conns) {
    const flight = flights[conn.flightId];
    const departureTime = DateTime.fromISO(flight.departureTime, { setZone: true });
    const arrivalTime = DateTime.fromISO(flight.arrivalTime, { setZone: true });
    if (!departureTime.isValid || !arrivalTime.isValid) {
      throw new Error(`invalid departureTime/arrivalTime: ${flight.departureTime} / ${flight.arrivalTime}`);
    }

    const item = {
      flightNumber: flight.flightNumber,
      departureTime: departureTime,
      departureAirport: flight.departureAirport,
      arrivalTime: arrivalTime,
      arrivalAirport: flight.arrivalAirport,
      aircraftOwner: flight.aircraftOwner,
      aircraftType: flight.aircraftType,
      registration: flight.registration,
      codeShares: flight.codeShares,
      children: undefined,
    } satisfies ConnectionsTableChildItem;

    if (conn.outgoing.length > 0) {
      for (const expanded of expandConnections(conn.outgoing, flights)) {
        result.push([
          { ...item } satisfies ConnectionsTableChildItem,
          ...expanded,
        ]);
      }
    } else {
      result.push([item]);
    }
  }

  return result;
}