import React, { useCallback, useMemo } from 'react';
import { FlightItem } from './schedules';
import {
  Badge,
  Box,
  CopyToClipboard,
  ExpandableSection,
  Pagination,
  Table
} from '@cloudscape-design/components';
import { Airline, Airport, FlightNumber } from '../../lib/api/api.model';
import { DateTime, WeekdayNumbers } from 'luxon';
import { InternalFlightLink } from '../common/flight-link';
import { AirportInlineText } from '../common/text';
import { useCollection } from '@cloudscape-design/collection-hooks';
import { flightNumberToString } from '../../lib/util/flight';

interface ScheduleSummaryItem {
  flightNumber: [Airline, FlightNumber];
  departureAirport: Airport;
  arrivalAirport: Airport;
  earliestDepartureTime: DateTime<true>;
  latestDepartureTime: DateTime<true>;
  flightsByWeekday: Record<WeekdayNumbers, number>;
}

export function SchedulesSummary({ flights, loading }: { flights: ReadonlyArray<FlightItem>, loading: boolean }) {
  const rawItems = useMemo(() => {
    const result: Array<ScheduleSummaryItem> = [];
    const indexByKey = new Map<string, number>();

    for (const flight of flights) {
      const key = [
        flight.flightNumber[1].airlineId,
        flight.flightNumber[1].number,
        flight.flightNumber[1].suffix,
        flight.departureAirport.id,
        flight.arrivalAirport.id,
      ].join('|');

      let index = indexByKey.get(key);
      if (!index) {
        index = result.length;
        result.push({
          flightNumber: flight.flightNumber,
          departureAirport: flight.departureAirport,
          arrivalAirport: flight.arrivalAirport,
          earliestDepartureTime: flight.departureTime,
          latestDepartureTime: flight.departureTime,
          flightsByWeekday: {
            1: 0,
            2: 0,
            3: 0,
            4: 0,
            5: 0,
            6: 0,
            7: 0,
          },
        });
        indexByKey.set(key, index);
      }

      const item = result[index];
      item.earliestDepartureTime = DateTime.min(item.earliestDepartureTime, flight.departureTime);
      item.latestDepartureTime = DateTime.max(item.latestDepartureTime, flight.departureTime);
      item.flightsByWeekday[flight.departureTime.weekday] += 1;
    }

    return result;
  }, [flights]);

  const flightNumberComparator = useCallback((a: ScheduleSummaryItem, b: ScheduleSummaryItem) => compareFlightNumbers(a.flightNumber, b.flightNumber), []);
  const { items, collectionProps, paginationProps, allPageItems } = useCollection(rawItems, {
    sorting: {
      defaultState: {
        isDescending: false,
        sortingColumn: {
          sortingComparator: flightNumberComparator,
        },
      },
    },
    pagination: { pageSize: 25 },
  });

  return (
    <ExpandableSection
      variant={'stacked'}
      headerText={'Summary'}
      headerInfo={<Box variant={'small'}>Table filters applied</Box>}
      defaultExpanded={true}
    >
      <Table
        {...collectionProps}
        loading={loading}
        variant={'embedded'}
        items={items}
        filter={<CopyToClipboard copyButtonText={'Copy as Markdown'} copyErrorText={'Failed to copy'} copySuccessText={'Copied!'} textToCopy={useMemo(() => toMarkdownTable(allPageItems), [allPageItems])} />}
        pagination={<Pagination {...paginationProps}  />}
        columnDefinitions={[
          {
            id: 'flight_number',
            header: 'Flight Number',
            cell: useCallback((v: ScheduleSummaryItem) => <InternalFlightLink flightNumber={v.flightNumber[1]} airline={v.flightNumber[0]} rel={'alternate nofollow'} />, []),
            sortingComparator: flightNumberComparator,
          },
          {
            id: 'departure_airport',
            header: 'Departure Airport',
            cell: useCallback((v: ScheduleSummaryItem) => <AirportInlineText airport={v.departureAirport} />, []),
          },
          {
            id: 'arrival_airport',
            header: 'Arrival Airport',
            cell: useCallback((v: ScheduleSummaryItem) => <AirportInlineText airport={v.arrivalAirport} />, []),
          },
          {
            id: 'earliest_departure_time',
            header: 'Earliest Flight',
            cell: useCallback((v: ScheduleSummaryItem) => <TimeCell value={v.earliestDepartureTime} />, []),
          },
          {
            id: 'latest_departure_time',
            header: 'Latest Flight',
            cell: useCallback((v: ScheduleSummaryItem) => <TimeCell value={v.latestDepartureTime} />, []),
          },
          {
            id: 'flights_by_weekday',
            header: 'Flights per Weekday',
            cell: useCallback((v: ScheduleSummaryItem) => <FlightsByWeekdayCell flightsByWeekday={v.flightsByWeekday} />, []),
          },
        ]}
      />
    </ExpandableSection>
  );
}

function TimeCell({ value }: { value: DateTime<true> }) {
  const date = value.toFormat('yyyy-MM-dd');
  const time = value.toFormat('HH:mm (ZZ)');

  return (
    <>
      <Box>{date}</Box>
      <Box>{time}</Box>
    </>
  );
}

function FlightsByWeekdayCell({ flightsByWeekday }: { flightsByWeekday: Record<WeekdayNumbers, number> }) {
  return (
    <table>
      <thead>
      <tr>
        <th><Badge color={'grey'}>MON</Badge></th>
        <th><Badge color={'grey'}>TUE</Badge></th>
        <th><Badge color={'grey'}>WED</Badge></th>
        <th><Badge color={'grey'}>THU</Badge></th>
        <th><Badge color={'grey'}>FRI</Badge></th>
        <th><Badge color={'grey'}>SAT</Badge></th>
        <th><Badge color={'grey'}>SUN</Badge></th>
        <th><Badge color={'blue'}>TOTAL</Badge></th>
      </tr>
      </thead>
      <tbody>
      <tr>
        <td><Box textAlign={'center'}>{flightsByWeekday[1]}</Box></td>
        <td><Box textAlign={'center'}>{flightsByWeekday[2]}</Box></td>
        <td><Box textAlign={'center'}>{flightsByWeekday[3]}</Box></td>
        <td><Box textAlign={'center'}>{flightsByWeekday[4]}</Box></td>
        <td><Box textAlign={'center'}>{flightsByWeekday[5]}</Box></td>
        <td><Box textAlign={'center'}>{flightsByWeekday[6]}</Box></td>
        <td><Box textAlign={'center'}>{flightsByWeekday[7]}</Box></td>
        <td><Box textAlign={'center'}>{Object.values(flightsByWeekday).reduce((acc, val) => acc + val, 0)}</Box></td>
      </tr>
      </tbody>
    </table>
  );
}

function compareFlightNumbers(a: [Airline, FlightNumber], b: [Airline, FlightNumber]) {
  const airlineCmp = compareAirlines(a[0], b[0]);
  if (airlineCmp !== 0) {
    return airlineCmp;
  }

  const numberCmp  = a[1].number - b[1].number;
  if (numberCmp !== 0) {
    return numberCmp;
  }

  return (a[1].suffix ?? '').localeCompare(b[1].suffix ?? '');
}

function compareAirlines(a: Airline, b: Airline) {
  if (a.iataCode && b.iataCode) {
    return a.iataCode.localeCompare(b.iataCode);
  } else if (a.icaoCode && b.icaoCode) {
    return a.icaoCode.localeCompare(b.icaoCode);
  }

  return a.id.localeCompare(b.id);
}

function toMarkdownTable(items: ReadonlyArray<ScheduleSummaryItem>): string {
  let result = toMarkdownTableHeaderRow([
    'Flight Number',
    'Departure Airport',
    'Arrival Airport',
    'Earliest Flight',
    'Latest Flight',
    'Total Flights',
  ]);

  for (const item of items) {
    const flightNumber = flightNumberToString(item.flightNumber[1], item.flightNumber[0]);

    result += '\n';
    result += toMarkdownTableRow([
      `[${flightNumber}](${window.location.origin}/flight/${flightNumber})`,
      item.departureAirport.iataCode,
      item.arrivalAirport.iataCode,
      item.earliestDepartureTime.toISODate(),
      item.latestDepartureTime.toISODate(),
      Object.values(item.flightsByWeekday).reduce((acc, val) => acc + val, 0).toString(),
    ]);
  }

  return result;
}

function toMarkdownTableHeaderRow(columns: ReadonlyArray<string>): string {
  const headerRow = toMarkdownTableRow(columns);
  const separatorRow = toMarkdownTableRow(columns.map(() => '---'));

  return `${headerRow}\n${separatorRow}`;
}

function toMarkdownTableRow(items: ReadonlyArray<string>): string {
  const row = items.map((v) => v.replaceAll('|', '&#124;')).join(' | ');
  return `| ${row} |`;
}