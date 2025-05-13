import {
  Aircraft,
  ConnectionResponse,
  ConnectionsResponse,
  ConnectionFlightResponse,
  Airport, Airline, AirlineId, AirportId, AircraftId
} from '../../lib/api/api.model';
import {
  Background,
  Controls,
  Edge,
  getConnectedEdges,
  Handle,
  Node,
  NodeProps,
  NodeTypes,
  Position,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  useReactFlow
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import React, { useCallback, useEffect, useMemo } from 'react';
import Dagre from '@dagrejs/dagre';
import { DateTime } from 'luxon';
import { Box, Popover, SpaceBetween } from '@cloudscape-design/components';
import { KeyValuePairs, ValueWithLabel } from '../common/key-value-pairs';
import { airportToString, flightNumberToString } from '../../lib/util/flight';
import { BulletSeperator, Join } from '../common/join';
import { FlightLink } from '../common/flight-link';
import { usePreferences } from '../util/state/use-preferences';
import { ColorScheme } from '../../lib/preferences.model';

type FlightNodeData = {
  readonly type: 'flight';
  readonly flight: ConnectionFlightResponse;
  readonly airline: Airline;
  readonly departureAirport: Airport;
  readonly arrivalAirport: Airport;
  readonly aircraft: Aircraft;
  readonly airlineById: Record<AirlineId, Airline>;
}

type DepartureNodeData = {
  readonly type: 'departure';
  readonly airport: Airport;
  readonly label: string;
}

type ArrivalNodeData = {
  readonly type: 'arrival';
  readonly airport: Airport;
  readonly label: string;
}

type NodeData = FlightNodeData | DepartureNodeData | ArrivalNodeData;

type EdgeData = {
  readonly source?: ConnectionFlightResponse;
  readonly target?: ConnectionFlightResponse;
}

export interface ConnectionsGraphProps {
  connections: ConnectionsResponse;
}

export function ConnectionsGraph(props: ConnectionsGraphProps) {
  return (
    <ReactFlowProvider>
      <ConnectionsGraphInternal {...props} />
    </ReactFlowProvider>
  );
}

function ConnectionsGraphInternal({ connections }: ConnectionsGraphProps) {
  const [preferences] = usePreferences();

  const { fitView } = useReactFlow();
  const getLayoutedElements = useCallback((nodes: ReadonlyArray<Node<NodeData>>, edges: ReadonlyArray<Edge<EdgeData>>) => {
    const g = new Dagre.graphlib.Graph().setDefaultEdgeLabel(() => ({}));
    g.setGraph({ rankdir: 'LR', ranksep: 250 });

    edges.forEach((edge) => g.setEdge(edge.source, edge.target));
    nodes.forEach((node) => g.setNode(node.id, node as Dagre.Label));

    Dagre.layout(g);

    return {
      nodes: nodes.map((node) => {
        const { x, y } = g.node(node.id);
        return { ...node, position: { x, y } };
      }),
      edges: edges,
    };
  }, []);

  const nodeTypes = useMemo<NodeTypes>(() => ({
    flight: FlightNode,
  }), []);

  const [nodes, setNodes, onNodesChange] = useNodesState<Node<NodeData>>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge<EdgeData>>([]);

  useEffect(() => {
    const [nodes, edges] = convertToGraph(connections);
    const layouted = getLayoutedElements(nodes, edges);

    setNodes([...layouted.nodes]);
    setEdges([...layouted.edges]);

    window.requestAnimationFrame(() => {
      fitView().then(() => {});
    });
  }, [getLayoutedElements, connections]);

  return (
    <div style={{ width: '100%', height: '80vh' }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        nodeTypes={nodeTypes}
        fitView={true}
        onNodeClick={(_, node) => {
          const connectedEdges = getConnectedEdges([node], edges);
          const ids = connectedEdges.map((v) => v.id);

          setEdges((prev) => prev.map((edge) => ({ ...edge, animated: ids.includes(edge.id) })));
        }}
        colorMode={preferences.effectiveColorScheme === ColorScheme.DARK ? 'dark' : 'light'}
      >
        <Controls showFitView={true} showZoom={true} showInteractive={false} />
        <Background />
      </ReactFlow>
    </div>
  );
}

function FlightNode({ data }: NodeProps<Node<FlightNodeData>>) {
  const { flight, airline, departureAirport, arrivalAirport, aircraft, airlineById } = data;
  const departure = DateTime.fromISO(flight.departureTime, { setZone: true });
  const arrival = DateTime.fromISO(flight.arrivalTime, { setZone: true });
  const duration = arrival.diff(departure).rescale();
  const flightNumberFull = flightNumberToString(flight.flightNumber, airline);

  return (
    <>
      <SpaceBetween size={'xxl'} direction={'vertical'}>
        <Handle type="target" position={Position.Left} />
        <Popover header={flightNumberFull} size={'large'} content={<FlightPopoverContent flight={flight} airline={airline} departureAirport={departureAirport} arrivalAirport={arrivalAirport} aircraft={aircraft} airlineById={airlineById} />} fixedWidth={true} renderWithPortal={true}>
          <Box textAlign={'center'}>
            <Box>{flightNumberFull}</Box>
            <Box>{`${airportToString(departureAirport)} \u2014 ${airportToString(arrivalAirport)}`}</Box>
            <Box>{duration.toHuman({ unitDisplay: 'short' })}</Box>
          </Box>
        </Popover>
        <Handle type="source" position={Position.Right} />
      </SpaceBetween>
    </>
  )
}

function FlightPopoverContent({ flight, airline, departureAirport, arrivalAirport, aircraft, airlineById }: { flight: ConnectionFlightResponse, airline: Airline, departureAirport: Airport, arrivalAirport: Airport, aircraft: Aircraft, airlineById: Record<AirlineId, Airline> }) {
  let aircraftStr = aircraft.equipCode ?? aircraft.iataCode ?? aircraft.icaoCode ?? aircraft.id;
  if (aircraft.name) {
    aircraftStr += ` (${aircraft.name})`;
  }

  return (
    <KeyValuePairs columns={2}>
      <ValueWithLabel label={'Flight Number'}><FlightLink flightNumber={flightNumberToString(flight.flightNumber, airline)} target={'_blank'} /></ValueWithLabel>
      <ValueWithLabel label={'Departure Airport'}>{airportToString(departureAirport)}</ValueWithLabel>
      <ValueWithLabel label={'Departure Time'}>{DateTime.fromISO(flight.departureTime, { setZone: true }).toLocaleString(DateTime.DATETIME_FULL)}</ValueWithLabel>
      <ValueWithLabel label={'Arrival Airport'}>{airportToString(arrivalAirport)}</ValueWithLabel>
      <ValueWithLabel label={'Arrival Time'}>{DateTime.fromISO(flight.arrivalTime, { setZone: true }).toLocaleString(DateTime.DATETIME_FULL)}</ValueWithLabel>
      <ValueWithLabel label={'Aircraft'}>{aircraftStr}</ValueWithLabel>
      <ValueWithLabel label={'Aircraft Owner'}>{flight.aircraftOwner}</ValueWithLabel>
      <ValueWithLabel label={'Codeshares'}>
        <Join
          seperator={BulletSeperator}
          items={flight.codeShares.map((v) => <FlightLink flightNumber={flightNumberToString(v, airlineById[v.airlineId])} target={'_blank'} />)}
        />
      </ValueWithLabel>
    </KeyValuePairs>
  );
}

function convertToGraph(conns: ConnectionsResponse): [Array<Node<NodeData>>, Array<Edge<EdgeData>>] {
  const nodes: Array<Node<NodeData>> = [];
  const edges: Array<Edge<EdgeData>> = [];

  buildGraph(
    conns.connections,
    conns.flights,
    nodes,
    edges,
    new Map(),
    new Map(),
    conns.airlines,
    conns.airports,
    conns.aircraft,
  );

  return [nodes, edges];
}

function buildGraph(
  connections: ReadonlyArray<ConnectionResponse>,
  flights: Record<string, ConnectionFlightResponse>,
  nodes: Array<Node<NodeData>>,
  edges: Array<Edge<EdgeData>>,
  nodeLookup: Map<string, Node<NodeData>>,
  edgeLookup: Map<string, Edge<EdgeData>>,
  airlines: Record<AirlineId, Airline>,
  airports: Record<AirportId, Airport>,
  aircraft: Record<AircraftId, Aircraft>,
  parent?: string
) {
  for (const connection of connections) {
    const flight = flights[connection.flightId];

    if (!nodeLookup.has(connection.flightId)) {
      const node = {
        id: connection.flightId,
        type: 'flight',
        position: { x: 0, y: 0 },
        width: 137,
        height: 103,
        data: {
          type: 'flight',
          flight: flight,
          airline: airlines[flight.flightNumber.airlineId],
          departureAirport: airports[flight.departureAirportId],
          arrivalAirport: airports[flight.arrivalAirportId],
          aircraft: aircraft[flight.aircraftId],
          airlineById: airlines,
        },
        connectable: false,
        draggable: false,
      } satisfies Node<FlightNodeData>;

      nodeLookup.set(connection.flightId, node);
      nodes.push(node);
    }

    const departure = DateTime.fromISO(flight.departureTime, { setZone: true });

    if (parent === undefined) {
      const departureNodeId = `DEP-${flight.departureAirportId}`;

      if (!nodeLookup.has(departureNodeId)) {
        const departureAirport = airports[flight.departureAirportId];
        const node = {
          id: departureNodeId,
          type: 'input',
          sourcePosition: Position.Right,
          position: { x: 0, y: 0 },
          width: 200,
          height: 50,
          data: {
            type: 'departure',
            airport: departureAirport,
            label: airportToString(departureAirport),
          },
          connectable: false,
          draggable: false,
        } satisfies Node<DepartureNodeData>;

        nodeLookup.set(departureNodeId, node);
        nodes.push(node);
      }

      const edgeId = `${departureNodeId}-${connection.flightId}`;
      if (!edgeLookup.has(edgeId)) {
        const edge = {
          id: edgeId,
          source: departureNodeId,
          target: connection.flightId,
          label: departure.toLocaleString(DateTime.TIME_24_SIMPLE),
          data: {
            target: flight,
          },
          deletable: false,
          focusable: false,
        } satisfies Edge<EdgeData>;

        edgeLookup.set(edgeId, edge);
        edges.push(edge);
      }
    } else {
      const parentFlight = flights[parent];
      const parentArrival = DateTime.fromISO(parentFlight.arrivalTime, { setZone: true });
      const layover = departure.diff(parentArrival).rescale();
      const edgeId = `${parent}-${connection.flightId}`;

      if (!edgeLookup.has(edgeId)) {
        const edge = {
          id: edgeId,
          source: parent,
          target: connection.flightId,
          label: layover.toHuman({ unitDisplay: 'short' }),
          data: {
            source: parentFlight,
            target: flight,
          },
          deletable: false,
          focusable: false,
        } satisfies Edge<EdgeData>;

        edgeLookup.set(edgeId, edge);
        edges.push(edge);
      }
    }

    if (connection.outgoing.length > 0) {
      buildGraph(
        connection.outgoing,
        flights,
        nodes,
        edges,
        nodeLookup,
        edgeLookup,
        airlines,
        airports,
        aircraft,
        connection.flightId,
      );
    } else {
      const arrivalNodeId = `ARR-${flight.arrivalAirportId}`;

      if (!nodeLookup.has(arrivalNodeId)) {
        const arrivalAirport = airports[flight.arrivalAirportId];
        const node = {
          id: arrivalNodeId,
          type: 'output',
          targetPosition: Position.Left,
          position: { x: 0, y: 0 },
          width: 200,
          height: 50,
          data: {
            type: 'arrival',
            airport: arrivalAirport,
            label: airportToString(arrivalAirport),
          },
          connectable: false,
          draggable: false,
        } satisfies Node<ArrivalNodeData>;

        nodeLookup.set(arrivalNodeId, node);
        nodes.push(node);
      }

      const edgeId = `${connection.flightId}-${arrivalNodeId}`;
      if (!edgeLookup.has(edgeId)) {
        const arrival = DateTime.fromISO(flight.arrivalTime, { setZone: true });
        const edge = {
          id: edgeId,
          source: connection.flightId,
          target: arrivalNodeId,
          label: arrival.toLocaleString(DateTime.TIME_24_SIMPLE),
          data: {
            source: flight,
          },
          deletable: false,
          focusable: false,
        } satisfies Edge<EdgeData>;

        edgeLookup.set(edgeId, edge);
        edges.push(edge);
      }
    }
  }
}
