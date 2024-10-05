import React, { useMemo } from 'react';
import { Aircraft, Airport, Airports, Connection, Connections, Flight } from '../../lib/api/api.model';
import { MaplibreMap, PopupMarker, SmartLine } from '../maplibre/maplibre-map';
import { DateTime } from 'luxon';
import { ColumnLayout, KeyValuePairs, KeyValuePairsProps } from '@cloudscape-design/components';
import { FlightLink } from '../common/flight-link';

export interface ConnectionsMapProps {
  connections: Connections;
  airports: Airports;
  aircraftLookup?: Record<string, Aircraft>;
}

export function ConnectionsMap({ connections, airports, aircraftLookup }: ConnectionsMapProps) {
  const [markers, lines] = useMemo(
    () => buildMarkersAndLines(connections, airports, aircraftLookup ?? {}),
    [connections, airports, aircraftLookup]
  );

  return (
    <MaplibreMap height={'80vh'}>
      {...markers}
      {...lines}
    </MaplibreMap>
  );
}

interface ParsedFlight {
  flightNumber: string;
  departureAirport: AirportNode;
  arrivalAirport: AirportNode;
}

interface AirportNode {
  airport: Airport;
  connections: Array<AirportNode>;
  incomingFlights: Array<ParsedFlight>;
  outgoingFlights: Array<ParsedFlight>;
}

function buildMarkersAndLines(connections: Connections, airports: Airports, aircraftLookup: Record<string, Aircraft>): [ReadonlyArray<React.ReactNode>, ReadonlyArray<React.ReactNode>] {
  const airportNodes = new Map<string, AirportNode>();
  processConnections(connections.connections, connections.flights, buildAirportLookup(airports), aircraftLookup, airportNodes);

  const markers = new Map<string, React.ReactNode>();
  const lines = new Map<string, React.ReactNode>();

  for (const node of airportNodes.values()) {
    toMarkersAndLines(node, markers, lines);
  }

  return [
    Array.from(markers.values()),
    Array.from(lines.values()),
  ];
}

function toMarkersAndLines(
  node: AirportNode,
  markers: Map<string, React.ReactNode>,
  lines: Map<string, React.ReactNode>,
) {

  if (!markers.has(node.airport.code)) {
    markers.set(
      node.airport.code,
      (
        <PopupMarker
          longitude={node.airport.lng}
          latitude={node.airport.lat}
          button={{}}
          popover={{
            size: 'medium',
            header: node.airport.name,
            renderWithPortal: true,
            content: <AirportPopoverContent node={node} />,
          }}
        >{node.airport.code}</PopupMarker>
      ),
    );
  }

  for (const connectedNode of node.connections) {
    const srcId = `${node.airport.code}-${connectedNode.airport.code}`;

    if (!lines.has(srcId)) {
      lines.set(
        srcId,
        (
          <SmartLine src={[node.airport.lng, node.airport.lat]} dst={[connectedNode.airport.lng, connectedNode.airport.lat]} />
        ),
      );
    }
  }
}

function buildAirportLookup(airports: Airports): Record<string, Airport> {
  const result: Record<string, Airport> = {};

  for (const airport of airports.airports) {
    result[airport.code] = airport;
  }

  for (const metroArea of airports.metropolitanAreas) {
    for (const airport of metroArea.airports) {
      result[airport.code] = airport;
    }
  }

  return result;
}

function processConnections(
  conns: ReadonlyArray<Connection>,
  flights: Record<string, Flight>,
  airportLookup: Record<string, Airport>,
  aircraftLookup: Record<string, Aircraft>,
  airportNodes: Map<string, AirportNode>,
) {

  for (const conn of conns) {
    const flight = flights[conn.flightId];
    const departureTime = DateTime.fromISO(flight.departureTime, { setZone: true });
    const arrivalTime = DateTime.fromISO(flight.arrivalTime, { setZone: true });
    if (!departureTime.isValid || !arrivalTime.isValid) {
      throw new Error(`invalid departureTime/arrivalTime: ${flight.departureTime} / ${flight.arrivalTime}`);
    }

    const departureAirport = airportLookup[flight.departureAirport];
    const arrivalAirport = airportLookup[flight.arrivalAirport];

    if (departureAirport && arrivalAirport) {
      let departureNode = airportNodes.get(flight.departureAirport);
      if (!departureNode) {
        departureNode = {
          airport: departureAirport,
          connections: [],
          incomingFlights: [],
          outgoingFlights: [],
        } satisfies AirportNode;

        airportNodes.set(flight.departureAirport, departureNode);
      }

      let arrivalNode = airportNodes.get(flight.arrivalAirport);
      if (!arrivalNode) {
        arrivalNode = {
          airport: arrivalAirport,
          connections: [],
          incomingFlights: [],
          outgoingFlights: [],
        } satisfies AirportNode;

        airportNodes.set(flight.arrivalAirport, arrivalNode);
      }

      if (!departureNode.connections.includes(arrivalNode)) {
        departureNode.connections.push(arrivalNode);
      }

      const flightNumber = `${flight.flightNumber.airline}${flight.flightNumber.number}${flight.flightNumber.suffix ?? ''}`;
      const parsedFlight = {
        flightNumber: flightNumber,
        departureAirport: departureNode,
        arrivalAirport: arrivalNode,
      } satisfies ParsedFlight;

      if (departureNode.outgoingFlights.findIndex((v) => v.flightNumber === flightNumber) === -1) {
        departureNode.outgoingFlights.push(parsedFlight);
      }

      if (arrivalNode.incomingFlights.findIndex((v) => v.flightNumber === flightNumber) === -1) {
        arrivalNode.incomingFlights.push(parsedFlight);
      }
    }

    processConnections(conn.outgoing, flights, airportLookup, aircraftLookup, airportNodes);
  }
}

function AirportPopoverContent({ node }: { node: AirportNode }) {
  const items = useMemo(() => {
    const result: Array<KeyValuePairsProps.Item> = [];
    if (node.incomingFlights.length > 0) {
      result.push({
        label: `Incoming Flights (${node.incomingFlights.length})`,
        value: (
          <ColumnLayout columns={Math.min(Math.max(node.incomingFlights.length, 1), 4)} variant={'text-grid'}>
            {...node.incomingFlights.map((v) => (
              <FlightLink flightNumber={v.flightNumber} target={'_blank'} external={true}>
                {v.flightNumber}&nbsp;({v.departureAirport.airport.code})
              </FlightLink>
            ))}
          </ColumnLayout>
        ),
      });
    }

    if (node.outgoingFlights.length > 0) {
      result.push({
        label: `Outgoing Flights (${node.outgoingFlights.length})`,
        value: (
          <ColumnLayout columns={Math.min(Math.max(node.outgoingFlights.length, 1), 4)} variant={'text-grid'}>
            {...node.outgoingFlights.map((v) => (
              <FlightLink flightNumber={v.flightNumber} target={'_blank'} external={true}>
                {v.flightNumber}&nbsp;({v.arrivalAirport.airport.code})
              </FlightLink>
            ))}
          </ColumnLayout>
        ),
      });
    }

    return result;
  }, [node]);

  return (
    <KeyValuePairs columns={2} items={items} />
  );
}