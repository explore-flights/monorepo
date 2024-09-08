import React, { useCallback, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import {
  Alert, Box,
  ColumnLayout,
  ContentLayout,
  ExpandableSection,
  Header, Pagination, Popover,
  Spinner,
  Table
} from '@cloudscape-design/components';
import { CodeView } from '@cloudscape-design/code-view';
import jsonHighlight from '@cloudscape-design/code-view/highlight/json';
import { useAircraft, useAirports, useFlightSchedule } from '../components/util/state/data';
import { ErrorNotificationContent } from '../components/util/context/app-controls';
import { Aircraft, Airport, FlightSchedule, FlightScheduleVariantData } from '../lib/api/api.model';
import { DateTime, Duration, FixedOffsetZone } from 'luxon';
import { useCollection } from '@cloudscape-design/collection-hooks';
import { RouterLink } from '../components/common/router-link';

export function FlightView() {
  const { id } = useParams();
  if (!id) {
    throw new Error();
  }

  const flightScheduleResult = useFlightSchedule(id);
  let content: React.ReactNode;

  if (flightScheduleResult.data) {
    content = <FlightScheduleContent flightSchedule={flightScheduleResult.data} />;
  } else if (flightScheduleResult.status === 'pending') {
    content = <Spinner size={'large'} />;
  } else {
    let error = flightScheduleResult.error;
    if (!error) {
      error = new Error(flightScheduleResult.status);
    }

    content = (
      <Alert type={'error'}>
        <ErrorNotificationContent error={error} />;
      </Alert>
    );
  }

  return (
    <ContentLayout header={<Header variant={'h1'}>Flight Detail</Header>}>
      {content}
    </ContentLayout>
  )
}

type TableItem = [DateTime<true>, FlightScheduleVariantData];
function FlightScheduleContent({ flightSchedule }: { flightSchedule: FlightSchedule }) {
  const airportLookup = useAirportLookup();
  const aircraftLookup = useAircraftLookup();
  const flightNumber = useMemo(() => `${flightSchedule.airline}${flightSchedule.flightNumber}${flightSchedule.suffix}`, [flightSchedule]);
  const rawItems = useMemo(() => flattenFlightSchedule(flightSchedule), [flightSchedule]);
  const { items, collectionProps, paginationProps, allPageItems } = useCollection(rawItems, {
    sorting: {},
    pagination: { pageSize: 25 },
  });

  return (
    <ColumnLayout columns={1}>
      <Table
        items={items}
        {...collectionProps}
        header={<Header counter={`(${allPageItems.length})`}>Flights</Header>}
        pagination={<Pagination {...paginationProps}  />}
        filter={<Box variant={'small'}>Filter coming soon</Box>}
        variant={'container'}
        columnDefinitions={[
          {
            id: 'departure_time',
            header: 'Departure Time',
            cell: ([departureTime]) => <TimeCell value={departureTime} />,
            sortingComparator: useCallback((a: TableItem, b: TableItem) => a[0].toMillis() - b[0].toMillis(), []),
          },
          {
            id: 'operated_as',
            header: 'Operated As',
            cell: ([,data]) => {
              if (data.operatedAs !== flightNumber) {
                return <FlightLink flightNumber={data.operatedAs} />;
              }

              return data.operatedAs;
            },
          },
          {
            id: 'departure_airport',
            header: 'Departure Airport',
            cell: ([,data]) => <AirportCell code={data.departureAirport} lookup={airportLookup} />,
            sortingComparator: useCallback((a: TableItem, b: TableItem) => a[1].departureAirport.localeCompare(b[1].departureAirport), []),
          },
          {
            id: 'arrival_airport',
            header: 'Arrival Airport',
            cell: ([,data]) => <AirportCell code={data.arrivalAirport} lookup={airportLookup} />,
            sortingComparator: useCallback((a: TableItem, b: TableItem) => a[1].arrivalAirport.localeCompare(b[1].arrivalAirport), []),
          },
          {
            id: 'arrival_time',
            header: 'Arrival Time',
            cell: ([departureTime, data]) => {
              const arrivalTime = departureTime.plus(Duration.fromMillis(data.durationSeconds * 1000)).setZone(FixedOffsetZone.instance(data.arrivalUTCOffset / 60));
              if (!arrivalTime.isValid) {
                return 'UNKNOWN';
              }

              return <TimeCell value={arrivalTime} />;
            },
          },
          {
            id: 'aircraft',
            header: 'Aircraft',
            cell: ([,data]) => {
              const aircraft = aircraftLookup.get(data.aircraftType);
              if (aircraft) {
                return <Popover content={<CodeView content={JSON.stringify(aircraft, null, 2)} highlight={jsonHighlight} />}>{aircraft.name}</Popover>;
              }

              return data.aircraftType;
            },
            sortingComparator: useCallback((a: TableItem, b: TableItem) => a[1].aircraftType.localeCompare(b[1].aircraftType), []),
          },
          {
            id: 'code_shares',
            header: 'Codeshares',
            cell: ([,data]) => (
              <ColumnLayout columns={data.codeShares.length} variant={'text-grid'}>
                {...data.codeShares.map((v) => <FlightLink flightNumber={v} />)}
              </ColumnLayout>
            ),
          }
        ]}
      />
      <ExpandableSection headerText={'Raw Data'}>
        <CodeView content={JSON.stringify(flightSchedule, null, 2)} highlight={jsonHighlight} lineNumbers={true} />
      </ExpandableSection>
    </ColumnLayout>
  );
}

function FlightLink({ flightNumber }: { flightNumber: string }) {
  return <RouterLink to={`/flight/${encodeURIComponent(flightNumber)}`}>{flightNumber}</RouterLink>;
}

function AirportCell({ code, lookup }: { code: string, lookup: Map<string, Airport> }) {
  const airport = useMemo(() => lookup.get(code), [code, lookup]);
  if (airport) {
    return <Popover content={airport.name}>{code}</Popover>;
  }

  return code;
}

function TimeCell({ value }: { value: DateTime<true> }) {
  const date = value.toFormat('yyyy-MM-dd');
  const time = value.toFormat('HH:mm:ss (ZZ)');

  return (
    <ColumnLayout columns={2} variant={'text-grid'}>
      {date}
      {time}
    </ColumnLayout>
  )
}

function flattenFlightSchedule(flightSchedule: FlightSchedule): ReadonlyArray<TableItem> {
  const result: Array<[DateTime<true>, FlightScheduleVariantData]> = [];
  for (const variant of flightSchedule.variants) {
    let departureUTCOffsetStr = Duration.fromMillis(Math.abs(variant.data.departureUTCOffset * 1000)).toFormat('hh:mm');
    if (variant.data.departureUTCOffset >= 0) {
      departureUTCOffsetStr = '+' + departureUTCOffsetStr;
    } else {
      departureUTCOffsetStr = '-' + departureUTCOffsetStr;
    }

    for (const range of variant.ranges) {
      const [startISODate, endISODate] = range;
      const start = DateTime.fromISO(`${startISODate}T${variant.data.departureTime}.000${departureUTCOffsetStr}`, { setZone: true });
      const end = DateTime.fromISO(`${endISODate}T${variant.data.departureTime}.000${departureUTCOffsetStr}`, { setZone: true });

      if (start.isValid && end.isValid) {
        let curr = start;
        while (curr <= end) {
          result.push([curr, variant.data]);
          curr = curr.plus(Duration.fromObject({ days: 1 }));
        }
      }
    }
  }

  result.sort((a, b) => a[0].toMillis() - b[0].toMillis());
  return result;
}

function useAirportLookup() {
  const airports = useAirports().data;
  return useMemo(() => {
    const map = new Map<string, Airport>();
    for (const airport of airports.airports) {
      map.set(airport.code, airport);
    }

    for (const metroArea of airports.metropolitanAreas) {
      for (const airport of metroArea.airports) {
        map.set(airport.code, airport);
      }
    }

    return map;
  }, [airports]);
}

function useAircraftLookup() {
  const aircraft = useAircraft().data;
  return useMemo(() => {
    const map = new Map<string, Aircraft>();
    for (const v of aircraft) {
      map.set(v.code, v);
    }

    return map;
  }, [aircraft]);
}