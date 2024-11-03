import React, { useMemo, useState } from 'react';
import { Box, ContentLayout, Header, Pagination, Table } from '@cloudscape-design/components';
import { useQueryFlightSchedules } from '../components/util/state/data';
import { UseQueryResult } from '@tanstack/react-query';
import { QueryScheduleResponse } from '../lib/api/api.model';
import { useCollection } from '@cloudscape-design/collection-hooks';
import { FlightLink } from '../components/common/flight-link';
import { withDepartureAirportFilter, withDepartureDateFilter } from './flight';
import { DateTime } from 'luxon';

const AIRCRAFT_TYPE_A350_900 = '359';
const ALLEGRIS_CONFIGURATION = 'C38E24M201';
const ALLEGRIS_WITH_FIRST_CONFIGURATION = 'F4C38E24M201';

export function Allegris() {
  const queryRegular = useQueryFlightSchedules('LH', AIRCRAFT_TYPE_A350_900, ALLEGRIS_CONFIGURATION);
  const queryWithFirst = useQueryFlightSchedules('LH', AIRCRAFT_TYPE_A350_900, ALLEGRIS_WITH_FIRST_CONFIGURATION);

  return (
    <ContentLayout header={<Header variant={'h1'}>Allegris Routes</Header>}>
      <AllegrisTable title={'No First'} query={queryRegular} />
      <AllegrisTable title={'With First'} query={queryWithFirst} />
    </ContentLayout>
  )
}

interface BaseTableItem {
  flightNumber: string;
  departureAirport: string;
  arrivalAirport: string;
  rangeStart?: DateTime<true>;
  rangeEnd?: DateTime<true>;
  children?: ReadonlyArray<ChildTableItem>;
}

interface ParentTableItem extends BaseTableItem {
  children: ReadonlyArray<ChildTableItem>;
}

interface ChildTableItem extends BaseTableItem {
  rangeStart: DateTime<true>;
  rangeEnd: DateTime<true>;
  children: undefined;
}

type TableItem = ParentTableItem | ChildTableItem;

function AllegrisTable({ title, query }: { title: string, query: UseQueryResult<QueryScheduleResponse, Error> }) {
  const rawItems = useMemo(() => {
    const result: Array<TableItem> = [];
    if (query.data) {
      for (const [flightNumber, routesAndRanges] of Object.entries(query.data)) {
        for (const routeAndRanges of routesAndRanges) {
          const children: Array<ChildTableItem> = [];
          let overallRangeStart: DateTime<true> | null = null;
          let overallRangeEnd: DateTime<true> | null = null;

          for (const [rangeStartRaw, rangeEndRaw] of routeAndRanges.ranges) {
            const rangeStart = DateTime.fromISO(rangeStartRaw);
            const rangeEnd = DateTime.fromISO(rangeEndRaw);

            if (rangeStart.isValid && rangeEnd.isValid) {
              children.push({
                flightNumber: flightNumber,
                departureAirport: routeAndRanges.departureAirport,
                arrivalAirport: routeAndRanges.arrivalAirport,
                rangeStart: rangeStart,
                rangeEnd: rangeEnd,
                children: undefined,
              });

              if (!overallRangeStart || rangeStart < overallRangeStart) {
                overallRangeStart = rangeStart;
              }

              if (!overallRangeEnd || rangeEnd > overallRangeEnd) {
                overallRangeEnd = rangeEnd;
              }
            }
          }

          result.push({
            flightNumber: flightNumber,
            departureAirport: routeAndRanges.departureAirport,
            arrivalAirport: routeAndRanges.arrivalAirport,
            children: children,
            rangeStart: overallRangeStart ?? undefined,
            rangeEnd: overallRangeEnd ?? undefined,
          });
        }
      }
    }

    return result;
  }, [query.data]);

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

  const [expandedItems, setExpandedItems] = useState<ReadonlyArray<TableItem>>([]);

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

            if (!v.children) {
              query = withDepartureDateFilter(query, v.rangeStart);
            }

            return <FlightLink flightNumber={v.flightNumber} query={query} external={true} target={'_blank'} />;
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
      expandableRows={{
        getItemChildren: (item) => item.children ?? [],
        isItemExpandable: (item) => item.children !== undefined,
        expandedItems: expandedItems,
        onExpandableItemToggle: (e) => {
          const item = e.detail.item;
          const expand = e.detail.expanded;

          setExpandedItems((prev) => {
            if (expand) {
              return [...prev, item];
            }

            const index = prev.indexOf(item);
            if (index === -1) {
              return prev;
            }

            return prev.toSpliced(index, 1);
          });
        },
      }}
    />
  );
}