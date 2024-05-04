import React, { useState } from 'react';
import {
  Button,
  Container,
  ContentLayout,
  DatePicker,
  Header,
  Input,
  SpaceBetween
} from '@cloudscape-design/components';
import { Background, Controls, ReactFlow, useEdgesState, useNodesState, Node, Edge } from 'reactflow';
import 'reactflow/dist/style.css';
import { useHttpClient } from '../components/util/context/http-client';
import { catchNotify, useAppControls } from '../components/util/context/app-controls';
import { expectSuccess } from '../lib/api/api';
import { Connections } from '../lib/api/api.model';

export function Home() {
  const { apiClient } = useHttpClient();
  const { notification } = useAppControls();

  const [isLoading, setLoading] = useState(false);
  const [origin, setOrigin] = useState('BER');
  const [destination, setDestination] = useState('JFK');
  const [minDeparture, setMinDeparture] = useState('2024-05-04');
  const [maxDeparture, setMaxDeparture] = useState('2024-05-05');
  const [maxFlights, setMaxFlights] = useState(2);

  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);

  function onClickSearch() {
    setLoading(true);
    (async () => {
      const { body } = expectSuccess(await apiClient.getConnections(
        origin,
        destination,
        new Date(minDeparture),
        new Date(maxDeparture),
        maxFlights,
        60*60,
        60*60*6,
        60*60*26,
      ));

      const nodes = convertNodes(body);
      const edges = convertEdges(body);

      setNodes(nodes);
      setEdges(edges);
    })()
      .catch(catchNotify(notification))
      .finally(() => setLoading(false));
  }

  return (
    <ContentLayout header={<Header variant={'h1'}>Welcome to explore.flights</Header>}>
      <Container>
        <SpaceBetween size={'xxl'} direction={'vertical'}>
          <SpaceBetween size={'m'} direction={'horizontal'}>
            <Input value={origin} onChange={(e) => setOrigin(e.detail.value)} disabled={isLoading} />
            <Input value={destination} onChange={(e) => setDestination(e.detail.value)} disabled={isLoading} />
            <DatePicker value={minDeparture} onChange={(e) => setMinDeparture(e.detail.value)} disabled={isLoading} />
            <DatePicker value={maxDeparture} onChange={(e) => setMaxDeparture(e.detail.value)} disabled={isLoading} />
            <Input type={'number'} value={maxFlights.toString()} onChange={(e) => setMaxFlights(Number.parseInt(e.detail.value))} disabled={isLoading} />
            <Button onClick={onClickSearch} loading={isLoading}>Search</Button>
          </SpaceBetween>

          <div style={{ width: '100%', height: '500px' }}>
            <ReactFlow
              nodes={nodes}
              edges={edges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
            >
              <Controls />
              <Background />
            </ReactFlow>
          </div>
        </SpaceBetween>
      </Container>
    </ContentLayout>
  );
}

function convertNodes(conns: Connections): Array<Node<unknown>> {
  const result: Array<Node<unknown>> = [];
  for (const node of conns.nodes) {
    result.push({
      id: `${node.id}`,
      position: { x: node.x, y: node.y },
      data: { label: node.label },
    });
  }

  return result;
}

function convertEdges(conns: Connections): Array<Edge<unknown>> {
  const result: Array<Edge<unknown>> = [];
  for (const edge of conns.edges) {
    result.push({
      id: `${edge.source}-${edge.target}`,
      source: `${edge.source}`,
      target: `${edge.target}`,
      label: edge.label,
    });
  }

  return result;
}