import React, { useCallback, useEffect } from 'react';
import {
  Button,
  ContentLayout,
  Header,
  SpaceBetween,
} from '@cloudscape-design/components';
import { useSpecialAircraftSchedules } from '../components/util/state/data';
import { UseQueryResult } from '@tanstack/react-query';
import {
  QuerySchedulesResponseV2
} from '../lib/api/api.model';
import { ErrorNotificationContent, useAppControls } from '../components/util/context/app-controls';
import { withAircraftConfigurationVersionFilter, withAircraftIdFilter } from './flight';
import { ALL_ALLEGRIS } from '../lib/consts';
import { FlightItem, QueryScheduleResult } from '../components/schedules/schedules';

export function Allegris() {
  const query = useSpecialAircraftSchedules('allegris');
  return (
    <SpecialAircraftPage
      name={'Allegris'}
      identifier={'allegris'}
      query={query}
      flightLinkQuery={useCallback((_: FlightItem) => {
        let query = new URLSearchParams();

        for (const configuration of ALL_ALLEGRIS) {
          query = withAircraftConfigurationVersionFilter(query, configuration);
        }

        return query;
      }, [])}
    />
  );
}

export function SwissA350() {
  const query = useSpecialAircraftSchedules('swiss350');
  return (
    <SpecialAircraftPage
      name={'Swiss A350'}
      identifier={'swiss350'}
      query={query}
      flightLinkQuery={useCallback((v: FlightItem) => {
        let query = new URLSearchParams();
        query = withAircraftIdFilter(query, v.aircraft.id);

        return query;
      }, [])}
    />
  );
}

export function LHA380() {
  return (
    <SpecialAircraftPageBasic
      name={'LH A380'}
      identifier={'lh380'}
    />
  );
}

export function LHA340() {
  return (
    <SpecialAircraftPageBasic
      name={'LH A340'}
      identifier={'lh340'}
    />
  );
}

export function LH747() {
  return (
    <SpecialAircraftPageBasic
      name={'LH 747'}
      identifier={'lh747'}
    />
  );
}

function SpecialAircraftPageBasic({ name, identifier }: { name: string, identifier: string }) {
  const query = useSpecialAircraftSchedules(identifier);
  return (
    <SpecialAircraftPage
      name={name}
      query={query}
      flightLinkQuery={useCallback((v: FlightItem) => {
        let query = new URLSearchParams();
        query = withAircraftIdFilter(query, v.aircraft.id);
        return query;
      }, [])}
    />
  );
}

function SpecialAircraftPage({ name, identifier, query, flightLinkQuery }: { name: string, identifier?: string, query: UseQueryResult<QuerySchedulesResponseV2>, flightLinkQuery: ((item: FlightItem) => URLSearchParams) }) {
  const { notification } = useAppControls();
  const actions = identifier
    ? (
      <SpaceBetween direction={'horizontal'} size={'xs'}>
        <Button href={`/data/schedule/${identifier}/feed.rss`} target={'_blank'} iconName={'download'}>RSS</Button>
        <Button href={`/data/schedule/${identifier}/feed.atom`} target={'_blank'} iconName={'download'}>Atom</Button>
      </SpaceBetween>
    )
    : undefined;

  useEffect(() => {
    if (query.status === 'error') {
      notification.addOnce({
        type: 'error',
        header: `Failed to load '${name}' Routes`,
        content: <ErrorNotificationContent error={query.error} />,
        dismissible: true,
      });
    }
  }, [query.status, name]);

  return (
    <ContentLayout header={<Header variant={'h1'} actions={actions}>{name} Routes</Header>}>
      <QueryScheduleResult
        data={query.data}
        flightLinkQuery={flightLinkQuery}
        loading={query.isPending}
        showMap={true}
        showStats={true}
      />
    </ContentLayout>
  );
}
