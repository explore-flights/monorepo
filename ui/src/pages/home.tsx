import React, { useEffect, useState } from 'react';
import {
  Box,
  ColumnLayout,
  Container,
  ContentLayout,
  Header, Modal
} from '@cloudscape-design/components';
import 'reactflow/dist/style.css';
import { useHttpClient } from '../components/util/context/http-client';
import { catchNotify, useAppControls } from '../components/util/context/app-controls';
import { expectSuccess } from '../lib/api/api';
import { Connections, ConnectionSearchShare } from '../lib/api/api.model';
import { useAsync } from '../components/util/state/use-async';
import { ConnectionsTabs } from '../components/connections/connections-tabs';
import { ConnectionSearchForm, ConnectionSearchParams } from '../components/connections/connections-search-form';
import { KeyValuePairs, ValueWithLabel } from '../components/common/key-value-pairs';
import { Copy } from '../components/common/copy';
import { useSearchParams } from 'react-router-dom';

export function Home() {
  const { apiClient } = useHttpClient();
  const { notification } = useAppControls();
  const [search, setSearch] = useSearchParams();

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
  const [share, setShare] = useState<ConnectionSearchShare>();

  useEffect(() => {
    const payload = search.get('search');
    if (!payload) {
      return;
    }

    setLoading(true);
    (async () => {
      const { body } = expectSuccess(await apiClient.getConnectionsFromShare(payload));
      setConnections(body);
    })()
      .catch(catchNotify(notification))
      .finally(() => setLoading(false));
  }, [search]);

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

  function onShare(params: ConnectionSearchParams) {
    setLoading(true);
    (async () => {
      const { body } = expectSuccess(await apiClient.getConnectionsSearchShare(
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

      setShare(body);
    })()
      .catch(catchNotify(notification))
      .finally(() => setLoading(false));
  }

  return (
    <>
      <SearchShareModal share={share} onClose={() => setShare(undefined)} />
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
              onShare={onShare}
            />
          </Container>
          <ConnectionsTabs connections={connections} aircraft={aircraft} />
        </ColumnLayout>
      </ContentLayout>
    </>
  );
}

function SearchShareModal({ share, onClose }: { share?: ConnectionSearchShare, onClose: () => void }) {
  return (
    <Modal visible={share !== undefined} size={'large'} onDismiss={onClose} header={'Share this search'}>
      <KeyValuePairs columns={1}>
        <ValueWithLabel label={'Link'}>
          <Copy copyText={share?.htmlUrl ?? ''}><Box variant={'samp'}>{share?.htmlUrl}</Box></Copy>
        </ValueWithLabel>

        <ValueWithLabel label={'Image'}>
          <Copy copyText={share?.imageUrl ?? ''}><Box variant={'samp'}>{share?.imageUrl}</Box></Copy>
        </ValueWithLabel>
      </KeyValuePairs>
    </Modal>
  )
}