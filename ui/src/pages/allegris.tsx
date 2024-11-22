import React, { useCallback, useEffect } from 'react';
import { Button, ContentLayout, Header, SpaceBetween } from '@cloudscape-design/components';
import { useFlightSchedulesByConfiguration } from '../components/util/state/data';
import { UseQueryResult } from '@tanstack/react-query';
import { QueryScheduleResponse } from '../lib/api/api.model';
import { AircraftConfigurationVersion } from '../lib/consts';
import { ErrorNotificationContent, useAppControls } from '../components/util/context/app-controls';
import { SchedulesTable, ScheduleTableItem } from '../components/schedules/schedules-table';
import { withAircraftConfigurationVersionFilter, withAircraftTypeFilter, withDepartureAirportFilter } from './flight';

const AIRCRAFT_TYPE_A350_900 = '359';

export function Allegris() {
  const queryRegular = useFlightSchedulesByConfiguration('LH', AIRCRAFT_TYPE_A350_900, AircraftConfigurationVersion.LH_A350_900_ALLEGRIS);
  const queryWithFirst = useFlightSchedulesByConfiguration('LH', AIRCRAFT_TYPE_A350_900, AircraftConfigurationVersion.LH_A350_900_ALLEGRIS_FIRST);

  const actions = (
    <SpaceBetween direction={'horizontal'} size={'xs'}>
      <Button href={'/data/allegris/feed.rss'} target={'_blank'} iconName={'download'}>RSS</Button>
      <Button href={'/data/allegris/feed.atom'} target={'_blank'} iconName={'download'}>Atom</Button>
    </SpaceBetween>
  );

  return (
    <ContentLayout header={<Header variant={'h1'} actions={actions}>Allegris Routes</Header>}>
      <AllegrisTable title={'No First'} aircraftConfigurationVersion={AircraftConfigurationVersion.LH_A350_900_ALLEGRIS} query={queryRegular} />
      <AllegrisTable title={'With First'} aircraftConfigurationVersion={AircraftConfigurationVersion.LH_A350_900_ALLEGRIS_FIRST} query={queryWithFirst} />
    </ContentLayout>
  );
}

function AllegrisTable({ title, aircraftConfigurationVersion, query }: { title: string, aircraftConfigurationVersion: string, query: UseQueryResult<QueryScheduleResponse, Error> }) {
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
      items={query.data ? Object.values(query.data) : []}
      variant={'stacked'}
      loading={query.isLoading}
      flightLinkQuery={useCallback((v: ScheduleTableItem) => {
        let query = new URLSearchParams();
        query = withAircraftTypeFilter(query, AIRCRAFT_TYPE_A350_900);
        query = withAircraftConfigurationVersionFilter(query, aircraftConfigurationVersion);

        if (v.type === 'child') {
          query = withDepartureAirportFilter(query, v.variant.data.departureAirport);
        }

        return query;
      }, [aircraftConfigurationVersion])}
    />
  );
}