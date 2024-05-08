import React, { useEffect, useMemo, useState } from 'react';
import {
  Box,
  Button, ColumnLayout,
  Container,
  ContentLayout,
  DatePicker, Form, FormField,
  Header,
  Multiselect, MultiselectProps,
  Slider,
  SpaceBetween
} from '@cloudscape-design/components';
import {
  Background,
  Controls,
  ReactFlow,
  useEdgesState,
  useNodesState,
  Node,
  Edge,
  ReactFlowProvider, Position, Handle, NodeProps, getConnectedEdges
} from 'reactflow';
import { DateTime, Duration } from 'luxon';
import 'reactflow/dist/style.css';
import { useHttpClient } from '../components/util/context/http-client';
import { catchNotify, useAppControls } from '../components/util/context/app-controls';
import { expectSuccess } from '../lib/api/api';
import { Connection, Connections, Country, Flight } from '../lib/api/api.model';

export function Home() {
  const { apiClient } = useHttpClient();
  const { notification } = useAppControls();

  const nodeTypes = useMemo(() => ({
    flight: FlightNode,
  }), []);

  const [isLoading, setLoading] = useState(false);
  const [nodes, setNodes, onNodesChange] = useNodesState<NodeData>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<EdgeData>([]);

  function onSearch(params: ConnectionSearchParams) {
    setLoading(true);
    setEdges([]);
    setNodes([]);

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

      const [nodes, edges] = convertToGraph(body);
      setNodes(nodes);
      setEdges(edges);
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
        <div style={{ height: '750px' }}>
          <ReactFlowProvider>
            <ReactFlow
              nodes={nodes}
              edges={edges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              nodeTypes={nodeTypes}
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
          </ReactFlowProvider>
        </div>
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

  const [locationsLoading, setLocationsLoading] = useState(true)
  const [locations, setLocations] = useState<ReadonlyArray<Country>>([]);

  const [origins, setOrigins] = useState<ReadonlyArray<string>>([]);
  const [destinations, setDestinations] = useState<ReadonlyArray<string>>([]);
  const [minDeparture, setMinDeparture] = useState('2024-05-04');
  const [maxDeparture, setMaxDeparture] = useState('2024-05-05');
  const [maxFlights, setMaxFlights] = useState(2);
  const [minLayover, setMinLayover] = useState(60*60);
  const [maxLayover, setMaxLayover] = useState(60*60*6);
  const [maxDuration, setMaxDuration] = useState(60*60*26);

  useEffect(() => {
    setLocationsLoading(true);
    (async () => {
      const { body } = expectSuccess(await apiClient.getLocations());
      setLocations(body);
    })()
      .catch(catchNotify(notification))
      .finally(() => setLocationsLoading(false));
  }, [apiClient]);

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
          <LocationMultiselect locations={locations} loading={locationsLoading} disabled={isLoading} onChange={setOrigins} />
        </FormField>

        <FormField label={'Destination'}>
          <LocationMultiselect locations={locations} loading={locationsLoading} disabled={isLoading} onChange={setDestinations} />
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
    0,
    [0]
  );

  return [nodes, edges];
}

function buildGraph(connections: ReadonlyArray<Connection>, flights: Record<string, Flight>, nodes: Array<Node<NodeData>>, edges: Array<Edge<EdgeData>>, nodeLookup: Map<string, Node<unknown>>, depth: number, maxX: Array<number>, parent?: string) {
  if (maxX.length <= depth + 1) {
    maxX.push(0);
  }

  for (const connection of connections) {
    const flight = flights[connection.flightId];

    if (!nodeLookup.has(connection.flightId)) {
      const node = {
        id: connection.flightId,
        type: 'flight',
        position: { x: maxX[depth + 1], y: (depth + 1) * 180 },
        data: {
          type: 'flight',
          flight: flight,
          hasOutgoing: connection.outgoing.length > 0,
        },
      } satisfies Node<FlightNodeData>;

      nodeLookup.set(connection.flightId, node);
      nodes.push(node);

      maxX[depth + 1] += 180;
    }

    if (parent === undefined) {
      const departure = DateTime.fromISO(flight.departureTime, { setZone: true });
      const departureDate = departure.toISODate()!;

      if (!nodeLookup.has(departureDate)) {
        const node = {
          id: departureDate,
          type: 'input',
          position: { x: maxX[0], y: 0 },
          data: {
            type: 'date',
            date: departureDate,
            label: departure.toLocaleString(DateTime.DATE_FULL)
          },
        } satisfies Node<DateNodeData>;

        nodeLookup.set(departureDate, node);
        nodes.push(node);

        maxX[0] += 180;
      }

      edges.push({
        id: `${departureDate}-${connection.flightId}`,
        source: departureDate,
        target: connection.flightId,
        label: departure.toLocaleString(DateTime.TIME_24_SIMPLE),
        data: {
          target: flight,
        },
      });
    } else {
      const parentFlight = flights[parent];
      const arrival = DateTime.fromISO(parentFlight.arrivalTime, { setZone: true });
      const departure = DateTime.fromISO(flight.departureTime, { setZone: true });
      const layover = departure.diff(arrival).rescale();

      edges.push({
        id: `${parent}-${connection.flightId}`,
        source: parent,
        target: connection.flightId,
        label: layover.toHuman({ unitDisplay: 'short' }),
        data: {
          source: parentFlight,
          target: flight,
        },
      });
    }

    buildGraph(
      connection.outgoing,
      flights,
      nodes,
      edges,
      nodeLookup,
      depth + 1,
      maxX,
      connection.flightId,
    );
  }
}

function FlightNode({ data }: NodeProps<FlightNodeData>) {
  const { flight, hasOutgoing } = data;
  const departure = DateTime.fromISO(flight.departureTime, { setZone: true });
  const arrival = DateTime.fromISO(flight.arrivalTime, { setZone: true });
  const duration = arrival.diff(departure).rescale();

  return (
    <>
      <SpaceBetween size={'xxs'} direction={'vertical'}>
        <Handle type="target" position={Position.Top} />
        <Box textAlign={'center'}>
          <Box>{`${flight.flightNumber.airline}${flight.flightNumber.number}${flight.flightNumber.suffix ?? ''}`}</Box>
          <Box>{`${flight.departureAirport} - ${flight.arrivalAirport}`}</Box>
          <Box>{duration.toHuman({ unitDisplay: 'short' })}</Box>
          <Box>{flight.aircraftType}</Box>
        </Box>
        {hasOutgoing && <Handle type="source" position={Position.Bottom} />}
      </SpaceBetween>
    </>
  )
}

function LocationMultiselect({ locations, loading, disabled, onChange }: { locations: ReadonlyArray<Country>, loading: boolean, disabled: boolean, onChange: (options: ReadonlyArray<string>) => void }) {
  const options = useMemo<MultiselectProps.Options>(() => {
    const options: Array<MultiselectProps.Option | MultiselectProps.OptionGroup> = [];

    for (const country of locations) {
      for (const city of country.cities) {
        const airportOptions: Array<MultiselectProps.Option> = [];

        for (const airport of city.airports) {
          airportOptions.push({
            label: airport.code,
            description: airport.name,
            value: airport.code,
          });
        }

        if (airportOptions.length > 0) {
          if (airportOptions.length == 1) {
            options.push({
              ...airportOptions[0],
              filteringTags: [country.name, country.code],
            });
          } else {
            options.push({
              label: city.code,
              description: city.name,
              options: airportOptions,
              filteringTags: [country.name, country.code],
            });
          }
        }
      }
    }

    return options;
  }, [locations]);

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