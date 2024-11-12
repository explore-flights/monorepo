import React, { useEffect, useMemo } from 'react';
import { Box, Button, ContentLayout, Header, Pagination, SpaceBetween, Table } from '@cloudscape-design/components';
import { useQueryFlightSchedules } from '../components/util/state/data';
import { UseQueryResult } from '@tanstack/react-query';
import { QueryScheduleResponse } from '../lib/api/api.model';
import { useCollection } from '@cloudscape-design/collection-hooks';
import { FlightLink } from '../components/common/flight-link';
import {
  withAircraftConfigurationVersionFilter,
  withAircraftTypeFilter,
  withDepartureAirportFilter,
} from './flight';
import { DateTime } from 'luxon';
import { AircraftConfigurationVersion } from '../lib/consts';
import { ErrorNotificationContent, useAppControls } from '../components/util/context/app-controls';

const AIRCRAFT_TYPE_A350_900 = '359';

export function Allegris() {
  const queryRegular = useQueryFlightSchedules('LH', AIRCRAFT_TYPE_A350_900, AircraftConfigurationVersion.LH_A350_900_ALLEGRIS);
  const queryWithFirst = useQueryFlightSchedules('LH', AIRCRAFT_TYPE_A350_900, AircraftConfigurationVersion.LH_A350_900_ALLEGRIS_FIRST);

  const actions = (
    <SpaceBetween direction={'horizontal'} size={'xs'}>
      <Button href={'/data/allegris/feed.rss'} target={'_blank'} iconName={'download'}>RSS</Button>
      <Button href={'/data/allegris/feed.atom'} target={'_blank'} iconName={'download'}>Atom</Button>
    </SpaceBetween>
  );

  return (
    <ContentLayout header={<Header variant={'h1'} actions={actions}>Allegris Routes</Header>}>
      <AllegrisTable title={'No First'} query={queryRegular} />
      <AllegrisTable title={'With First'} query={queryWithFirst} />
    </ContentLayout>
  );
}

interface TableItem {
  flightNumber: string;
  departureAirport: string;
  arrivalAirport: string;
  rangeStart: DateTime<true>;
  rangeEnd: DateTime<true>;
}

function AllegrisTable({ title, query }: { title: string, query: UseQueryResult<QueryScheduleResponse, Error> }) {
  const { notification } = useAppControls();
  const rawItems = useMemo(() => {
    const result: Array<TableItem> = [];
    if (query.data) {
      for (const [flightNumber, routeAndRanges] of Object.entries(query.data)) {
        for (const routeAndRange of routeAndRanges) {
          const rangeStart = DateTime.fromISO(routeAndRange.range[0]);
          const rangeEnd = DateTime.fromISO(routeAndRange.range[1]);

          if (rangeStart.isValid && rangeEnd.isValid) {
            result.push({
              flightNumber: flightNumber,
              departureAirport: routeAndRange.departureAirport,
              arrivalAirport: routeAndRange.arrivalAirport,
              rangeStart: rangeStart,
              rangeEnd: rangeEnd,
            });
          }
        }
      }
    }

    return result;
  }, [query.data]);

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

  const { items, collectionProps, paginationProps } = useCollection(rawItems, {
    sorting: {
      defaultState: {
        isDescending: false,
        sortingColumn: {
          sortingField: 'rangeStart',
        },
      },
    },
    pagination: { pageSize: 25 },
  });

  return (
    <Table
      {...collectionProps}
      items={items}
      filter={<Header counter={`(${rawItems.length})`}>{title}</Header>}
      pagination={<Pagination {...paginationProps}  />}
      variant={'stacked'}
      loading={query.isLoading}
      empty={<Box>No flights found</Box>}
      columnDefinitions={[
        {
          id: 'flight_number',
          header: 'Flight Number',
          cell: (v) => {
            let query = new URLSearchParams();
            query = withDepartureAirportFilter(query, v.departureAirport);
            query = withAircraftTypeFilter(query, AIRCRAFT_TYPE_A350_900);
            query = withAircraftConfigurationVersionFilter(query, AircraftConfigurationVersion.LH_A350_900_ALLEGRIS);
            query = withAircraftConfigurationVersionFilter(query, AircraftConfigurationVersion.LH_A350_900_ALLEGRIS_FIRST);

            return <FlightLink flightNumber={v.flightNumber} query={query} target={'_blank'} />;
          },
          sortingField: 'flightNumber',
        },
        {
          id: 'departure_airport',
          header: 'Departure Airport',
          cell: (v) => v.departureAirport,
          sortingField: 'departureAirport',
        },
        {
          id: 'arrival_airport',
          header: 'Arrival Airport',
          cell: (v) => v.arrivalAirport,
          sortingField: 'arrivalAirport',
        },
        {
          id: 'range_start',
          header: 'First Operating Day',
          cell: (v) => v.rangeStart?.toISODate() ?? '',
          sortingField: 'rangeStart',
        },
        {
          id: 'range_end',
          header: 'Last Operating Day',
          cell: (v) => v.rangeEnd?.toISODate() ?? '',
          sortingField: 'rangeEnd',
        },
      ]}
    />
  );
}