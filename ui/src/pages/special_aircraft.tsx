import React, { useCallback, useEffect } from 'react';
import { Button, ContentLayout, Header, SpaceBetween } from '@cloudscape-design/components';
import { useAllegrisSchedules, useSwissA350Schedules } from '../components/util/state/data';
import { UseQueryResult } from '@tanstack/react-query';
import { QuerySchedulesResponseV2 } from '../lib/api/api.model';
import { ErrorNotificationContent, useAppControls } from '../components/util/context/app-controls';
import { SchedulesTable, ScheduleTableItem } from '../components/schedules/schedules-table';
import {
  withAircraftConfigurationVersionFilter,
  withAircraftIdFilter,
  withDepartureAirportIdFilter,
  withDepartureDateRawFilter
} from './flight';
import { AircraftConfigurationVersion } from '../lib/consts';

export function Allegris() {
  const query = useAllegrisSchedules();
  return (
    <SpecialAircraftPage
      name={'Allegris'}
      identifier={'allegris'}
      query={query}
      flightLinkQuery={useCallback((v: ScheduleTableItem) => {
        let query = new URLSearchParams();
        query = withAircraftConfigurationVersionFilter(query, AircraftConfigurationVersion.LH_A350_900_ALLEGRIS);
        query = withAircraftConfigurationVersionFilter(query, AircraftConfigurationVersion.LH_A350_900_ALLEGRIS_FIRST);

        if (v.type === 'child') {
          query = withAircraftIdFilter(query, v.variant.aircraftId);
          query = withDepartureAirportIdFilter(query, v.item.departureAirportId);
        }

        return query;
      }, [])}
    />
  );
}

export function SwissA350() {
  const query = useSwissA350Schedules();
  return (
    <SpecialAircraftPage
      name={'Swiss A350'}
      identifier={'swiss350'}
      query={query}
      flightLinkQuery={useCallback((v: ScheduleTableItem) => {
        let query = new URLSearchParams();
        query = withDepartureDateRawFilter(query, v.operatingRange[0], '>=');
        query = withDepartureDateRawFilter(query, v.operatingRange[1], '<=');

        if (v.type === 'child') {
          query = withAircraftIdFilter(query, v.variant.aircraftId);
          query = withDepartureAirportIdFilter(query, v.item.departureAirportId);
        }

        return query;
      }, [])}
    />
  );
}

function SpecialAircraftPage({ name, identifier, query, flightLinkQuery }: { name: string, identifier: string, query: UseQueryResult<QuerySchedulesResponseV2>, flightLinkQuery?: ((item: ScheduleTableItem) => URLSearchParams) }) {
  const actions = (
    <SpaceBetween direction={'horizontal'} size={'xs'}>
      <Button href={`/data/schedule/${identifier}/feed.rss`} target={'_blank'} iconName={'download'}>RSS</Button>
      <Button href={`/data/schedule/${identifier}/feed.atom`} target={'_blank'} iconName={'download'}>Atom</Button>
    </SpaceBetween>
  );

  return (
    <ContentLayout header={<Header variant={'h1'} actions={actions}>{name} Routes</Header>}>
      <SpecialAircraftTable name={`${name} Schedules`} query={query} flightLinkQuery={flightLinkQuery} />
    </ContentLayout>
  );
}

function SpecialAircraftTable({ name, query, flightLinkQuery }: { name: string, query: UseQueryResult<QuerySchedulesResponseV2, Error>, flightLinkQuery?: ((item: ScheduleTableItem) => URLSearchParams) }) {
  const { notification } = useAppControls();

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
    <SchedulesTable
      title={name}
      result={query.data}
      variant={'stacked'}
      loading={query.isLoading}
      flightLinkQuery={flightLinkQuery}
    />
  );
}