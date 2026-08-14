import dagre from '@dagrejs/dagre';
import { d3Curve, defineChart, dot, link, rect, text } from '@tanstack/charts';
import { decorative } from '@tanstack/charts/mark/decorative';
import { Chart } from '@tanstack/charts/react';
import { scaleLinear } from '@tanstack/charts/scales/linear';
import { select } from 'd3-selection';
import { curveBumpX } from 'd3-shape';
import { zoom, zoomIdentity, type D3ZoomEvent, type ZoomBehavior } from 'd3-zoom';
import { Maximize2, Minus, Plus } from 'lucide-react';
import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { ConnectionBranch, ConnectionsData } from '@/api/types';
import { duration, flightName, timeLabel } from '@/lib/format';

const nodeWidth = 190;
const nodeHeight = 104;
const graphPadding = 32;
const horizontalNodeSeparation = 180;
const minZoom = 0.2;
const maxZoom = 1.8;
const zoomStep = 1.25;
const keyboardPanStep = 48;
const edgeEndpointRadius = 4;
const edgeLabelHeight = 22;
const edgeLabelCharacterWidth = 7;
const edgeLabelPadding = 12;
const edgeLabelMinimumWidth = 38;

interface GraphCamera {
  x: number;
  y: number;
  scale: number;
}

interface GraphViewport {
  width: number;
  height: number;
  camera: GraphCamera;
}

interface FlightGraphNode {
  id: string;
  x: number;
  y: number;
  left: number;
  right: number;
  top: number;
  bottom: number;
  headerBottom: number;
  flightY: number;
  routeY: number;
  timeY: number;
  flight: string;
  route: string;
  departure: string;
  arrival: string;
}

type FlightGraphNodePresentation = 'default' | 'connected' | 'active' | 'muted';

interface PresentedFlightGraphNode extends FlightGraphNode {
  presentation: FlightGraphNodePresentation;
}

interface FlightGraphEdge {
  id: string;
  sourceId: string;
  targetId: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  layoverSeconds: number | undefined;
  layoverLabel: string | undefined;
  labelX: number | undefined;
  labelY: number | undefined;
  labelLeft: number | undefined;
  labelRight: number | undefined;
  labelTop: number | undefined;
  labelBottom: number | undefined;
}

interface FlightGraphLayout {
  width: number;
  height: number;
  nodes: FlightGraphNode[];
  edges: FlightGraphEdge[];
}

interface FlightGraphView {
  nodes: PresentedFlightGraphNode[];
  edges: FlightGraphEdge[];
}

export function ConnectionGraph({ data }: { data: ConnectionsData }) {
  const layout = useMemo(() => buildGraph(data), [data]);
  const layoutKey = useMemo(
    () =>
      [...layout.nodes.map((node) => node.id), ...layout.edges.map((edge) => edge.id)].join('|'),
    [layout],
  );

  return <InteractiveConnectionGraph key={layoutKey} layout={layout} />;
}

function InteractiveConnectionGraph({ layout }: { layout: FlightGraphLayout }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const interactionRef = useRef<HTMLDivElement>(null);
  const zoomBehaviorRef = useRef<ZoomBehavior<HTMLDivElement, undefined>>(null);
  const syncingZoomRef = useRef(false);
  const [isActive, setIsActive] = useState(false);
  const [activeNodeId, setActiveNodeId] = useState<string>();
  const [viewport, setViewport] = useState<GraphViewport>({
    width: 0,
    height: 0,
    camera: { x: 0, y: 0, scale: 1 },
  });
  const graphView = useMemo(() => selectGraphView(layout, activeNodeId), [activeNodeId, layout]);

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }

    const observer = new ResizeObserver(([entry]) => {
      if (!entry) {
        return;
      }

      const width = Math.round(entry.contentRect.width);
      const height = Math.round(entry.contentRect.height);
      if (width <= 0 || height <= 0) {
        return;
      }

      setViewport((current) => resizeViewport(current, width, height, layout));
    });
    observer.observe(container);

    return () => observer.disconnect();
  }, [layout]);

  useLayoutEffect(() => {
    const interaction = interactionRef.current;
    if (!interaction || viewport.width <= 0 || viewport.height <= 0) {
      return;
    }

    const behavior = zoom<HTMLDivElement, undefined>()
      .scaleExtent([minZoom, maxZoom])
      .extent([
        [0, 0],
        [viewport.width, viewport.height],
      ])
      .translateExtent([
        [-graphPadding, -graphPadding],
        [layout.width + graphPadding, layout.height + graphPadding],
      ])
      .clickDistance(4)
      .touchable(true)
      .filter((event: MouseEvent | TouchEvent | WheelEvent) => {
        if (event.type === 'wheel') {
          return interaction.ownerDocument.activeElement === interaction;
        }

        if ('button' in event && event.button !== 0) {
          return false;
        }

        return !event.ctrlKey;
      })
      .on('zoom.connection-graph', (event: D3ZoomEvent<HTMLDivElement, undefined>) => {
        if (syncingZoomRef.current) {
          return;
        }

        setViewport((current) => ({
          ...current,
          camera: {
            x: event.transform.x,
            y: event.transform.y,
            scale: event.transform.k,
          },
        }));
      });

    const selection = select<HTMLDivElement, undefined>(interaction);
    selection.call(behavior);
    zoomBehaviorRef.current = behavior;

    return () => {
      selection.on('.zoom', null);
      zoomBehaviorRef.current = null;
    };
  }, [layout, viewport.height, viewport.width]);

  useLayoutEffect(() => {
    const interaction = interactionRef.current;
    const behavior = zoomBehaviorRef.current;
    if (!interaction || !behavior) {
      return;
    }

    syncingZoomRef.current = true;
    select<HTMLDivElement, undefined>(interaction).call(
      behavior.transform,
      zoomIdentity.translate(viewport.camera.x, viewport.camera.y).scale(viewport.camera.scale),
    );
    syncingZoomRef.current = false;
  }, [viewport.camera]);

  const zoomBy = useCallback((factor: number) => {
    const interaction = interactionRef.current;
    const behavior = zoomBehaviorRef.current;
    if (!interaction || !behavior) {
      return;
    }

    select<HTMLDivElement, undefined>(interaction).call(behavior.scaleBy, factor);
  }, []);

  const panBy = useCallback((x: number, y: number) => {
    const interaction = interactionRef.current;
    const behavior = zoomBehaviorRef.current;
    if (!interaction || !behavior) {
      return;
    }

    select<HTMLDivElement, undefined>(interaction).call(behavior.translateBy, x, y);
  }, []);

  const fitGraph = useCallback(() => {
    setViewport((current) => ({
      ...current,
      camera: fitCamera(layout, current.width, current.height),
    }));
  }, [layout]);

  const toggleNode = useCallback((nodeId: string) => {
    setActiveNodeId((current) => (current === nodeId ? undefined : nodeId));
  }, []);

  const handleNodeKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLButtonElement>, nodeId: string) => {
      if (event.key !== 'Enter' && event.key !== ' ') {
        return;
      }

      event.preventDefault();
      toggleNode(nodeId);
    },
    [toggleNode],
  );

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      switch (event.key) {
        case 'ArrowLeft':
          panBy(keyboardPanStep / viewport.camera.scale, 0);
          break;
        case 'ArrowRight':
          panBy(-keyboardPanStep / viewport.camera.scale, 0);
          break;
        case 'ArrowUp':
          panBy(0, keyboardPanStep / viewport.camera.scale);
          break;
        case 'ArrowDown':
          panBy(0, -keyboardPanStep / viewport.camera.scale);
          break;
        case '+':
        case '=':
          zoomBy(zoomStep);
          break;
        case '-':
        case '_':
          zoomBy(1 / zoomStep);
          break;
        case '0':
        case 'Home':
          fitGraph();
          break;
        case 'Escape':
          interactionRef.current?.blur();
          return;
        default:
          return;
      }

      event.preventDefault();
    },
    [fitGraph, panBy, viewport.camera.scale, zoomBy],
  );

  const definition = useMemo(
    () =>
      defineChart({
        marks: [
          decorative(
            link(graphView.edges, {
              x1: 'x1',
              y1: 'y1',
              x2: 'x2',
              y2: 'y2',
              key: 'id',
              stroke: 'var(--border-strong)',
              strokeWidth: 1.5,
              curve: d3Curve(curveBumpX),
              lineCap: 'round',
            }),
          ),
          decorative(
            dot(graphView.edges, {
              x: 'x1',
              y: 'y1',
              key: 'id',
              r: edgeEndpointRadius,
              fill: 'var(--primary)',
              stroke: 'var(--surface)',
              strokeWidth: 2,
            }),
          ),
          decorative(
            dot(graphView.edges, {
              x: 'x2',
              y: 'y2',
              key: 'id',
              r: edgeEndpointRadius,
              fill: 'var(--primary)',
              stroke: 'var(--surface)',
              strokeWidth: 2,
            }),
          ),
          decorative(
            rect(graphView.edges, {
              x1: 'labelLeft',
              x2: 'labelRight',
              y1: 'labelTop',
              y2: 'labelBottom',
              key: 'id',
              fill: 'var(--surface)',
              stroke: 'var(--border)',
              strokeWidth: 1,
              radius: edgeLabelHeight / 2,
            }),
          ),
          decorative(
            text(graphView.edges, {
              x: 'labelX',
              y: 'labelY',
              text: 'layoverLabel',
              key: 'id',
              dy: 4,
              anchor: 'middle',
              fill: 'var(--text-2)',
              fontSize: 12,
              fontWeight: 700,
            }),
          ),
          decorative(
            rect(
              graphView.nodes.filter((node) => node.presentation !== 'muted'),
              {
                x1: 'left',
                x2: 'right',
                y1: 'top',
                y2: 'bottom',
                key: 'id',
                fill: 'var(--surface)',
                stroke: 'var(--border-strong)',
                strokeWidth: 1,
                radius: 8,
              },
            ),
          ),
          decorative(
            rect(
              graphView.nodes.filter((node) => node.presentation === 'muted'),
              {
                x1: 'left',
                x2: 'right',
                y1: 'top',
                y2: 'bottom',
                key: 'id',
                fill: 'var(--surface-2)',
                stroke: 'var(--border)',
                strokeWidth: 1,
                radius: 8,
              },
            ),
          ),
          decorative(
            rect(
              graphView.nodes.filter((node) => node.presentation !== 'muted'),
              {
                x1: 'left',
                x2: 'right',
                y1: 'top',
                y2: 'headerBottom',
                key: 'id',
                fill: 'var(--primary-soft)',
                radius: 8,
              },
            ),
          ),
          decorative(
            rect(
              graphView.nodes.filter((node) => node.presentation === 'muted'),
              {
                x1: 'left',
                x2: 'right',
                y1: 'top',
                y2: 'headerBottom',
                key: 'id',
                fill: 'var(--surface-3)',
                radius: 8,
              },
            ),
          ),
          decorative(
            rect(
              graphView.nodes.filter((node) => node.presentation === 'active'),
              {
                x1: 'left',
                x2: 'right',
                y1: 'top',
                y2: 'bottom',
                key: 'id',
                fill: 'transparent',
                stroke: 'var(--primary)',
                strokeWidth: 3,
                radius: 8,
              },
            ),
          ),
          decorative(
            text(graphView.nodes, {
              x: 'left',
              y: 'flightY',
              text: 'flight',
              key: 'id',
              dx: 10,
              anchor: 'start',
              fill: nodeFlightTextFill,
              fontSize: 12,
              fontWeight: 750,
            }),
          ),
          decorative(
            text(graphView.nodes, {
              x: 'x',
              y: 'routeY',
              text: 'route',
              key: 'id',
              anchor: 'middle',
              fill: nodeRouteTextFill,
              fontSize: 16,
              fontWeight: 750,
            }),
          ),
          decorative(
            text(graphView.nodes, {
              x: 'left',
              y: 'timeY',
              text: 'departure',
              key: 'id',
              dx: 12,
              anchor: 'start',
              fill: 'var(--muted)',
              fontSize: 12,
            }),
          ),
          decorative(
            text(graphView.nodes, {
              x: 'right',
              y: 'timeY',
              text: 'arrival',
              key: 'id',
              dx: -12,
              anchor: 'end',
              fill: 'var(--muted)',
              fontSize: 12,
            }),
          ),
        ],
        x: { scale: scaleLinear().domain([0, layout.width]) },
        y: { scale: scaleLinear().domain([layout.height, 0]) },
        guides: false,
        margin: 0,
        keyboard: false,
      }),
    [graphView, layout.height, layout.width],
  );

  const chartTransform = `translate(${viewport.camera.x}px, ${viewport.camera.y}px) scale(${viewport.camera.scale})`;
  const interactionClassName = isActive
    ? 'connection-graph-interaction is-active'
    : 'connection-graph-interaction';

  return (
    <div ref={containerRef} className='connection-graph'>
      {viewport.width > 0 && viewport.height > 0 && (
        <Chart
          definition={definition}
          width={layout.width}
          height={layout.height}
          className='connection-tanstack-chart'
          style={{ transform: chartTransform }}
          ariaLabel='Flight connection graph'
          ariaDescription='Curved links connect flights that can be taken in sequence. Dots mark each link endpoint, and link labels show the layover time. Select a flight to show only its incoming and outgoing connection paths. The list view provides the same journeys as text.'
        />
      )}
      <div
        ref={interactionRef}
        className={interactionClassName}
        role='application'
        tabIndex={0}
        aria-label='Navigate flight connection graph'
        aria-keyshortcuts='ArrowLeft ArrowRight ArrowUp ArrowDown + - Home 0 Escape'
        onFocus={() => setIsActive(true)}
        onBlur={() => setIsActive(false)}
        onPointerDown={(event) => event.currentTarget.focus({ preventScroll: true })}
        onKeyDown={handleKeyDown}
      />
      <div
        className='connection-graph-node-actions'
        style={{
          width: layout.width,
          height: layout.height,
          transform: chartTransform,
        }}
      >
        {layout.nodes.map((node) => {
          const selected = node.id === activeNodeId;
          const actionLabel = selected
            ? `Show all connections; ${node.flight} ${node.route} is selected`
            : `Show connections for ${node.flight} ${node.route}`;

          return (
            <button
              key={node.id}
              type='button'
              className='connection-graph-node-action'
              style={{
                left: node.left,
                top: node.top,
                width: nodeWidth,
                height: nodeHeight,
              }}
              title={actionLabel}
              aria-label={actionLabel}
              aria-pressed={selected}
              onClick={() => toggleNode(node.id)}
              onKeyDown={(event) => handleNodeKeyDown(event, node.id)}
            />
          );
        })}
      </div>
      <div
        className='connection-graph-controls'
        role='toolbar'
        aria-label='Graph navigation controls'
        aria-orientation='vertical'
      >
        <button type='button' onClick={() => zoomBy(zoomStep)} aria-label='Zoom in' title='Zoom in'>
          <Plus aria-hidden='true' />
        </button>
        <button
          type='button'
          onClick={() => zoomBy(1 / zoomStep)}
          aria-label='Zoom out'
          title='Zoom out'
        >
          <Minus aria-hidden='true' />
        </button>
        <button
          type='button'
          onClick={fitGraph}
          aria-label='Fit graph to view'
          title='Fit graph to view'
        >
          <Maximize2 aria-hidden='true' />
        </button>
      </div>
    </div>
  );
}

function resizeViewport(
  current: GraphViewport,
  width: number,
  height: number,
  layout: FlightGraphLayout,
): GraphViewport {
  if (current.width <= 0 || current.height <= 0) {
    return { width, height, camera: fitCamera(layout, width, height) };
  }

  if (current.width === width && current.height === height) {
    return current;
  }

  const worldCenterX = (current.width / 2 - current.camera.x) / current.camera.scale;
  const worldCenterY = (current.height / 2 - current.camera.y) / current.camera.scale;

  return {
    width,
    height,
    camera: {
      x: width / 2 - worldCenterX * current.camera.scale,
      y: height / 2 - worldCenterY * current.camera.scale,
      scale: current.camera.scale,
    },
  };
}

function fitCamera(layout: FlightGraphLayout, width: number, height: number): GraphCamera {
  if (width <= 0 || height <= 0) {
    return { x: 0, y: 0, scale: 1 };
  }

  const availableWidth = Math.max(width - graphPadding * 2, 1);
  const availableHeight = Math.max(height - graphPadding * 2, 1);
  const scale = Math.min(
    maxZoom,
    Math.max(minZoom, Math.min(availableWidth / layout.width, availableHeight / layout.height)),
  );

  return {
    x: (width - layout.width * scale) / 2,
    y: (height - layout.height * scale) / 2,
    scale,
  };
}

function selectGraphView(
  layout: FlightGraphLayout,
  activeNodeId: string | undefined,
): FlightGraphView {
  if (!activeNodeId) {
    return {
      nodes: layout.nodes.map((node) => ({ ...node, presentation: 'default' })),
      edges: layout.edges,
    };
  }

  const incomingEdges = new Map<string, FlightGraphEdge[]>();
  const outgoingEdges = new Map<string, FlightGraphEdge[]>();
  for (const edge of layout.edges) {
    addEdgeToIndex(incomingEdges, edge.targetId, edge);
    addEdgeToIndex(outgoingEdges, edge.sourceId, edge);
  }

  const visibleEdgeIds = new Set<string>();
  collectDirectedEdges(activeNodeId, incomingEdges, (edge) => edge.sourceId, visibleEdgeIds);
  collectDirectedEdges(activeNodeId, outgoingEdges, (edge) => edge.targetId, visibleEdgeIds);

  const visibleEdges = positionEdgeLabels(
    layout.edges.filter((edge) => visibleEdgeIds.has(edge.id)),
  );
  const connectedNodeIds = new Set<string>([activeNodeId]);
  for (const edge of visibleEdges) {
    connectedNodeIds.add(edge.sourceId);
    connectedNodeIds.add(edge.targetId);
  }

  return {
    nodes: layout.nodes.map((node) => ({
      ...node,
      presentation: nodePresentation(node.id, activeNodeId, connectedNodeIds),
    })),
    edges: visibleEdges,
  };
}

function addEdgeToIndex(
  index: Map<string, FlightGraphEdge[]>,
  nodeId: string,
  edge: FlightGraphEdge,
) {
  const edges = index.get(nodeId);
  if (edges) {
    edges.push(edge);
    return;
  }

  index.set(nodeId, [edge]);
}

function collectDirectedEdges(
  nodeId: string,
  edgeIndex: ReadonlyMap<string, FlightGraphEdge[]>,
  nextNodeId: (edge: FlightGraphEdge) => string,
  collectedEdgeIds: Set<string>,
  visitedNodeIds = new Set<string>(),
) {
  if (visitedNodeIds.has(nodeId)) {
    return;
  }

  visitedNodeIds.add(nodeId);
  for (const edge of edgeIndex.get(nodeId) ?? []) {
    collectedEdgeIds.add(edge.id);
    collectDirectedEdges(nextNodeId(edge), edgeIndex, nextNodeId, collectedEdgeIds, visitedNodeIds);
  }
}

function nodePresentation(
  nodeId: string,
  activeNodeId: string,
  connectedNodeIds: ReadonlySet<string>,
): FlightGraphNodePresentation {
  if (nodeId === activeNodeId) {
    return 'active';
  }

  return connectedNodeIds.has(nodeId) ? 'connected' : 'muted';
}

function nodeFlightTextFill(node: PresentedFlightGraphNode) {
  return node.presentation === 'muted' ? 'var(--muted)' : 'var(--primary)';
}

function nodeRouteTextFill(node: PresentedFlightGraphNode) {
  return node.presentation === 'muted' ? 'var(--muted)' : 'var(--text)';
}

function buildGraph(data: ConnectionsData): FlightGraphLayout {
  const nodeData = new Map<
    string,
    Pick<FlightGraphNode, 'id' | 'flight' | 'route' | 'departure' | 'arrival'>
  >();
  const edgePairs = new Map<string, { id: string; source: string; target: string }>();

  function visit(branch: ConnectionBranch, parent: string | undefined) {
    const flight = data.flights[branch.flightId];
    if (!flight) {
      return;
    }

    if (!nodeData.has(branch.flightId)) {
      const from = data.airports[flight.departureAirportId]?.iataCode ?? flight.departureAirportId;
      const to = data.airports[flight.arrivalAirportId]?.iataCode ?? flight.arrivalAirportId;
      nodeData.set(branch.flightId, {
        id: branch.flightId,
        flight: flightName(flight.flightNumber, data.airlines),
        route: `${from}  →  ${to}`,
        departure: timeLabel(flight.departureTime),
        arrival: timeLabel(flight.arrivalTime),
      });
    }

    if (parent) {
      const id = `${parent}-${branch.flightId}`;
      edgePairs.set(id, { id, source: parent, target: branch.flightId });
    }

    branch.outgoing.forEach((child) => visit(child, branch.flightId));
  }

  data.connections.forEach((root) => visit(root, undefined));

  const graph = new dagre.graphlib.Graph()
    .setDefaultEdgeLabel(() => ({}))
    .setGraph({
      rankdir: 'LR',
      nodesep: 34,
      ranksep: horizontalNodeSeparation,
      marginx: graphPadding,
      marginy: graphPadding,
    });
  nodeData.forEach((_, id) => graph.setNode(id, { width: nodeWidth, height: nodeHeight }));
  edgePairs.forEach((edge) => graph.setEdge(edge.source, edge.target));
  dagre.layout(graph);

  const graphSize = graph.graph();
  const width = Math.max(Math.ceil(graphSize.width ?? 0), 900);
  const height = Math.max(Math.ceil(graphSize.height ?? 0), 450);
  const nodes = [...nodeData.values()].map((node) => {
    const position = graph.node(node.id);
    const x = position.x;
    const y = position.y;
    const left = x - nodeWidth / 2;
    const top = y - nodeHeight / 2;

    return {
      ...node,
      x,
      y,
      left,
      right: x + nodeWidth / 2,
      top,
      bottom: y + nodeHeight / 2,
      headerBottom: top + 30,
      flightY: top + 19,
      routeY: top + 58,
      timeY: top + 84,
    };
  });
  const nodesById = new Map(nodes.map((node) => [node.id, node]));
  const edges = [...edgePairs.values()].flatMap<FlightGraphEdge>((edge) => {
    const source = nodesById.get(edge.source);
    const target = nodesById.get(edge.target);
    if (!source || !target) {
      return [];
    }

    const layoverSeconds = connectionDurationSeconds(data, edge.source, edge.target);
    const layoverLabel = layoverSeconds === undefined ? undefined : duration(layoverSeconds);

    return [
      {
        id: edge.id,
        sourceId: edge.source,
        targetId: edge.target,
        x1: source.right + edgeEndpointRadius,
        y1: source.y,
        x2: target.left - edgeEndpointRadius,
        y2: target.y,
        layoverSeconds,
        layoverLabel,
        labelX: undefined,
        labelY: undefined,
        labelLeft: undefined,
        labelRight: undefined,
        labelTop: undefined,
        labelBottom: undefined,
      },
    ];
  });

  return { width, height, nodes, edges: positionEdgeLabels(edges) };
}

function connectionDurationSeconds(
  data: ConnectionsData,
  sourceId: string,
  targetId: string,
): number | undefined {
  const source = data.flights[sourceId];
  const target = data.flights[targetId];
  if (!source || !target) {
    return undefined;
  }

  const arrival = Date.parse(source.arrivalTime);
  const departure = Date.parse(target.departureTime);
  if (!Number.isFinite(arrival) || !Number.isFinite(departure)) {
    return undefined;
  }

  const seconds = (departure - arrival) / 1000;
  if (!Number.isFinite(seconds) || seconds < 0) {
    return undefined;
  }

  return seconds;
}

function positionEdgeLabels(edges: FlightGraphEdge[]): FlightGraphEdge[] {
  const occupied: Array<{ left: number; right: number; top: number; bottom: number }> = [];
  const offsets = [
    { x: 0, y: 0 },
    { x: 0, y: -edgeLabelHeight },
    { x: 0, y: edgeLabelHeight },
    { x: -edgeLabelMinimumWidth, y: 0 },
    { x: edgeLabelMinimumWidth, y: 0 },
    { x: -edgeLabelMinimumWidth, y: -edgeLabelHeight },
    { x: edgeLabelMinimumWidth, y: edgeLabelHeight },
  ];

  return edges.map((edge) => {
    if (!edge.layoverLabel) {
      return edge;
    }

    const width = Math.max(
      edgeLabelMinimumWidth,
      edge.layoverLabel.length * edgeLabelCharacterWidth + edgeLabelPadding,
    );
    const midpointX = (edge.x1 + edge.x2) / 2;
    const midpointY = (edge.y1 + edge.y2) / 2;
    const candidates = offsets.map((offset) => ({
      left: midpointX + offset.x - width / 2,
      right: midpointX + offset.x + width / 2,
      top: midpointY + offset.y - edgeLabelHeight / 2,
      bottom: midpointY + offset.y + edgeLabelHeight / 2,
    }));
    const bounds = candidates.find((candidate) =>
      occupied.every((placed) => !rectanglesOverlap(candidate, placed)),
    );
    const selected = bounds ?? candidates[0];
    occupied.push(selected);

    return {
      ...edge,
      labelX: (selected.left + selected.right) / 2,
      labelY: (selected.top + selected.bottom) / 2,
      labelLeft: selected.left,
      labelRight: selected.right,
      labelTop: selected.top,
      labelBottom: selected.bottom,
    };
  });
}

function rectanglesOverlap(
  left: { left: number; right: number; top: number; bottom: number },
  right: { left: number; right: number; top: number; bottom: number },
) {
  return !(
    left.right < right.left ||
    left.left > right.right ||
    left.bottom < right.top ||
    left.top > right.bottom
  );
}
