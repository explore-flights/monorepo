import React, { useState } from 'react';
import {
  ColumnLayout,
  Container,
  ContentLayout,
  Header,
} from '@cloudscape-design/components';
import 'reactflow/dist/style.css';
import { useHttpClient } from '../components/util/context/http-client';
import { catchNotify, useAppControls } from '../components/util/context/app-controls';
import { expectSuccess } from '../lib/api/api';
import { Connections } from '../lib/api/api.model';
import { useAsync } from '../components/util/state/use-async';
import { ConnectionsTabs } from '../components/connections/connections-tabs';
import { ConnectionSearchForm, ConnectionSearchParams } from '../components/connections/connections-search-form';

export function Home() {
  const { apiClient } = useHttpClient();
  const { notification } = useAppControls();

  const [airports, airportsState] = useAsync(
    { airports: [], metropolitanAreas: [] },
    async () => expectSuccess(await apiClient.getLocations()).body,
    [],
  );

  const [aircraft, aircraftState] = useAsync(
    [],
    async () => expectSuccess(await apiClient.getAircraft()).body,
    [],
  );

  const [isLoading, setLoading] = useState(false);
  const [connections, setConnections] = useState<Connections>();

  function onSearch(params: ConnectionSearchParams) {
    setLoading(true);
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
        params.includeAirport ?? null,
        params.excludeAirport ?? null,
        params.includeFlightNumber ?? null,
        params.excludeFlightNumber ?? null,
        params.includeAircraft ?? null,
        params.excludeAircraft ?? null,
      ));

      setConnections(body);
    })()
      .catch(catchNotify(notification))
      .finally(() => setLoading(false));
  }

  return (
    <ContentLayout header={<Header variant={'h1'}>Welcome to explore.flights</Header>}>
      <ColumnLayout columns={1}>
        <Container>
          <ConnectionSearchForm
            airports={airports}
            airportsLoading={airportsState.loading}
            aircraft={aircraft}
            aircraftLoading={aircraftState.loading}
            isDisabled={isLoading}
            onSearch={onSearch}
          />
        </Container>
        <ConnectionsTabs connections={connections} aircraft={aircraft} />
      </ColumnLayout>
    </ContentLayout>
  );
}