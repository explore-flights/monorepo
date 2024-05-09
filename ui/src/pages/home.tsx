import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Box,
  Button,
  Container,
  ContentLayout,
  DateRangePicker,
  Form,
  FormField, Grid,
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
        params.minDeparture,
        params.maxDeparture,
        params.maxFlights,
        params.minLayover,
        params.maxLayover,
        params.maxDuration,
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
  readonly minDeparture: DateTime<true>;
  readonly maxDeparture: DateTime<true>;
  readonly maxFlights: number;
  readonly minLayover: Duration<true>;
  readonly maxLayover: Duration<true>;
  readonly maxDuration: Duration<true>;
}

interface ConnectionSearchFormErrors {
  origins?: string;
  destinations?: string;
  departure?: string;
  maxFlights?: string;
  minLayover?: string;
  maxLayover?: string;
  maxDuration?: string;
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
  const [departure, setDeparture] = useState<[DateTime<true>, DateTime<true>] | null>([
    DateTime.now().startOf('day'),
    DateTime.now().endOf('day'),
  ]);
  const [maxFlights, setMaxFlights] = useState(2);
  const [minLayover, setMinLayover] = useState(Duration.fromMillis(1000*60*60));
  const [maxLayover, setMaxLayover] = useState(Duration.fromMillis(1000*60*60*6));
  const [maxDuration, setMaxDuration] = useState(Duration.fromMillis(1000*60*60*26));
  const errors = useMemo<ConnectionSearchFormErrors | null>(() => {
    const e: ConnectionSearchFormErrors = {};
    let anyError = false;

    if (origins.length < 1) {
      e.origins = 'At least one required';
      anyError = true;
    } else if (origins.length > 10) {
      e.origins = 'At most 10 allowed';
      anyError = true;
    }

    if (destinations.length < 1) {
      e.destinations = 'At least one required';
      anyError = true;
    } else if (destinations.length > 10) {
      e.destinations = 'At most 10 allowed';
      anyError = true;
    }

    if (departure === null) {
      e.departure = 'Required';
      anyError = true;
    } else {
      const [start, end] = departure;
      const duration = end.diff(start).plus(maxDuration);

      if (duration.toMillis() > 1000*60*60*24*14) {
        e.departure = 'The duration from start to end + Max Duration must not exceed 14 days';
        e.maxDuration = 'The duration from start to end + Max Duration must not exceed 14 days';
        anyError = true;
      }
    }

    if (minLayover.toMillis() > maxLayover.toMillis()) {
      e.minLayover = 'Must not be greater than Max Layover';
      e.maxLayover = 'Must not be smaller than Min Layover';
      anyError = true;
    }

    return anyError ? e : null;
  }, [origins, destinations, departure, maxFlights, minLayover, maxLayover, maxDuration]);

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
    if (departure === null) {
      return;
    }

    onSearch({
      origins: origins,
      destinations: destinations,
      minDeparture: departure[0],
      maxDeparture: departure[1],
      maxFlights: maxFlights,
      minLayover: minLayover,
      maxLayover: maxLayover,
      maxDuration: maxDuration,
    });
  }

  return (
    <Form variant={'embedded'} actions={<Button onClick={onClickSearch} loading={isLoading} disabled={errors !== null}>Search</Button>}>
      <Grid
        gridDefinition={[
          { colspan: { default: 12, xs: 6, m: 3 } },
          { colspan: { default: 12, xs: 6, m: 3 } },
          { colspan: { default: 12, xs: 12, m: 6 } },
          { colspan: { default: 12, xs: 6, m: 3 } },
          { colspan: { default: 12, xs: 6, m: 3 } },
          { colspan: { default: 12, xs: 6, m: 3 } },
          { colspan: { default: 12, xs: 6, m: 3 } },
        ]}
      >
        <FormField label={'Origin'} errorText={errors?.origins}>
          <AirportMultiselect airports={airports} loading={airportsLoading} disabled={isLoading} onChange={setOrigins} />
        </FormField>

        <FormField label={'Destination'} errorText={errors?.destinations}>
          <AirportMultiselect airports={airports} loading={airportsLoading} disabled={isLoading} onChange={setDestinations} />
        </FormField>

        <FormField label={'Departure'} errorText={errors?.departure}>
          <DateRangePicker
            value={departure !== null ? { type: 'absolute', startDate: departure[0].toISO(), endDate: departure[1].toISO() } : null}
            onChange={(e) => {
              const value = e.detail.value;
              if (value === null || value.type !== 'absolute') {
                setDeparture(null);
                return;
              }

              const start = DateTime.fromISO(value.startDate, { setZone: true });
              const end = DateTime.fromISO(value.endDate, { setZone: true });
              if (!start.isValid || !end.isValid) {
                setDeparture(null);
                return;
              }

              setDeparture([start, end]);
            }}
            relativeOptions={[]}
            isValidRange={(v) => {
              if (v === null || v.type !== 'absolute') {
                return {
                  valid: false,
                  errorMessage: 'Absolute range is required',
                };
              }

              const start = DateTime.fromISO(v.startDate, { setZone: true });
              const end = DateTime.fromISO(v.endDate, { setZone: true });
              if (!start.isValid || !end.isValid) {
                return {
                  valid: false,
                  errorMessage: 'Invalid dates',
                };
              }

              if (end.diff(start).toMillis() > 1000*60*60*24*14) {
                return {
                  valid: false,
                  errorMessage: 'At most 14 days can be searched',
                };
              }

              return { valid: true };
            }}
            rangeSelectorMode={'absolute-only'}
            disabled={isLoading}
          />
        </FormField>

        <FormField label={'Max Flights'} errorText={errors?.maxFlights}>
          <Slider
            min={1}
            max={4}
            referenceValues={[2, 3]}
            value={maxFlights}
            onChange={(e) => setMaxFlights(e.detail.value)}
            disabled={isLoading}
          />
        </FormField>

        <FormField label={'Min Layover'} errorText={errors?.minLayover}>
          <Slider
            min={1000*60*5}
            max={1000*60*60*24}
            step={1000*60*5}
            valueFormatter={(v) => Duration.fromMillis(v).rescale().toHuman({ unitDisplay: 'short' })}
            value={minLayover.toMillis()}
            onChange={(e) => setMinLayover(Duration.fromMillis(e.detail.value))}
            disabled={isLoading}
          />
        </FormField>

        <FormField label={'Max Layover'} errorText={errors?.maxLayover}>
          <Slider
            min={1000*60*5}
            max={1000*60*60*24}
            step={1000*60*5}
            valueFormatter={(v) => Duration.fromMillis(v).rescale().toHuman({ unitDisplay: 'short' })}
            value={maxLayover.toMillis()}
            onChange={(e) => setMaxLayover(Duration.fromMillis(e.detail.value))}
            disabled={isLoading}
          />
        </FormField>

        <FormField label={'Max Duration'} errorText={errors?.maxDuration}>
          <Slider
            min={1000*60*5}
            max={1000*60*60*24*3}
            step={1000*60*30}
            valueFormatter={(v) => Duration.fromMillis(v).rescale().toHuman({ unitDisplay: 'short' })}
            value={maxDuration.toMillis()}
            onChange={(e) => setMaxDuration(Duration.fromMillis(e.detail.value))}
            disabled={isLoading}
          />
        </FormField>
      </Grid>
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
      tokenLimit={2}
      disabled={disabled}
      statusType={loading ? 'loading' : 'finished'}
    />
  );
}