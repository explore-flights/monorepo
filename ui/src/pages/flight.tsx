import React, { useCallback, useMemo, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import {
  Alert, Badge, Box, Button, Calendar,
  ColumnLayout, Container,
  ContentLayout, DateInput,
  ExpandableSection, FormField,
  Header, KeyValuePairs, Link, Modal, Pagination, Popover, PropertyFilter, PropertyFilterProps,
  Spinner, StatusIndicator,
  Table
} from '@cloudscape-design/components';
import { CodeView } from '@cloudscape-design/code-view';
import jsonHighlight from '@cloudscape-design/code-view/highlight/json';
import { useAircraft, useAirports, useFlightSchedule, useSeatMap } from '../components/util/state/data';
import { ErrorNotificationContent } from '../components/util/context/app-controls';
import { Aircraft, Airport, FlightSchedule } from '../lib/api/api.model';
import { DateTime, Duration, FixedOffsetZone, WeekdayNumbers } from 'luxon';
import {
  PropertyFilterOperator,
  PropertyFilterOperatorExtended,
  useCollection
} from '@cloudscape-design/collection-hooks';
import { ApiError } from '../lib/api/api';
import { FlightLink } from '../components/common/flight-link';
import { BulletSeperator, Join } from '../components/common/join';
import { SeatMapView } from '../components/seatmap/seatmap';
import { AircraftConfigurationVersion } from '../lib/consts';

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

    if (error instanceof ApiError && error.response.status >= 400 && error.response.status < 500) {
      const query = new URLSearchParams();
      query.set('q', id);

      window.location.href = `/api/search?${query.toString()}`;
      return <></>;
    } else {
      content = (
        <Alert type={'error'}>
          <ErrorNotificationContent error={error} />
        </Alert>
      );
    }
  }

  return (
    <ContentLayout header={<Header variant={'h1'}>Flight Detail</Header>}>
      {content}
    </ContentLayout>
  )
}

interface Maybe<T> {
  raw: string;
  value?: T;
}

interface ScheduledFlight {
  operatedAs: string;
  departureAirport: Maybe<Airport>;
  departureTime: DateTime<true>;
  arrivalAirport: Maybe<Airport>;
  arrivalTime: DateTime<true>;
  serviceType: string;
  aircraftOwner: string;
  aircraft: Maybe<Aircraft>,
  aircraftConfigurationVersion: string;
  codeShares: ReadonlyArray<string>;
}

interface FlightScheduleSummary {
  departureAirports: ReadonlyArray<Maybe<Airport>>;
  arrivalAirports: ReadonlyArray<Maybe<Airport>>;
  routes: ReadonlyArray<[Maybe<Airport>, Maybe<Airport>]>;
  aircraft: ReadonlyArray<[Maybe<Aircraft>, number]>;
  aircraftConfigurationVersions: ReadonlyArray<string>;
  operatingDays: ReadonlyArray<WeekdayNumbers>;
  duration: {
    min: Duration<true>,
    max: Duration<true>,
  },
  operatedAs: ReadonlyArray<string>,
  codeShares: ReadonlyArray<string>,
}

interface ProcessedFlightSchedule {
  summary: FlightScheduleSummary;
  flights: ReadonlyArray<ScheduledFlight>;
}

function FlightScheduleContent({ flightSchedule }: { flightSchedule: FlightSchedule }) {
  const [searchParams] = useSearchParams();
  const airportLookup = useAirportLookup();
  const aircraftLookup = useAircraftLookup();

  const [filterQuery, setFilterQuery] = useState<PropertyFilterProps.Query>(parseSearchParams(searchParams) ?? {
    operation: 'and',
    tokens: [
      {
        propertyKey: 'departure_time',
        value: DateTime.now().toFormat('yyyy-MM-dd'),
        operator: '>=',
      },
    ],
  });

  const flightNumber = useMemo(() => `${flightSchedule.airline}${flightSchedule.flightNumber}${flightSchedule.suffix}`, [flightSchedule]);
  const { summary, flights, } = useMemo(() => processFlightSchedule(flightSchedule, airportLookup, aircraftLookup), [flightSchedule, airportLookup, aircraftLookup]);
  const filteredFlights = useFilteredFlights(flights, filterQuery);
  const { items, collectionProps, paginationProps } = useCollection(filteredFlights, {
    sorting: {
      defaultState: {
        isDescending: false,
        sortingColumn: {
          sortingField: 'departureTime',
        },
      },
    },
    pagination: { pageSize: 25 },
  });

  const [seatMapFlight, setSeatMapFlight] = useState<ScheduledFlight>();

  function queryForScheduledFlight(flight: ScheduledFlight) {
    let query = new URLSearchParams();
    query = withDepartureAirportFilter(query, flight.departureAirport.raw);
    query = withDepartureDateFilter(query, flight.departureTime);
    return query;
  }

  return (
    <>
      <ColumnLayout columns={1}>
        <Container>
          <KeyValuePairs
            columns={3}
            items={[
              {
                label: 'Airline',
                value: flightSchedule.airline,
              },
              {
                label: 'Number',
                value: `${flightSchedule.flightNumber}`,
              },
              {
                label: 'Suffix',
                value: flightSchedule.suffix || <Popover content={'This schedule has no suffix'} dismissButton={false}><StatusIndicator type={'info'}>None</StatusIndicator></Popover>,
              },
              {
                label: 'Departure Airports',
                value: (
                  <ColumnLayout columns={1} variant={'text-grid'}>
                    {...(summary.departureAirports.map((v) => <AirportCell {...v} />))}
                  </ColumnLayout>
                ),
              },
              {
                label: 'Arrival Airports',
                value: (
                  <ColumnLayout columns={1} variant={'text-grid'}>
                    {...(summary.arrivalAirports.map((v) => <AirportCell {...v} />))}
                  </ColumnLayout>
                ),
              },
              {
                label: 'Routes',
                value: (
                  <ColumnLayout columns={1} variant={'text-grid'}>
                    {...(summary.routes.map((v) => <RouteCell route={v} />))}
                  </ColumnLayout>
                ),
              },
              {
                label: 'Aircraft',
                value: (
                  <ColumnLayout columns={1} variant={'text-grid'}>
                    {...(summary.aircraft.map(([v, count]) => <AircraftCell {...v} count={count} />))}
                  </ColumnLayout>
                ),
              },
              {
                label: 'Duration',
                value: (
                  <ColumnLayout columns={1} variant={'text-grid'}>
                    <Box variant={'strong'}>Min: <Box variant={'span'}>{summary.duration.min.shiftTo('hours', 'minutes').toHuman({ unitDisplay: 'short' })}</Box></Box>
                    <Box variant={'strong'}>Max: <Box variant={'span'}>{summary.duration.max.shiftTo('hours', 'minutes').toHuman({ unitDisplay: 'short' })}</Box></Box>
                  </ColumnLayout>
                ),
              },
              {
                label: 'Operating Days',
                value: <OperatingDaysCell operatingDays={summary.operatingDays} />,
              },
              {
                label: 'Operated As',
                value: <FlightNumberList flightNumbers={summary.operatedAs} exclude={flightNumber} />,
              },
              {
                label: 'Codeshares',
                value: <FlightNumberList flightNumbers={summary.codeShares} exclude={flightNumber} />,
              },
              {
                label: 'Links',
                value: (
                  <ColumnLayout columns={1} variant={'text-grid'}>
                    <Link href={`https://www.flightradar24.com/data/flights/${flightNumber.toLowerCase()}`} external={true}>flightradar24.com</Link>
                    <Link href={`https://www.flightera.net/flight/${flightNumber}`} external={true}>flightera.net</Link>
                    <Link href={`https://www.flightstats.com/v2/flight-tracker/${flightSchedule.airline}/${flightSchedule.flightNumber}${flightSchedule.suffix}`} external={true}>flightstats.com</Link>
                  </ColumnLayout>
                ),
              },
            ]}
          />
        </Container>
        <Table
          items={items}
          {...collectionProps}
          header={<Header counter={`(${filteredFlights.length}/${flights.length})`}>Flights</Header>}
          pagination={<Pagination {...paginationProps}  />}
          filter={<TableFilter
            query={filterQuery}
            setQuery={setFilterQuery}
            summary={summary}
          />}
          variant={'stacked'}
          stickyColumns={{ first: 0, last: 1 }}
          columnDefinitions={[
            {
              id: 'departure_time',
              header: 'Departure Time',
              cell: (v) => <TimeCell value={v.departureTime} />,
              sortingField: 'departureTime',
            },
            {
              id: 'operated_as',
              header: 'Operated As',
              cell: (v) => <InternalFlightLink flightNumber={v.operatedAs} query={queryForScheduledFlight(v)} exclude={flightNumber} />,
            },
            {
              id: 'departure_airport',
              header: 'Departure Airport',
              cell: (v) => <AirportCell {...v.departureAirport} />,
              sortingComparator: useCallback((a: ScheduledFlight, b: ScheduledFlight) => a.departureAirport.raw.localeCompare(b.departureAirport.raw), []),
            },
            {
              id: 'arrival_airport',
              header: 'Arrival Airport',
              cell: (v) => <AirportCell {...v.arrivalAirport} />,
              sortingComparator: useCallback((a: ScheduledFlight, b: ScheduledFlight) => a.arrivalAirport.raw.localeCompare(b.arrivalAirport.raw), []),
            },
            {
              id: 'arrival_time',
              header: 'Arrival Time',
              cell: (v) => <TimeCell value={v.arrivalTime} />,
            },
            {
              id: 'aircraft_type',
              header: 'Aircraft',
              cell: (v) => <AircraftCell {...v.aircraft} />,
              sortingComparator: useCallback((a: ScheduledFlight, b: ScheduledFlight) => a.aircraft.raw.localeCompare(b.aircraft.raw), []),
            },
            {
              id: 'aircraft_configuration_version',
              header: 'Aircraft Configuration Version',
              cell: (v) => aircraftConfigurationVersionToName(v.aircraftConfigurationVersion),
              sortingField: 'aircraftConfigurationVersion',
            },
            {
              id: 'duration',
              header: 'Duration',
              cell: (v) => v.arrivalTime.diff(v.departureTime).rescale().toHuman({ unitDisplay: 'short' }),
              sortingComparator: useCallback((a: ScheduledFlight, b: ScheduledFlight) => {
                const aDuration = a.arrivalTime.diff(a.departureTime);
                const bDuration = b.arrivalTime.diff(b.departureTime);
                return aDuration.toMillis() - bDuration.toMillis();
              }, []),
            },
            {
              id: 'code_shares',
              header: 'Codeshares',
              cell: (v) => <FlightNumberList flightNumbers={v.codeShares} query={queryForScheduledFlight(v)} exclude={flightNumber} />,
            },
            {
              id: 'actions',
              header: 'Actions',
              cell: (v) => <Button onClick={() => setSeatMapFlight(v)}>Seatmap</Button>,
              width: '147px',
              minWidth: '147px',
            },
          ]}
        />
        <ExpandableSection headerText={'Raw Data'} variant={'stacked'}>
          <CodeView content={JSON.stringify(flightSchedule, null, 2)} highlight={jsonHighlight} lineNumbers={true} />
        </ExpandableSection>
      </ColumnLayout>

      <SeatMapModal flight={seatMapFlight} onDismiss={() => setSeatMapFlight(undefined)} />
    </>
  );
}

function AirportCell({ raw, value }: { raw: string, value?: Airport }) {
  if (value) {
    return <Popover content={value.name} dismissButton={false}>{raw}</Popover>;
  }

  return raw;
}

function AircraftCell({ raw, value, count }: { raw: string, value?: Aircraft, count?: number }) {
  const content = <AircraftCellContent raw={raw} value={value} count={count} />;
  if (!value) {
    return content;
  }

  return <AircraftCellPopover value={value}>{content}</AircraftCellPopover>;
}

function AircraftCellPopover({ value, children }: React.PropsWithChildren<{ value: Aircraft }>) {
  return (
    <Popover header={value.name} content={<CodeView content={JSON.stringify(value, null, 2)} highlight={jsonHighlight} />} size={'large'}>
      {children}
    </Popover>
  )
}

function AircraftCellContent({ raw, value, count }: { raw: string, value?: Aircraft, count?: number }) {
  return (
    <>
      {value?.name ?? raw}
      {!!count && (
        <>&nbsp;<Badge color={'blue'}>{count}</Badge></>
      )}
    </>
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
  )
}

function RouteCell({ route }: { route: [Maybe<Airport>, Maybe<Airport>] }) {
  const [departure, arrival] = route;
  return (
    <>
      <AirportCell {...departure} />
      &nbsp;—&nbsp;
      <AirportCell {...arrival} />
    </>
  );
}

function OperatingDaysCell({ operatingDays }: { operatingDays: ReadonlyArray<WeekdayNumbers> }) {
  const elements = useMemo(() => {
    const result: Array<React.ReactNode> = [];
    const weekdayNumber: ReadonlyArray<WeekdayNumbers> = [1, 2, 3, 4, 5, 6, 7];

    for (const n of weekdayNumber) {
      result.push(<Badge color={operatingDays.includes(n) ? 'green' : 'red'}>{weekdayNumberToName(n)}</Badge>)
    }

    return result;
  }, [operatingDays]);

  return (
    <>
      {...elements}
    </>
  );
}

function FlightNumberList({ flightNumbers, query, exclude }: { flightNumbers: ReadonlyArray<string>, query?: URLSearchParams, exclude?: string }) {
  return (
    <Join
      seperator={BulletSeperator}
      items={flightNumbers.toSorted().map((v) => <InternalFlightLink flightNumber={v} query={query} exclude={exclude} />)}
    />
  );
}

function InternalFlightLink({ flightNumber, query, exclude }: { flightNumber: string, query?: URLSearchParams, exclude?: string }) {
  if (flightNumber === exclude) {
    return flightNumber;
  }

  return <FlightLink flightNumber={flightNumber} query={query} />;
}

interface TableFilterProps {
  query: PropertyFilterProps.Query;
  setQuery: (query: PropertyFilterProps.Query) => void;
  summary: FlightScheduleSummary;
}

function TableFilter({ query, setQuery, summary }: TableFilterProps) {
  return (
    <PropertyFilter
      query={query}
      onChange={(e) => setQuery(e.detail)}
      filteringOptions={[
        ...(summary.aircraft.map(([v]) => ({ propertyKey: 'aircraft_type', value: v.raw, label: v.value?.name ?? v.raw }))),
        ...(summary.aircraftConfigurationVersions.map((v) => ({ propertyKey: 'aircraft_configuration_version', value: v, label: aircraftConfigurationVersionToName(v) }))),
        ...(summary.departureAirports.map((v) => ({ propertyKey: 'departure_airport', value: v.raw, label: v.value?.name ?? v.raw }))),
        ...(summary.arrivalAirports.map((v) => ({ propertyKey: 'arrival_airport', value: v.raw, label: v.value?.name ?? v.raw }))),
        ...(summary.operatingDays.map((v) => ({ propertyKey: 'operating_day', value: v.toString(10), label: weekdayNumberToName(v) }))),
      ]}
      filteringProperties={[
        {
          key: 'departure_time',
          operators: ['=', '>=', '>', '<=', '<'].map((op) => buildDateOperator(op)),
          propertyLabel: 'Departure Time',
          groupValuesLabel: 'Departure Time values',
        },
        {
          key: 'aircraft_type',
          operators: [
            { operator: '=', tokenType: 'enum' },
            { operator: '!=', tokenType: 'enum' },
          ],
          propertyLabel: 'Aircraft',
          groupValuesLabel: 'Aircraft values',
        },
        {
          key: 'aircraft_configuration_version',
          operators: [
            { operator: '=', tokenType: 'enum' },
            { operator: '!=', tokenType: 'enum' },
          ],
          propertyLabel: 'Aircraft Configuration Version',
          groupValuesLabel: 'Aircraft Configuration Version values',
        },
        {
          key: 'departure_airport',
          operators: [
            { operator: '=', tokenType: 'enum' },
            { operator: '!=', tokenType: 'enum' },
          ],
          propertyLabel: 'Departure Airport',
          groupValuesLabel: 'Departure Airport values',
        },
        {
          key: 'arrival_airport',
          operators: [
            { operator: '=', tokenType: 'enum' },
            { operator: '!=', tokenType: 'enum' },
          ],
          propertyLabel: 'Arrival Airport',
          groupValuesLabel: 'Arrival Airport values',
        },
        {
          key: 'operating_day',
          operators: [
            { operator: '=', tokenType: 'enum' },
            { operator: '!=', tokenType: 'enum' },
            '>=',
            '>',
            '<',
            '<=',
          ],
          propertyLabel: 'Operating Day',
          groupValuesLabel: 'Operating Day values',
        },
      ]}
    />
  );
}

function SeatMapModal({ flight, onDismiss }: { flight?: ScheduledFlight, onDismiss: () => void }) {
  return (
    <Modal
      onDismiss={onDismiss}
      visible={!!flight}
      header={flight ? `Seatmap ${flight.operatedAs}, ${flight.departureTime.toISODate()} (${flight.aircraftConfigurationVersion})` : 'Seatmap'}
      size={'large'}
    >
      {flight && <SeatMapModalContent flight={flight} />}
    </Modal>
  );
}

function SeatMapModalContent({ flight }: { flight: ScheduledFlight }) {
  const seatMapQuery = useSeatMap(
    flight.operatedAs,
    flight.departureAirport.raw,
    flight.arrivalAirport.raw,
    flight.departureTime,
    flight.aircraft.raw,
    flight.aircraftConfigurationVersion,
  );

  if (seatMapQuery.isLoading || seatMapQuery.isPending) {
    return (
      <Spinner size={'large'} />
    );
  } else if (seatMapQuery.isError) {
    return (
      <ErrorNotificationContent error={seatMapQuery.error} />
    );
  }

  return (
    <SeatMapView data={seatMapQuery.data} />
  );
}

function weekdayNumberToName(n: WeekdayNumbers): string {
  return ({
    1: 'MON',
    2: 'TUE',
    3: 'WED',
    4: 'THU',
    5: 'FRI',
    6: 'SAT',
    7: 'SUN',
  })[n];
}

function aircraftConfigurationVersionToName(v: string): string {
  return ({
    [AircraftConfigurationVersion.LH_A350_900_ALLEGRIS]: 'Allegris',
    [AircraftConfigurationVersion.LH_A350_900_ALLEGRIS_FIRST]: 'Allegris with First',
    [AircraftConfigurationVersion.LH_A350_900_LH_CONFIG]: 'A350-900 LH Config',
    [AircraftConfigurationVersion.LH_A350_900_PHILIPINE_1]: 'LH/Philippines Config 1',
    [AircraftConfigurationVersion.LH_A350_900_PHILIPINE_2]: 'LH/Philippines Config 2',
  })[v] ?? v;
}

function buildDateOperator(op: PropertyFilterOperator): PropertyFilterOperatorExtended<string> {
  return {
    operator: op,
    form: ({ value, onChange }) => (
      <div className={'date-form'}>
        <FormField>
          <DateInput
            value={value ?? ''}
            onChange={(event) => onChange(event.detail.value)}
            placeholder="YYYY-MM-DD"
          />
        </FormField>
        <Calendar value={value ?? ''} onChange={(event) => onChange(event.detail.value)} />
      </div>
    ),
    format: (v) => v,
  } satisfies PropertyFilterOperatorExtended<string>;
}

function processFlightSchedule(flightSchedule: FlightSchedule, airportLookup: Map<string, Airport>, aircraftLookup: Map<string, Aircraft>): ProcessedFlightSchedule {
  const departureAirports: Array<string> = [];
  const arrivalAirports: Array<string> = [];
  const routes: Array<[string, string]> = [];
  const aircraft: Array<[string, number]> = [];
  const aircraftConfigurationVersions: Array<string> = [];
  const operatingDays: Array<WeekdayNumbers> = [];
  const operatedAs: Array<string> = [];
  const codeShares: Array<string> = [];
  const flights: Array<ScheduledFlight> = [];

  let minDuration = Duration.fromMillis(Number.MAX_SAFE_INTEGER);
  let maxDuration = Duration.fromMillis(Number.MIN_SAFE_INTEGER);

  for (const variant of flightSchedule.variants) {
    const departureZone = FixedOffsetZone.instance(variant.data.departureUTCOffset / 60);
    const arrivalZone = FixedOffsetZone.instance(variant.data.arrivalUTCOffset / 60);

    if (!departureAirports.includes(variant.data.departureAirport)) {
      departureAirports.push(variant.data.departureAirport);
    }

    if (!arrivalAirports.includes(variant.data.arrivalAirport)) {
      arrivalAirports.push(variant.data.arrivalAirport);
    }

    if (routes.findIndex((v) => v[0] === variant.data.departureAirport && v[1] === variant.data.arrivalAirport) === -1) {
      routes.push([variant.data.departureAirport, variant.data.arrivalAirport]);
    }

    let aircraftIndex = aircraft.findIndex((v) => v[0] === variant.data.aircraftType);
    if (aircraftIndex === -1) {
      aircraftIndex = aircraft.push([variant.data.aircraftType, 0]) - 1;
    }

    if (!aircraftConfigurationVersions.includes(variant.data.aircraftConfigurationVersion)) {
      aircraftConfigurationVersions.push(variant.data.aircraftConfigurationVersion);
    }

    if (!operatedAs.includes(variant.data.operatedAs)) {
      operatedAs.push(variant.data.operatedAs);
    }

    for (const cs of variant.data.codeShares) {
      if (!codeShares.includes(cs)) {
        codeShares.push(cs);
      }
    }

    for (const range of variant.ranges) {
      const [startISODate, endISODate] = range;
      const start = DateTime.fromISO(`${startISODate}T${variant.data.departureTime}.000`).setZone(departureZone, { keepLocalTime: true });
      const end = DateTime.fromISO(`${endISODate}T${variant.data.departureTime}.000`).setZone(departureZone, { keepLocalTime: true });

      if (start.isValid && end.isValid) {
        const duration = Duration.fromMillis(variant.data.durationSeconds * 1000);
        if (duration < minDuration) {
          minDuration = duration;
        }

        if (duration > maxDuration) {
          maxDuration = duration;
        }

        let curr = start;
        while (curr <= end) {
          aircraft[aircraftIndex][1] += 1;

          if (!operatingDays.includes(curr.weekday)) {
            operatingDays.push(curr.weekday);
          }

          const arrivalTime = curr
            .plus(Duration.fromMillis(variant.data.durationSeconds * 1000))
            .setZone(arrivalZone);

          if (arrivalTime.isValid) {
            flights.push({
              ...variant.data,
              departureTime: curr,
              departureAirport: {
                raw: variant.data.departureAirport,
                value: airportLookup.get(variant.data.departureAirport)
              },
              arrivalTime: arrivalTime,
              arrivalAirport: {
                raw: variant.data.arrivalAirport,
                value: airportLookup.get(variant.data.arrivalAirport)
              },
              aircraft: {
                raw: variant.data.aircraftType,
                value: aircraftLookup.get(variant.data.aircraftType),
              }
            });
          }

          curr = curr.plus(Duration.fromObject({ days: 1 }));
        }
      }
    }
  }

  flights.sort((a, b) => a.departureTime.toMillis() - b.departureTime.toMillis());

  return {
    summary: {
      departureAirports: departureAirports.map((v) => ({ raw: v, value: airportLookup.get(v) })),
      arrivalAirports: arrivalAirports.map((v) => ({ raw: v, value: airportLookup.get(v) })),
      routes: routes.map(([a, b]) => [
        { raw: a, value: airportLookup.get(a) },
        { raw: b, value: airportLookup.get(b) },
      ]),
      aircraft: aircraft.map(([id, count]) => [{ raw: id, value: aircraftLookup.get(id) }, count]),
      aircraftConfigurationVersions: aircraftConfigurationVersions,
      operatingDays: operatingDays,
      duration: {
        min: minDuration,
        max: maxDuration,
      },
      operatedAs: operatedAs,
      codeShares: codeShares,
    },
    flights: flights,
  };
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

function useFilteredFlights(flights: ReadonlyArray<ScheduledFlight>, query: PropertyFilterProps.Query) {
  return useMemo(() => {
    if (query.tokens.length < 1) {
      return flights;
    }

    return flights.filter((v) => evaluateFilter(v, query));
  }, [flights, query]);
}

function evaluateFilter(flight: ScheduledFlight, query: PropertyFilterProps.Query) {
  if (query.tokens.length < 1) {
    return true;
  }

  for (const token of query.tokens) {
    const result = evaluateToken(flight, token);
    if (query.operation === 'and' && !result) {
      return false;
    } else if (query.operation === 'or' && result) {
      return true;
    }
  }

  return query.operation === 'and';
}

function evaluateToken(flight: ScheduledFlight, token: PropertyFilterProps.Token) {
  if (!token.propertyKey) {
    return false;
  }

  if (Array.isArray(token.value)) {
    const values = token.value as Array<string>;
    const ifMatch = token.operator === '=';

    for (const value of values) {
      if (evaluateTokenSingle(flight, token.propertyKey, '=', value)) {
        return ifMatch;
      }
    }

    return !ifMatch;
  } else {
    return evaluateTokenSingle(flight, token.propertyKey, token.operator, `${token.value}`);
  }
}

function evaluateTokenSingle(flight: ScheduledFlight, propertyKey: string, operator: string, filterValue: string) {
  let cmpResult = 0;

  switch (propertyKey) {
    case 'departure_time':
      cmpResult = flight.departureTime.toFormat('yyyy-MM-dd').localeCompare(filterValue);
      break;

    case 'aircraft_type':
      cmpResult = flight.aircraft.raw.localeCompare(filterValue);
      break;

    case 'aircraft_configuration_version':
      cmpResult = flight.aircraftConfigurationVersion.localeCompare(filterValue);
      break;

    case 'departure_airport':
      cmpResult = flight.departureAirport.raw.localeCompare(filterValue);
      break;

    case 'arrival_airport':
      cmpResult = flight.arrivalAirport.raw.localeCompare(filterValue);
      break;

    case 'operating_day':
      cmpResult = flight.departureTime.weekday.toString(10).localeCompare(filterValue);
      break;
  }

  switch (operator) {
    case '<':
      return cmpResult < 0;

    case '<=':
      return cmpResult <= 0;

    case '=':
      return cmpResult === 0;

    case '>':
      return cmpResult > 0;

    case '>=':
      return cmpResult >= 0;

    case '!=':
      return cmpResult !== 0;
  }

  return false;
}

function parseSearchParams(v: URLSearchParams): PropertyFilterProps.Query | null {
  const tokens: Array<PropertyFilterProps.Token> = [];
  for (const prop of ['departure_time', 'aircraft_type', 'aircraft_configuration_version', 'departure_airport', 'arrival_airport', 'operating_day']) {
    const values = v.getAll(prop);
    if (values.length >= 1) {
      if (values.length === 1) {
        tokens.push({
          propertyKey: prop,
          value: values[0],
          operator: '=',
        });
      } else {
        tokens.push({
          propertyKey: prop,
          value: values,
          operator: '=',
        });
      }
    }
  }

  if (tokens.length < 1) {
    return null;
  }

  return {
    operation: 'and',
    tokens: tokens,
  } satisfies PropertyFilterProps.Query;
}

export function withDepartureDateFilter(q: URLSearchParams, date: DateTime<true>): URLSearchParams {
  q.append('departure_time', date.toISODate());
  return q;
}

export function withDepartureAirportFilter(q: URLSearchParams, airport: string): URLSearchParams {
  q.append('departure_airport', airport);
  return q;
}

export function withAircraftTypeFilter(q: URLSearchParams, aircraftType: string): URLSearchParams {
  q.append('aircraft_type', aircraftType);
  return q;
}

export function withAircraftConfigurationVersionFilter(q: URLSearchParams, aircraftConfigurationVersion: string): URLSearchParams {
  q.append('aircraft_configuration_version', aircraftConfigurationVersion);
  return q;
}