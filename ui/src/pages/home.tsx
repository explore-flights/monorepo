import React, { useEffect, useState } from 'react';
import {
  Box,
  ColumnLayout,
  Container,
  ContentLayout,
  Header, Modal
} from '@cloudscape-design/components';
import { useHttpClient } from '../components/util/context/http-client';
import { catchNotify, useAppControls } from '../components/util/context/app-controls';
import { expectSuccess } from '../lib/api/api';
import { ConnectionsResponse, ConnectionSearchShare, ConnectionsSearchRequest } from '../lib/api/api.model';
import { ConnectionsResults } from '../components/connections/connections-results';
import { ConnectionSearchForm, ConnectionSearchParams } from '../components/connections/connections-search-form';
import { KeyValuePairs, ValueWithLabel } from '../components/common/key-value-pairs';
import { Copy } from '../components/common/copy';
import { useSearchParams } from 'react-router-dom';
import { DateTime, Duration } from 'luxon';

export function Home() {
  const { apiClient } = useHttpClient();
  const { notification } = useAppControls();
  const [search] = useSearchParams();

  const [isLoading, setLoading] = useState(false);
  const [params, setParams] = useState<ConnectionSearchParams>({
    origins: [],
    destinations: [],
    minDeparture: DateTime.now().startOf('day'),
    maxDeparture: DateTime.now().endOf('day'),
    maxFlights: 2,
    minLayover: Duration.fromMillis(1000*60*60),
    maxLayover: Duration.fromMillis(1000*60*60*6),
    maxDuration: Duration.fromMillis(1000*60*60*26),
    countMultiLeg: true,
  });
  const [connections, setConnections] = useState<ConnectionsResponse>();
  const [share, setShare] = useState<ConnectionSearchShare>();

  useEffect(() => {
    const payload = search.get('search');
    if (!payload) {
      return;
    }

    setLoading(true);
    (async () => {
      const { body } = expectSuccess(await apiClient.getConnectionsFromShare(payload));
      setParams(requestToParams(body.search));
      setConnections(body.data);
    })()
      .catch(catchNotify(notification))
      .finally(() => setLoading(false));
  }, [search]);

  function onSearch() {
    setLoading(true);
    (async () => {
      const { body } = expectSuccess(await apiClient.getConnections(paramsToRequest(params)));
      setConnections(body.data);
    })()
      .catch(catchNotify(notification))
      .finally(() => setLoading(false));
  }

  function onShare() {
    setLoading(true);
    (async () => {
      const { body } = expectSuccess(await apiClient.getConnectionsSearchShare(paramsToRequest(params)));
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
              isLoading={isLoading}
              params={params}
              onChange={setParams}
              onSearch={onSearch}
              onShare={onShare}
            />
          </Container>
          <ConnectionsResults connections={connections} />
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

function paramsToRequest(params: ConnectionSearchParams): ConnectionsSearchRequest {
  return {
    origins: params.origins,
    destinations: params.destinations,
    minDeparture: params.minDeparture.toISO(),
    maxDeparture: params.maxDeparture.toISO(),
    maxFlights: params.maxFlights,
    minLayoverMS: params.minLayover.toMillis(),
    maxLayoverMS: params.maxLayover.toMillis(),
    maxDurationMS: params.maxDuration.toMillis(),
    countMultiLeg: params.countMultiLeg,
    includeAirport: params.includeAirport,
    excludeAirport: params.excludeAirport,
    includeFlightNumber: params.includeFlightNumber,
    excludeFlightNumber: params.excludeFlightNumber,
    includeAircraft: params.includeAircraft,
    excludeAircraft: params.excludeAircraft,
  };
}

function requestToParams(req: ConnectionsSearchRequest): ConnectionSearchParams {
  return {
    origins: req.origins,
    destinations: req.destinations,
    minDeparture: isoDateTime(req.minDeparture),
    maxDeparture: isoDateTime(req.maxDeparture),
    maxFlights: req.maxFlights,
    minLayover: Duration.fromMillis(req.minLayoverMS),
    maxLayover: Duration.fromMillis(req.maxLayoverMS),
    maxDuration: Duration.fromMillis(req.maxDurationMS),
    countMultiLeg: req.countMultiLeg,
    includeAirport: req.includeAirport,
    excludeAirport: req.excludeAirport,
    includeFlightNumber: req.includeFlightNumber,
    excludeFlightNumber: req.excludeFlightNumber,
    includeAircraft: req.includeAircraft,
    excludeAircraft: req.excludeAircraft,
  };
}

function isoDateTime(iso8601: string): DateTime<true> {
  const dt = DateTime.fromISO(iso8601, { setZone: true });
  if (!dt.isValid) {
    throw new Error(`invalid iso string ${iso8601}`)
  }

  return dt;
}