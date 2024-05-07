import React, { useMemo, useState } from 'react';
import {
  Box,
  Button, ColumnLayout,
  Container,
  ContentLayout,
  DatePicker, Form, FormField,
  Header,
  Input, Slider,
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
  ReactFlowProvider, Position, Handle, NodeProps
} from 'reactflow';
import { DateTime, Duration } from 'luxon';
import 'reactflow/dist/style.css';
import { useHttpClient } from '../components/util/context/http-client';
import { catchNotify, useAppControls } from '../components/util/context/app-controls';
import { expectSuccess } from '../lib/api/api';
import { Connection, Connections, Flight } from '../lib/api/api.model';

export function Home() {
  const { apiClient } = useHttpClient();
  const { notification } = useAppControls();

  const nodeTypes = useMemo(() => ({
    flight: FlightNode,
  }), []);

  const [isLoading, setLoading] = useState(false);
  const [origin, setOrigin] = useState('BER');
  const [destination, setDestination] = useState('JFK');
  const [minDeparture, setMinDeparture] = useState('2024-05-04');
  const [maxDeparture, setMaxDeparture] = useState('2024-05-05');
  const [maxFlights, setMaxFlights] = useState(2);
  const [minLayover, setMinLayover] = useState(60*60);
  const [maxLayover, setMaxLayover] = useState(60*60*6);
  const [maxDuration, setMaxDuration] = useState(60*60*26);

  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);

  function onClickSearch() {
    setLoading(true);
    setEdges([]);
    setNodes([]);

    (async () => {
      const { body } = expectSuccess(await apiClient.getConnections(
        origin,
        destination,
        new Date(minDeparture),
        new Date(maxDeparture),
        maxFlights,
        minLayover,
        maxLayover,
        maxDuration,
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
        <Form actions={<Button onClick={onClickSearch} loading={isLoading}>Search</Button>}>
          <ColumnLayout columns={4}>
            <FormField label={'Origin'}>
              <Input value={origin} onChange={(e) => setOrigin(e.detail.value)} disabled={isLoading} />
            </FormField>

            <FormField label={'Destination'}>
              <Input value={destination} onChange={(e) => setDestination(e.detail.value)} disabled={isLoading} />
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

function convertToGraph(conns: Connections): [Array<Node<unknown>>, Array<Edge<unknown>>] {
  const nodes: Array<Node<unknown>> = [];
  const edges: Array<Edge<unknown>> = [];

  buildGraph(conns.connections, conns.flights, nodes, edges, new Map(), 0, [0]);

  return [nodes, edges];
}

function buildGraph(connections: ReadonlyArray<Connection>, flights: Record<string, Flight>, nodes: Array<Node<unknown>>, edges: Array<Edge<unknown>>, nodeLookup: Map<string, Node<unknown>>, depth: number, maxX: Array<number>, parent?: string) {
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
          flight: flight,
          hasOutgoing: connection.outgoing.length > 0,
        },
      } satisfies Node<FlightNodeProps>;

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
          data: { label: departure.toLocaleString(DateTime.DATE_FULL) },
        } satisfies Node<unknown>;

        nodeLookup.set(departureDate, node);
        nodes.push(node);

        maxX[0] += 180;
      }

      edges.push({
        id: `${departureDate}-${connection.flightId}`,
        source: departureDate,
        target: connection.flightId,
        label: departure.toLocaleString(DateTime.TIME_24_SIMPLE),
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
      });
    }

    buildGraph(connection.outgoing, flights, nodes, edges, nodeLookup, depth + 1, maxX, connection.flightId);
  }
}

interface FlightNodeProps {
  flight: Flight;
  hasOutgoing: boolean;
}

function FlightNode({ data }: NodeProps<FlightNodeProps>) {
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