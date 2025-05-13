import React, { useMemo } from 'react';
import {
  Airport,
  ConnectionResponse,
  ConnectionsResponse,
  ConnectionFlightResponse,
  AirlineId, Airline, AircraftId, Aircraft, AirportId,
} from '../../lib/api/api.model';
import { MaplibreMap, PopupMarker, SmartLine } from '../maplibre/maplibre-map';
import { DateTime } from 'luxon';
import { ColumnLayout, KeyValuePairs, KeyValuePairsProps } from '@cloudscape-design/components';
import { FlightLink } from '../common/flight-link';
import { airportToString, flightNumberToString } from '../../lib/util/flight';

export interface ConnectionsMapProps {
  connections: ConnectionsResponse;
}

export function ConnectionsMap({ connections }: ConnectionsMapProps) {
  const [markers, lines] = useMemo(() => buildMarkersAndLines(connections), [connections]);

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

function buildMarkersAndLines(connections: ConnectionsResponse): [ReadonlyArray<React.ReactNode>, ReadonlyArray<React.ReactNode>] {
  const airportNodes = new Map<AirportId, AirportNode>();
  processConnections(connections.connections, connections.flights, connections.airlines, connections.airports, connections.aircraft, airportNodes);

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

  if (!markers.has(node.airport.id)) {
    markers.set(
      node.airport.id,
      (
        <PopupMarker
          longitude={node.airport.location?.lng ?? 0.0}
          latitude={node.airport.location?.lat ?? 0.0}
          button={{}}
          popover={{
            size: 'medium',
            header: node.airport.name,
            renderWithPortal: true,
            content: <AirportPopoverContent node={node} />,
          }}
        >{node.airport.iataCode ?? node.airport.icaoCode ?? node.airport.id}</PopupMarker>
      ),
    );
  }

  for (const connectedNode of node.connections) {
    const srcId = `${node.airport.id}-${connectedNode.airport.id}`;

    if (!lines.has(srcId)) {
      lines.set(
        srcId,
        (
          <SmartLine
            src={[node.airport.location?.lng ?? 0.0, node.airport.location?.lat ?? 0.0]}
            dst={[connectedNode.airport.location?.lng ?? 0.0, connectedNode.airport.location?.lat ?? 0.0]}
          />
        ),
      );
    }
  }
}

function processConnections(
  conns: ReadonlyArray<ConnectionResponse>,
  flights: Record<string, ConnectionFlightResponse>,
  airlines: Record<AirlineId, Airline>,
  airports: Record<AirportId, Airport>,
  aircraft: Record<AircraftId, Aircraft>,
  airportNodes: Map<AirportId, AirportNode>,
) {

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

    let departureNode = airportNodes.get(flight.departureAirportId);
    if (!departureNode) {
      departureNode = {
        airport: departureAirport,
        connections: [],
        incomingFlights: [],
        outgoingFlights: [],
      } satisfies AirportNode;

      airportNodes.set(flight.departureAirportId, departureNode);
    }

    let arrivalNode = airportNodes.get(flight.arrivalAirportId);
    if (!arrivalNode) {
      arrivalNode = {
        airport: arrivalAirport,
        connections: [],
        incomingFlights: [],
        outgoingFlights: [],
      } satisfies AirportNode;

      airportNodes.set(flight.arrivalAirportId, arrivalNode);
    }

    if (!departureNode.connections.includes(arrivalNode)) {
      departureNode.connections.push(arrivalNode);
    }

    const flightNumber = flightNumberToString(flight.flightNumber, airline);
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

    processConnections(conn.outgoing, flights, airlines, airports, aircraft, airportNodes);
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
              <FlightLink flightNumber={v.flightNumber} target={'_blank'}>
                {v.flightNumber}&nbsp;({airportToString(v.departureAirport.airport)})
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
              <FlightLink flightNumber={v.flightNumber} target={'_blank'}>
                {v.flightNumber}&nbsp;({airportToString(v.arrivalAirport.airport)})
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