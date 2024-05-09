import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Box,
  Button,
  ColumnLayout,
  Container,
  ContentLayout,
  DatePicker,
  Form,
  FormField,
  Header,
  Multiselect,
  MultiselectProps,
  Slider,
  SpaceBetween
} from '@cloudscape-design/components';
import Dagre from '@dagrejs/dagre';
import {
  Background,
  Controls,
  Edge,
  getConnectedEdges,
  Handle,
  Node,
  NodeProps,
  Position,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  useReactFlow
} from 'reactflow';
import { DateTime, Duration } from 'luxon';
import 'reactflow/dist/style.css';
import { useHttpClient } from '../components/util/context/http-client';
import { catchNotify, useAppControls } from '../components/util/context/app-controls';
import { expectSuccess } from '../lib/api/api';
import { Airports, Connection, Connections, Flight } from '../lib/api/api.model';

export function Home() {
  const { apiClient } = useHttpClient();
  const { notification } = useAppControls();

  const [isLoading, setLoading] = useState(false);
  const [connections, setConnections] = useState<Connections>();

  function onSearch(params: ConnectionSearchParams) {
    setLoading(true);
    setConnections(undefined);

    (async () => {
      const { body } = expectSuccess(await apiClient.getConnections(
        params.origins,
        params.destinations,
        params.minDeparture.toJSDate(),
        params.maxDeparture.toJSDate(),
        params.maxFlights,
        params.minLayover.toMillis() / 1000,
        params.maxLayover.toMillis() / 1000,
        params.maxDuration.toMillis() / 1000,
      ));

      setConnections(body);
    })()
      .catch(catchNotify(notification))
      .finally(() => setLoading(false));
  }

  return (
    <ContentLayout header={<Header variant={'h1'}>Welcome to explore.flights</Header>}>
      <Container variant={'stacked'}>
        <ConnectionSearchForm isLoading={isLoading} onSearch={onSearch} />
      </Container>
      <Container variant={'stacked'}>
        <ReactFlowProvider>
          <ConnectionsGraph connections={connections} />
        </ReactFlowProvider>
      </Container>
    </ContentLayout>
  );
}

interface ConnectionSearchParams {
  readonly origins: ReadonlyArray<string>;
  readonly destinations: ReadonlyArray<string>;
  readonly minDeparture: DateTime;
  readonly maxDeparture: DateTime;
  readonly maxFlights: number;
  readonly minLayover: Duration;
  readonly maxLayover: Duration;
  readonly maxDuration: Duration;
}

function ConnectionSearchForm({ isLoading, onSearch }: { isLoading: boolean, onSearch: (v: ConnectionSearchParams) => void }) {
  const { notification } = useAppControls();
  const { apiClient } = useHttpClient();

  const [airportsLoading, setAirportsLoading] = useState(true)
  const [airports, setAirports] = useState<Airports>({
    airports: [],
    metropolitanAreas: [],
  });

  const [origins, setOrigins] = useState<ReadonlyArray<string>>([]);
  const [destinations, setDestinations] = useState<ReadonlyArray<string>>([]);
  const [minDeparture, setMinDeparture] = useState('2024-05-04');
  const [maxDeparture, setMaxDeparture] = useState('2024-05-05');
  const [maxFlights, setMaxFlights] = useState(2);
  const [minLayover, setMinLayover] = useState(60*60);
  const [maxLayover, setMaxLayover] = useState(60*60*6);
  const [maxDuration, setMaxDuration] = useState(60*60*26);

  useEffect(() => {
    setAirportsLoading(true);
    (async () => {
      const { body } = expectSuccess(await apiClient.getLocations());
      setAirports(body);
    })()
      .catch(catchNotify(notification))
      .finally(() => setAirportsLoading(false));
  }, []);

  function onClickSearch() {
    onSearch({
      origins: origins,
      destinations: destinations,
      minDeparture: DateTime.fromISO(minDeparture),
      maxDeparture: DateTime.fromISO(maxDeparture),
      maxFlights: maxFlights,
      minLayover: Duration.fromMillis(minLayover * 1000),
      maxLayover: Duration.fromMillis(maxLayover * 1000),
      maxDuration: Duration.fromMillis(maxDuration * 1000),
    });
  }

  return (
    <Form variant={'embedded'} actions={<Button onClick={onClickSearch} loading={isLoading}>Search</Button>}>
      <ColumnLayout columns={4}>
        <FormField label={'Origin'}>
          <AirportMultiselect airports={airports} loading={airportsLoading} disabled={isLoading} onChange={setOrigins} />
        </FormField>

        <FormField label={'Destination'}>
          <AirportMultiselect airports={airports} loading={airportsLoading} disabled={isLoading} onChange={setDestinations} />
        </FormField>

        <FormField label={'Min Departure'}>
          <DatePicker value={minDeparture} onChange={(e) => setMinDeparture(e.detail.value)} disabled={isLoading} />
        </FormField>

        <FormField label={'Max Departure'}>
          <DatePicker value={maxDeparture} onChange={(e) => setMaxDeparture(e.detail.value)} disabled={isLoading} />
        </FormField>

        <FormField label={'Max Flights'}>
          <Slider
            min={1}
            max={4}
            referenceValues={[2, 3]}
            value={maxFlights}
            onChange={(e) => setMaxFlights(e.detail.value)}
            disabled={isLoading}
          />
        </FormField>

        <FormField label={'Min Layover'}>
          <Slider
            min={0}
            max={60*60*24}
            step={60*5}
            valueFormatter={(v) => Duration.fromMillis(v*1000).rescale().toHuman({ unitDisplay: 'short' })}
            value={minLayover}
            onChange={(e) => setMinLayover(e.detail.value)}
            disabled={isLoading}
          />
        </FormField>

        <FormField label={'Max Layover'}>
          <Slider
            min={0}
            max={60*60*24}
            step={60*5}
            valueFormatter={(v) => Duration.fromMillis(v*1000).rescale().toHuman({ unitDisplay: 'short' })}
            value={maxLayover}
            onChange={(e) => setMaxLayover(e.detail.value)}
            disabled={isLoading}
          />
        </FormField>

        <FormField label={'Max Duration'}>
          <Slider
            min={0}
            max={60*60*24*3}
            step={60*30}
            valueFormatter={(v) => Duration.fromMillis(v*1000).rescale().toHuman({ unitDisplay: 'short' })}
            value={maxDuration}
            onChange={(e) => setMaxDuration(e.detail.value)}
            disabled={isLoading}
          />
        </FormField>
      </ColumnLayout>
    </Form>
  );
}

interface FlightNodeData {
  readonly type: 'flight';
  readonly flight: Flight;
  readonly hasOutgoing: boolean;
}

interface DateNodeData {
  readonly type: 'date';
  readonly date: string;
  readonly label: string;
}

type NodeData = FlightNodeData | DateNodeData;

interface EdgeData {
  source?: Flight;
  target: Flight;
}

function convertToGraph(conns: Connections): [Array<Node<NodeData>>, Array<Edge<EdgeData>>] {
  const nodes: Array<Node<NodeData>> = [];
  const edges: Array<Edge<EdgeData>> = [];

  buildGraph(
    conns.connections,
    conns.flights,
    nodes,
    edges,
    new Map(),
    new Map(),
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
          hasOutgoing: connection.outgoing.length > 0,
        },
      } satisfies Node<FlightNodeData>;

      nodeLookup.set(connection.flightId, node);
      nodes.push(node);
    }

    if (parent === undefined) {
      const departure = DateTime.fromISO(flight.departureTime, { setZone: true });
      const departureDate = departure.toISODate()!;

      if (!nodeLookup.has(departureDate)) {
        const node = {
          id: departureDate,
          type: 'input',
          sourcePosition: Position.Right,
          position: { x: 0, y: 0 },
          width: 200,
          height: 50,
          data: {
            type: 'date',
            date: departureDate,
            label: departure.toLocaleString(DateTime.DATE_FULL)
          },
        } satisfies Node<DateNodeData>;

        nodeLookup.set(departureDate, node);
        nodes.push(node);
      }

      const edgeId = `${departureDate}-${connection.flightId}`;
      if (!edgeLookup.has(edgeId)) {
        const edge = {
          id: edgeId,
          source: departureDate,
          target: connection.flightId,
          label: departure.toLocaleString(DateTime.TIME_24_SIMPLE),
          data: {
            target: flight,
          },
        };

        edgeLookup.set(edgeId, edge);
        edges.push(edge);
      }
    } else {
      const parentFlight = flights[parent];
      const arrival = DateTime.fromISO(parentFlight.arrivalTime, { setZone: true });
      const departure = DateTime.fromISO(flight.departureTime, { setZone: true });
      const layover = departure.diff(arrival).rescale();
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
        };

        edgeLookup.set(edgeId, edge);
        edges.push(edge);
      }
    }

    buildGraph(
      connection.outgoing,
      flights,
      nodes,
      edges,
      nodeLookup,
      edgeLookup,
      connection.flightId,
    );
  }
}

function ConnectionsGraph({ connections }: { connections?: Connections }) {
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
    if (connections === undefined) {
      setEdges([]);
      setNodes([]);
      return;
    }

    const [nodes, edges] = convertToGraph(connections);
    const layouted = getLayoutedElements(nodes, edges);

    setNodes([...layouted.nodes]);
    setEdges([...layouted.edges]);

    window.requestAnimationFrame(() => {
      fitView();
    });
  }, [getLayoutedElements, connections]);

  return (
    <div style={{ height: '750px' }}>
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
  const { flight, hasOutgoing } = data;
  const departure = DateTime.fromISO(flight.departureTime, { setZone: true });
  const arrival = DateTime.fromISO(flight.arrivalTime, { setZone: true });
  const duration = arrival.diff(departure).rescale();

  return (
    <>
      <SpaceBetween size={'xxs'} direction={'vertical'}>
        <Handle type="target" position={Position.Left} />
        <Box textAlign={'center'}>
          <Box>{`${flight.flightNumber.airline}${flight.flightNumber.number}${flight.flightNumber.suffix ?? ''}`}</Box>
          <Box>{`${flight.departureAirport} - ${flight.arrivalAirport}`}</Box>
          <Box>{duration.toHuman({ unitDisplay: 'short' })}</Box>
          <Box>{flight.aircraftType}</Box>
        </Box>
        {hasOutgoing && <Handle type="source" position={Position.Right} />}
      </SpaceBetween>
    </>
  )
}

function AirportMultiselect({ airports, loading, disabled, onChange }: { airports: Airports, loading: boolean, disabled: boolean, onChange: (options: ReadonlyArray<string>) => void }) {
  const options = useMemo<MultiselectProps.Options>(() => {
    const options: Array<MultiselectProps.Option | MultiselectProps.OptionGroup> = [];

    for (const airport of airports.airports) {
      options.push({
        label: airport.code,
        value: airport.code,
        description: airport.name,
      });
    }

    for (const metroArea of airports.metropolitanAreas) {
      const airportOptions: Array<MultiselectProps.Option> = [];

      for (const airport of metroArea.airports) {
        airportOptions.push({
          label: airport.code,
          value: airport.code,
          description: airport.name,
        });
      }

      options.push({
        label: metroArea.code,
        description: metroArea.name,
        options: airportOptions,
      });
    }

    return options;
  }, [airports]);

  const [selectedOptions, setSelectedOptions] = useState<ReadonlyArray<MultiselectProps.Option>>([]);

  useEffect(() => {
    onChange(selectedOptions.map((v) => v.value!));
  }, [selectedOptions]);

  return (
    <Multiselect
      options={options}
      selectedOptions={selectedOptions}
      onChange={(e) => setSelectedOptions(e.detail.selectedOptions)}
      keepOpen={true}
      virtualScroll={true}
      filteringType={'auto'}
      disabled={disabled}
      statusType={loading ? 'loading' : 'finished'}
    />
  );
}