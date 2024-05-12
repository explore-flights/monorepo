import { Aircraft, Connection, Connections, Flight } from '../../lib/api/api.model';
import {
  Background,
  Controls,
  Edge,
  getConnectedEdges, Handle,
  Node, NodeProps, Position,
  ReactFlow, ReactFlowProvider,
  useEdgesState,
  useNodesState,
  useReactFlow
} from 'reactflow';
import React, { useCallback, useEffect, useMemo } from 'react';
import Dagre from '@dagrejs/dagre';
import { DateTime } from 'luxon';
import { Box, Popover, SpaceBetween } from '@cloudscape-design/components';
import { KeyValuePairs, ValueWithLabel } from '../common/key-value-pairs';
import { flightNumberToString } from '../../lib/util/flight';

interface FlightNodeData {
  readonly type: 'flight';
  readonly flight: Flight;
  readonly aircraft?: Aircraft;
}

interface DepartureNodeData {
  readonly type: 'departure';
  readonly airport: string;
  readonly label: string;
}

interface ArrivalNodeData {
  readonly type: 'arrival';
  readonly airport: string;
  readonly label: string;
}

type NodeData = FlightNodeData | DepartureNodeData | ArrivalNodeData;

interface EdgeData {
  readonly source?: Flight;
  readonly target?: Flight;
}

export interface ConnectionsGraphProps {
  connections: Connections;
  aircraftLookup?: Record<string, Aircraft>;
}

export function ConnectionsGraph(props: ConnectionsGraphProps) {
  return (
    <ReactFlowProvider>
      <ConnectionsGraphInternal {...props} />
    </ReactFlowProvider>
  );
}

function ConnectionsGraphInternal({ connections, aircraftLookup }: ConnectionsGraphProps) {
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

  const nodeTypes = useMemo(() => ({
    flight: FlightNode,
  }), []);

  const [nodes, setNodes, onNodesChange] = useNodesState<NodeData>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<EdgeData>([]);

  useEffect(() => {
    const [nodes, edges] = convertToGraph(connections, aircraftLookup);
    const layouted = getLayoutedElements(nodes, edges);

    setNodes([...layouted.nodes]);
    setEdges([...layouted.edges]);

    window.requestAnimationFrame(() => {
      fitView();
    });
  }, [getLayoutedElements, connections, aircraftLookup]);

  return (
    <div style={{ width: '100%', height: '750px' }}>
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

          setEdges((prev) => prev.map((edge) => {
            edge.animated = ids.includes(edge.id);
            return edge;
          }));
        }}
      >
        <Controls />
        <Background />
      </ReactFlow>
    </div>
  );
}

function FlightNode({ data }: NodeProps<FlightNodeData>) {
  const { flight, aircraft } = data;
  const departure = DateTime.fromISO(flight.departureTime, { setZone: true });
  const arrival = DateTime.fromISO(flight.arrivalTime, { setZone: true });
  const duration = arrival.diff(departure).rescale();
  const flightNumberFull = flightNumberToString(flight.flightNumber);

  return (
    <>
      <SpaceBetween size={'xxl'} direction={'vertical'}>
        <Handle type="target" position={Position.Left} />
        <Popover header={flightNumberFull} size={'large'} content={<FlightPopoverContent flight={flight} aircraft={aircraft} />} fixedWidth={true} renderWithPortal={true}>
          <Box textAlign={'center'}>
            <Box>{flightNumberFull}</Box>
            <Box>{`${flight.departureAirport} - ${flight.arrivalAirport}`}</Box>
            <Box>{duration.toHuman({ unitDisplay: 'short' })}</Box>
          </Box>
        </Popover>
        <Handle type="source" position={Position.Right} />
      </SpaceBetween>
    </>
  )
}

function FlightPopoverContent({ flight, aircraft }: { flight: Flight, aircraft?: Aircraft }) {
  const codeSharesStr = flight.codeShares.map(flightNumberToString).join(', ');
  let aircraftStr = flight.aircraftType;

  if (aircraft) {
    aircraftStr += ` (${aircraft.name})`;
  }

  return (
    <KeyValuePairs columns={2}>
      <ValueWithLabel label={'Departure Airport'}>{flight.departureAirport}</ValueWithLabel>
      <ValueWithLabel label={'Departure Time'}>{DateTime.fromISO(flight.departureTime, { setZone: true }).toLocaleString(DateTime.DATETIME_FULL)}</ValueWithLabel>
      <ValueWithLabel label={'Arrival Airport'}>{flight.arrivalAirport}</ValueWithLabel>
      <ValueWithLabel label={'Arrival Time'}>{DateTime.fromISO(flight.arrivalTime, { setZone: true }).toLocaleString(DateTime.DATETIME_FULL)}</ValueWithLabel>
      <ValueWithLabel label={'Aircraft Type'}>{aircraftStr}</ValueWithLabel>
      <ValueWithLabel label={'Aircraft Owner'}>{flight.aircraftOwner}</ValueWithLabel>
      <ValueWithLabel label={'Registration'}>{flight.registration ?? 'UNKNOWN'}</ValueWithLabel>
      <ValueWithLabel label={'Code Shares'}>{codeSharesStr}</ValueWithLabel>
    </KeyValuePairs>
  );
}

function convertToGraph(conns: Connections, aircraftLookup?: Record<string, Aircraft>): [Array<Node<NodeData>>, Array<Edge<EdgeData>>] {
  const nodes: Array<Node<NodeData>> = [];
  const edges: Array<Edge<EdgeData>> = [];

  buildGraph(
    conns.connections,
    conns.flights,
    nodes,
    edges,
    new Map(),
    new Map(),
    aircraftLookup,
  );

  return [nodes, edges];
}

function buildGraph(
  connections: ReadonlyArray<Connection>,
  flights: Record<string, Flight>,
  nodes: Array<Node<NodeData>>,
  edges: Array<Edge<EdgeData>>,
  nodeLookup: Map<string, Node<NodeData>>,
  edgeLookup: Map<string, Edge<EdgeData>>,
  aircraftLookup?: Record<string, Aircraft>,
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
          aircraft: (aircraftLookup ? aircraftLookup[flight.aircraftType] : undefined) ?? undefined,
        },
      } satisfies Node<FlightNodeData>;

      nodeLookup.set(connection.flightId, node);
      nodes.push(node);
    }

    const departure = DateTime.fromISO(flight.departureTime, { setZone: true });

    if (parent === undefined) {
      const departureNodeId = `DEP-${flight.departureAirport}`;

      if (!nodeLookup.has(departureNodeId)) {
        const node = {
          id: departureNodeId,
          type: 'input',
          sourcePosition: Position.Right,
          position: { x: 0, y: 0 },
          width: 200,
          height: 50,
          data: {
            type: 'departure',
            airport: flight.departureAirport,
            label: flight.departureAirport,
          },
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
        aircraftLookup,
        connection.flightId,
      );
    } else {
      const arrivalNodeId = `ARR-${flight.arrivalAirport}`;

      if (!nodeLookup.has(arrivalNodeId)) {
        const node = {
          id: arrivalNodeId,
          type: 'output',
          targetPosition: Position.Left,
          position: { x: 0, y: 0 },
          width: 200,
          height: 50,
          data: {
            type: 'arrival',
            airport: flight.arrivalAirport,
            label: flight.arrivalAirport,
          },
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
        } satisfies Edge<EdgeData>;

        edgeLookup.set(edgeId, edge);
        edges.push(edge);
      }
    }
  }
}
