import { useMemo } from 'react';
import {
  Background,
  Controls,
  Handle,
  MarkerType,
  Position,
  ReactFlow,
  type Edge,
  type Node,
  type NodeProps,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import dagre from '@dagrejs/dagre';
import { Plane } from 'lucide-react';
import type { ConnectionBranch, ConnectionsData } from '@/api/types';
import { flightName, timeLabel } from '@/lib/format';

type FlightNode = Node<
  { flight: string; from: string; to: string; departure: string; arrival: string },
  'flight'
>;

export function ConnectionGraph({ data }: { data: ConnectionsData }) {
  const { nodes, edges } = useMemo(() => buildGraph(data), [data]);
  return (
    <div className='connection-graph'>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={{ flight: FlightNodeCard }}
        fitView
        minZoom={0.2}
        maxZoom={1.8}
        proOptions={{ hideAttribution: true }}
      >
        <Background gap={28} size={1} />
        <Controls />
      </ReactFlow>
    </div>
  );
}

function FlightNodeCard({ data }: NodeProps<FlightNode>) {
  return (
    <div className='graph-node'>
      <Handle type='target' position={Position.Left} />
      <div className='graph-node-head'>
        <Plane size={14} /> {data.flight}
      </div>
      <div className='graph-airports'>
        <strong>{data.from}</strong>
        <span>→</span>
        <strong>{data.to}</strong>
      </div>
      <div className='graph-times'>
        <span>{data.departure}</span>
        <span>{data.arrival}</span>
      </div>
      <Handle type='source' position={Position.Right} />
    </div>
  );
}

function buildGraph(data: ConnectionsData): { nodes: FlightNode[]; edges: Edge[] } {
  const nodes = new Map<string, FlightNode>();
  const edges = new Map<string, Edge>();
  function visit(branch: ConnectionBranch, parent?: string) {
    const flight = data.flights[branch.flightId];
    if (!flight) {
      return;
    }
    if (!nodes.has(branch.flightId)) {
      nodes.set(branch.flightId, {
        id: branch.flightId,
        type: 'flight',
        position: { x: 0, y: 0 },
        data: {
          flight: flightName(flight.flightNumber, data.airlines),
          from: data.airports[flight.departureAirportId]?.iataCode ?? flight.departureAirportId,
          to: data.airports[flight.arrivalAirportId]?.iataCode ?? flight.arrivalAirportId,
          departure: timeLabel(flight.departureTime),
          arrival: timeLabel(flight.arrivalTime),
        },
      });
    }
    if (parent) {
      const id = `${parent}-${branch.flightId}`;
      edges.set(id, {
        id,
        source: parent,
        target: branch.flightId,
        markerEnd: { type: MarkerType.ArrowClosed },
        animated: false,
      });
    }
    branch.outgoing.forEach((child) => visit(child, branch.flightId));
  }
  data.connections.forEach((root) => visit(root));
  const graph = new dagre.graphlib.Graph()
    .setDefaultEdgeLabel(() => ({}))
    .setGraph({ rankdir: 'LR', nodesep: 34, ranksep: 90 });
  nodes.forEach((_, id) => graph.setNode(id, { width: 190, height: 104 }));
  edges.forEach((edge) => graph.setEdge(edge.source, edge.target));
  dagre.layout(graph);
  nodes.forEach((node, id) => {
    const p = graph.node(id);
    node.position = { x: p.x - 95, y: p.y - 52 };
  });
  return { nodes: [...nodes.values()], edges: [...edges.values()] };
}
