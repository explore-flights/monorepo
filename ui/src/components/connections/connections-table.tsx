import {
  Aircraft, AircraftId,
  Airline, AirlineId,
  Airport, AirportId, ConnectionFlightResponse,
  ConnectionResponse,
  ConnectionsResponse,
  FlightNumber
} from '../../lib/api/api.model';
import React, { useCallback, useMemo, useState } from 'react';
import { useCollection } from '@cloudscape-design/collection-hooks';
import { Header, Pagination, Popover, Table } from '@cloudscape-design/components';
import { DateTime } from 'luxon';
import { flightNumberToString } from '../../lib/util/flight';
import { withDepartureAirportIdFilter, withDepartureDateFilter } from '../../pages/flight';
import { FlightLink } from '../common/flight-link';
import { BulletSeperator, Join } from '../common/join';
import { AirportInlineText } from '../common/text';

interface ConnectionsTableBaseItem {
  readonly flightNumber?: [Airline, FlightNumber];
  readonly departureTime: DateTime<true>;
  readonly departureAirport: Airport;
  readonly arrivalTime: DateTime<true>;
  readonly arrivalAirport: Airport;
  readonly aircraftOwner?: string;
  readonly aircraft?: Aircraft;
  readonly codeShares?: ReadonlyArray<[Airline, FlightNumber]>;
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
  readonly flightNumber: [Airline, FlightNumber];
  readonly aircraftOwner: string;
  readonly aircraft: Aircraft;
  readonly registration?: string;
  readonly codeShares: ReadonlyArray<[Airline, FlightNumber]>;
  readonly children: undefined;
}

type ConnectionsTableItem = ConnectionsTableParentItem | ConnectionsTableChildItem;

export interface ConnectionsTableProps {
  connections: ConnectionsResponse;
}

export function ConnectionsTable({ connections }: ConnectionsTableProps) {
  const rawItems = useMemo(
    () => connectionsToTableItems(connections.connections, connections.flights, connections.airlines, connections.airports, connections.aircraft),
    [connections]
  );
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
          cell: (v) => {
            if (!v.flightNumber) {
              return undefined;
            }

            let query = new URLSearchParams();
            query = withDepartureDateFilter(query, v.departureTime);
            query = withDepartureAirportIdFilter(query, v.departureAirport.id);

            return <FlightLink flightNumber={flightNumberToString(v.flightNumber[1], v.flightNumber[0])} query={query} target={'_blank'} />;
          },
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
          cell: (v) => <AirportInlineText airport={v.departureAirport} />,
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
          cell: (v) => <AirportInlineText airport={v.departureAirport} />,
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
            v.aircraft
              ? <AircraftType aircraftType={v.aircraft.iataCode ?? v.aircraft.id} aircraft={v.aircraft} />
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
          header: 'Codeshares',
          cell: (v) => {
            if (!v.codeShares || v.codeShares.length < 1) {
              return undefined;
            }

            let query = new URLSearchParams();
            query = withDepartureDateFilter(query, v.departureTime);
            query = withDepartureAirportIdFilter(query, v.departureAirport.id);

            return (
              <Join
                seperator={BulletSeperator}
                items={v.codeShares.map(([csAirline, csFn]) => <FlightLink flightNumber={flightNumberToString(csFn, csAirline)} query={query} target={'_blank'} />)}
              />
            );
          },
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

function connectionsToTableItems(
  connections: ReadonlyArray<ConnectionResponse>,
  flights: Record<string, ConnectionFlightResponse>,
  airlines: Record<AirlineId, Airline>,
  airports: Record<AirportId, Airport>,
  aircraft: Record<AircraftId, Aircraft>,
): ReadonlyArray<ConnectionsTableItem> {

  const result: Array<ConnectionsTableItem> = [];

  for (const expanded of expandConnections(connections, flights, airlines, airports, aircraft)) {
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

function expandConnections(
  conns: ReadonlyArray<ConnectionResponse>,
  flights: Record<string, ConnectionFlightResponse>,
  airlines: Record<AirlineId, Airline>,
  airports: Record<AirportId, Airport>,
  aircraft: Record<AircraftId, Aircraft>,
): ReadonlyArray<ReadonlyArray<ConnectionsTableChildItem>> {

  const result: Array<ReadonlyArray<ConnectionsTableChildItem>> = [];
  for (const conn of conns) {
    const flight = flights[conn.flightId];
    const departureTime = DateTime.fromISO(flight.departureTime, { setZone: true });
    const arrivalTime = DateTime.fromISO(flight.arrivalTime, { setZone: true });
    if (!departureTime.isValid || !arrivalTime.isValid) {
      throw new Error(`invalid departureTime/arrivalTime: ${flight.departureTime} / ${flight.arrivalTime}`);
    }

    const airline = airlines[flight.flightNumber.airlineId];
    const departureAirport = airports[flight.departureAirportId];
    const arrivalAirport = airports[flight.arrivalAirportId];
    const ac = aircraft[flight.aircraftId];
    const codeShares: Array<[Airline, FlightNumber]> = [];

    for (const fn of flight.codeShares) {
      codeShares.push([airlines[fn.airlineId], fn]);
    }

    if (airline && departureAirport && arrivalAirport && aircraft) {
      const item = {
        flightNumber: [airline, flight.flightNumber],
        departureTime: departureTime,
        departureAirport: departureAirport,
        arrivalTime: arrivalTime,
        arrivalAirport: arrivalAirport,
        aircraftOwner: flight.aircraftOwner,
        aircraft: ac,
        registration: flight.aircraftRegistration,
        codeShares: codeShares,
        children: undefined,
      } satisfies ConnectionsTableChildItem;

      if (conn.outgoing.length > 0) {
        for (const expanded of expandConnections(conn.outgoing, flights, airlines, airports, aircraft)) {
          result.push([
            item,
            ...expanded,
          ]);
        }
      } else {
        result.push([item]);
      }
    }
  }

  return result;
}