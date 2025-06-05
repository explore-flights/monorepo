import React, { useCallback, useEffect } from 'react';
import { Button, ContentLayout, Header, SpaceBetween } from '@cloudscape-design/components';
import { useAllegrisSchedules } from '../components/util/state/data';
import { UseQueryResult } from '@tanstack/react-query';
import { QuerySchedulesResponseV2 } from '../lib/api/api.model';
import { ErrorNotificationContent, useAppControls } from '../components/util/context/app-controls';
import { SchedulesTable, ScheduleTableItem } from '../components/schedules/schedules-table';
import {
  withAircraftConfigurationVersionFilter,
  withAircraftIdFilter,
  withDepartureAirportIdFilter,
} from './flight';
import { AircraftConfigurationVersion } from '../lib/consts';

export function Allegris() {
  const query = useAllegrisSchedules();

  const actions = (
    <SpaceBetween direction={'horizontal'} size={'xs'}>
      <Button href={'/data/schedule/allegris/feed.rss'} target={'_blank'} iconName={'download'}>RSS</Button>
      <Button href={'/data/schedule/allegris/feed.atom'} target={'_blank'} iconName={'download'}>Atom</Button>
    </SpaceBetween>
  );

  return (
    <ContentLayout header={<Header variant={'h1'} actions={actions}>Allegris Routes</Header>}>
      <AllegrisTable title={'Allegris Schedules'} query={query} />
    </ContentLayout>
  );
}

function AllegrisTable({ title, query }: { title: string, query: UseQueryResult<QuerySchedulesResponseV2, Error> }) {
  const { notification } = useAppControls();

  useEffect(() => {
    if (query.status === 'error') {
      notification.addOnce({
        type: 'error',
        header: `Failed to load '${title}' Allegris Routes`,
        content: <ErrorNotificationContent error={query.error} />,
        dismissible: true,
      });
    }
  }, [query.status, title]);

  return (
    <SchedulesTable
      title={title}
      result={query.data}
      variant={'stacked'}
      loading={query.isLoading}
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