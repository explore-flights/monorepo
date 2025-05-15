import React, { useCallback, useMemo, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import {
  Alert,
  Badge,
  Box,
  Button,
  Calendar,
  ColumnLayout,
  Container,
  ContentLayout,
  DateInput, DatePicker, FormField,
  Header, KeyValuePairs,
  Link,
  Modal,
  Pagination,
  Popover,
  PropertyFilter,
  PropertyFilterProps, SpaceBetween,
  Spinner,
  StatusIndicator,
  Table
} from '@cloudscape-design/components';
import { CodeView } from '@cloudscape-design/code-view';
import jsonHighlight from '@cloudscape-design/code-view/highlight/json';
import {
  useFlightSchedule,
  useSeatMap
} from '../components/util/state/data';
import { ErrorNotificationContent } from '../components/util/context/app-controls';
import { Aircraft, Airline, Airport, AirportId, FlightNumber, FlightSchedules } from '../lib/api/api.model';
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
import { aircraftConfigurationVersionToName } from '../lib/consts';
import { AircraftConfigurationVersionText, AirportText } from '../components/common/text';
import { flightNumberToString } from '../lib/util/flight';

export function FlightView() {
  const { id } = useParams();
  if (!id) {
    throw new Error();
  }

  const [version, setVersion] = useState<DateTime<true>>();
  const flightScheduleResult = useFlightSchedule(id, version);

  if (!flightScheduleResult.data) {
    let content: React.ReactNode;
    if (flightScheduleResult.status === 'pending') {
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
      <ContentLayout header={<Header variant={'h1'} description={'Loading ...'}>{id}</Header>}>
        {content}
      </ContentLayout>
    );
  }

  return (
    <FlightScheduleContent flightSchedules={flightScheduleResult.data} version={version} setVersion={setVersion} />
  );
}

interface ScheduledFlight {
  operatedAs: [Airline, FlightNumber];
  departureAirport: Airport;
  departureTime: DateTime<true>;
  arrivalAirport: Airport;
  arrivalTime: DateTime<true>;
  serviceType: string;
  aircraftOwner: string;
  aircraft: Aircraft,
  aircraftConfigurationVersion: string;
  codeShares: ReadonlyArray<[Airline, FlightNumber]>;
}

interface FlightScheduleSummary {
  lastModified: DateTime<true>;
  departureAirports: ReadonlyArray<Airport>;
  arrivalAirports: ReadonlyArray<Airport>;
  routes: ReadonlyArray<[Airport, Airport]>;
  aircraft: ReadonlyArray<[Aircraft, number]>;
  aircraftConfigurationVersions: ReadonlyArray<string>;
  operatingDays: ReadonlyArray<WeekdayNumbers>;
  duration: {
    min: Duration<true>,
    max: Duration<true>,
  },
  operatedAs: ReadonlyArray<[Airline, FlightNumber]>,
  codeShares: ReadonlyArray<[Airline, FlightNumber]>,
}

interface ProcessedFlightSchedule {
  summary: FlightScheduleSummary;
  flights: ReadonlyArray<ScheduledFlight>;
}

function FlightScheduleContent({ flightSchedules, version, setVersion }: { flightSchedules: FlightSchedules, version?: DateTime<true>, setVersion: (v: DateTime<true>) => void }) {
  const [searchParams] = useSearchParams();
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

  const flightNumber = useMemo(() => flightNumberToString(flightSchedules.flightNumber, flightSchedules.airlines[flightSchedules.flightNumber.airlineId]), [flightSchedules.flightNumber, flightSchedules.airlines]);
  const { summary, flights, } = useMemo(() => processFlightSchedule(flightSchedules), [flightSchedules]);

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
    query = withDepartureAirportIdFilter(query, flight.departureAirport.id);
    query = withDepartureDateFilter(query, flight.departureTime);
    return query;
  }

  return (
    <ContentLayout header={<Header
      variant={'h1'}
      description={`Last updated: ${summary.lastModified.toISO()}`}
      actions={<VersionSelect selectedVersion={version} onChange={setVersion} />}
    >{flightNumber}</Header>}>
      <ColumnLayout columns={1}>
        <Container>
          <KeyValuePairs
            columns={3}
            items={[
              {
                label: 'Airline',
                value: useMemo(() => {
                  const airline = flightSchedules.airlines[flightSchedules.flightNumber.airlineId];
                  const codes: Array<string> = [];
                  if (airline.iataCode) {
                    codes.push(airline.iataCode);
                  }

                  if (airline.icaoCode) {
                    codes.push(airline.icaoCode);
                  }

                  return `${airline.name} (${codes.join('/')})`;
                }, [flightSchedules.airlines[flightSchedules.flightNumber.airlineId]]),
              },
              {
                label: 'Number',
                value: `${flightSchedules.flightNumber.number}`,
              },
              {
                label: 'Suffix',
                value: flightSchedules.flightNumber.suffix || <Popover content={'This schedule has no suffix'} dismissButton={false}><StatusIndicator type={'info'}>None</StatusIndicator></Popover>,
              },
              {
                label: 'Departure Airports',
                value: (
                  <ColumnLayout columns={1} variant={'text-grid'}>
                    {...(summary.departureAirports.map((v) => <AirportText code={v.iataCode ?? v.icaoCode ?? v.id} airport={v} />))}
                  </ColumnLayout>
                ),
              },
              {
                label: 'Arrival Airports',
                value: (
                  <ColumnLayout columns={1} variant={'text-grid'}>
                    {...(summary.arrivalAirports.map((v) => <AirportText code={v.iataCode ?? v.icaoCode ?? v.id} airport={v} />))}
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
                    {...(summary.aircraft.map(([v, count]) => <AircraftCell value={v} count={count} />))}
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
                value: <FlightNumberList flightNumbers={summary.operatedAs} exclude={flightSchedules.flightNumber} rel={'alternate'} />,
              },
              {
                label: 'Codeshares',
                value: <FlightNumberList flightNumbers={summary.codeShares} exclude={flightSchedules.flightNumber} rel={'alternate'} />,
              },
              {
                label: 'Links',
                value: (
                  <ColumnLayout columns={1} variant={'text-grid'}>
                    <Link href={`https://www.flightradar24.com/data/flights/${flightNumber.toLowerCase()}`} external={true}>flightradar24.com</Link>
                    <Link href={`https://www.flightera.net/flight/${flightNumber}`} external={true}>flightera.net</Link>
                    <Link href={`https://www.flightstats.com/v2/flight-tracker/${flightSchedules.airlines[flightSchedules.flightNumber.airlineId].iataCode}/${flightSchedules.flightNumber.number}${flightSchedules.flightNumber.suffix ?? ''}`} external={true}>flightstats.com</Link>
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
              cell: (v) => <InternalFlightLink flightNumber={v.operatedAs[1]} airline={v.operatedAs[0]} query={queryForScheduledFlight(v)} exclude={flightSchedules.flightNumber} rel={'alternate nofollow'} />,
            },
            {
              id: 'departure_airport',
              header: 'Departure Airport',
              cell: (v) => <AirportText code={v.departureAirport.iataCode ?? v.departureAirport.icaoCode ?? v.departureAirport.id} airport={v.departureAirport} />,
              sortingComparator: useCallback((a: ScheduledFlight, b: ScheduledFlight) => compareAirports(a.departureAirport, b.departureAirport), []),
            },
            {
              id: 'arrival_airport',
              header: 'Arrival Airport',
              cell: (v) => <AirportText code={v.arrivalAirport.iataCode ?? v.arrivalAirport.icaoCode ?? v.arrivalAirport.id} airport={v.arrivalAirport} />,
              sortingComparator: useCallback((a: ScheduledFlight, b: ScheduledFlight) => compareAirports(a.arrivalAirport, b.arrivalAirport), []),
            },
            {
              id: 'arrival_time',
              header: 'Arrival Time',
              cell: (v) => <TimeCell value={v.arrivalTime} />,
            },
            {
              id: 'aircraft_type',
              header: 'Aircraft',
              cell: (v) => <AircraftCell value={v.aircraft} />,
              sortingComparator: useCallback((a: ScheduledFlight, b: ScheduledFlight) => compareAircraft(a.aircraft, b.aircraft), []),
            },
            {
              id: 'aircraft_configuration_version',
              header: 'Aircraft Configuration Version',
              cell: (v) => {
                return (
                  <AircraftConfigurationVersionText
                    value={v.aircraftConfigurationVersion}
                    popoverContent={<KeyValuePairs
                      columns={2}
                      items={[
                        {
                          label: 'Code',
                          value: v.aircraftConfigurationVersion,
                        },
                        {
                          label: 'Seatmap',
                          value: <Button variant={'inline-link'} onClick={() => setSeatMapFlight(v)}>Open</Button>,
                        },
                      ]}
                    />}
                  />
                );
              },
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
              cell: (v) => <FlightNumberList flightNumbers={v.codeShares} query={queryForScheduledFlight(v)} exclude={flightSchedules.flightNumber} rel={'alternate nofollow'} />,
            },
            {
              id: 'actions',
              header: 'Actions',
              cell: (v) => {
                const baseLink = `/data/${flightNumber}/${v.departureTime.toUTC().toISODate()}/${v.departureAirport.iataCode}`;
                return (
                  <SpaceBetween direction={'vertical'} size={'xs'}>
                    <Button wrapText={false} variant={'inline-link'} href={`${baseLink}/feed.rss`} target={'_blank'} iconName={'download'}>RSS</Button>
                    <Button wrapText={false} variant={'inline-link'} href={`${baseLink}/feed.atom`} target={'_blank'} iconName={'download'}>Atom</Button>
                  </SpaceBetween>
                );
              },
            },
          ]}
        />
      </ColumnLayout>

      <SeatMapModal flight={seatMapFlight} onDismiss={() => setSeatMapFlight(undefined)} />
    </ContentLayout>
  );
}

function AircraftCell({ value, count }: { value: Aircraft, count?: number }) {
  const content = <AircraftCellContent value={value} count={count} />;
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

function AircraftCellContent({ value, count }: { value: Aircraft, count?: number }) {
  return (
    <>
      {value.name ?? value.iataCode ?? value.icaoCode ?? value.id}
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

function RouteCell({ route }: { route: [Airport, Airport] }) {
  const [departure, arrival] = route;
  return (
    <>
      <AirportText code={departure.iataCode ?? departure.icaoCode ?? departure.id} airport={departure} />
      &nbsp;—&nbsp;
      <AirportText code={arrival.iataCode ?? departure.icaoCode ?? departure.id} airport={arrival} />
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

function FlightNumberList({ flightNumbers, query, exclude, rel }: { flightNumbers: ReadonlyArray<[Airline, FlightNumber]>, query?: URLSearchParams, exclude?: FlightNumber, rel?: string }) {
  return (
    <Join
      seperator={BulletSeperator}
      items={flightNumbers.toSorted(compareFlightNumbers).map(([airline, fn]) => <InternalFlightLink flightNumber={fn} airline={airline} query={query} exclude={exclude} rel={rel} />)}
    />
  );
}

function InternalFlightLink({ flightNumber, airline, query, exclude, rel }: { flightNumber: FlightNumber, airline: Airline, query?: URLSearchParams, exclude?: FlightNumber, rel?: string }) {
  if (exclude && flightNumber.airlineId == exclude.airlineId && flightNumber.number === exclude.number && flightNumber.suffix === exclude.suffix) {
    return flightNumberToString(flightNumber, airline);
  }

  return <FlightLink flightNumber={flightNumberToString(flightNumber, airline)} query={query} rel={rel} />;
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
        ...(summary.aircraft.map(([v]) => ({ propertyKey: 'aircraft_id', value: v.id, label: v.equipCode ?? v.name ?? v.iataCode ?? v.icaoCode ?? v.id }))),
        ...(summary.aircraftConfigurationVersions.map((v) => ({ propertyKey: 'aircraft_configuration_version', value: v, label: aircraftConfigurationVersionToName(v) ?? v }))),
        ...(summary.departureAirports.map((v) => ({ propertyKey: 'departure_airport_id', value: v.id, label: v.iataCode ?? v.icaoCode ?? v.name ?? v.id }))),
        ...(summary.arrivalAirports.map((v) => ({ propertyKey: 'arrival_airport_id', value: v.id, label: v.iataCode ?? v.icaoCode ?? v.name ?? v.id }))),
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
          key: 'aircraft_id',
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
          key: 'departure_airport_id',
          operators: [
            { operator: '=', tokenType: 'enum' },
            { operator: '!=', tokenType: 'enum' },
          ],
          propertyLabel: 'Departure Airport',
          groupValuesLabel: 'Departure Airport values',
        },
        {
          key: 'arrival_airport_id',
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
        {
          key: 'departure_date_utc',
          operators: ['=', '>=', '>', '<=', '<'].map((op) => buildDateOperator(op)),
          propertyLabel: 'Departure Date UTC',
          groupValuesLabel: 'Departure Date UTC values',
        },
      ]}
    />
  );
}

function VersionSelect({ selectedVersion, onChange }: { selectedVersion?: DateTime<true>, onChange: (v: DateTime<true>) => void }) {
  const [minDate, maxDate] = useMemo(() => [Date.parse('2024-03-04T00:00:00Z'), Date.now()], []);
  const currentActiveDate = useMemo(() => (selectedVersion ?? DateTime.now()).toISODate(), [selectedVersion]);
  const [date, setDate] = useState(currentActiveDate);

  function tryParseAndValidate(d: string): DateTime<true> | undefined {
    if (d.length !== 10) {
      return undefined;
    }

    const dt = DateTime.fromISO(d, { zone: 'utc' }).endOf('day');
    if (!dt.isValid) {
      return undefined;
    }

    if (dt.toMillis() < minDate || dt.toMillis() > maxDate) {
      return undefined;
    }

    return dt;
  }

  return (
    <SpaceBetween size={'xs'} direction={'horizontal'} alignItems={'center'}>
      <Box variant={'strong'}>Version</Box>
      <DatePicker
        value={date}
        placeholder={'YYYY/MM/DD'}
        granularity={'day'}
        isDateEnabled={(d) => d.getTime() >= minDate && d.getTime() <= maxDate}
        onChange={(e) => setDate(e.detail.value)}
      />
      <Button
        disabled={date === currentActiveDate || !tryParseAndValidate(date)}
        onClick={() => {
          const dt = tryParseAndValidate(date);
          if (dt) {
            onChange(dt);
          }
        }}
        iconName={'refresh'}
      />
    </SpaceBetween>
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
  if (!(flight.departureAirport.iataCode && flight.arrivalAirport.iataCode && flight.aircraft.iataCode)) {
    return <StatusIndicator type={'info'}>Seat Map can not be displayed for this flight</StatusIndicator>;
  }

  const seatMapQuery = useSeatMap(
    flightNumberToString(flight.operatedAs[1], flight.operatedAs[0]),
    flight.departureAirport.iataCode,
    flight.arrivalAirport.iataCode,
    flight.departureTime,
    flight.aircraft.iataCode,
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

function processFlightSchedule(flightSchedules: FlightSchedules): ProcessedFlightSchedule {
  let lastModified = DateTime.fromSeconds(0);

  const departureAirports: Array<Airport> = [];
  const arrivalAirports: Array<Airport> = [];
  const routes: Array<[Airport, Airport]> = [];
  const aircraft: Array<[Aircraft, number]> = [];
  const aircraftConfigurationVersions: Array<string> = [];
  const operatingDays: Array<WeekdayNumbers> = [];
  const operatedAs: Array<[Airline, FlightNumber]> = [];
  const codeShares: Array<[Airline, FlightNumber]> = [];
  const flights: Array<ScheduledFlight> = [];

  let minDuration = Duration.fromMillis(Number.MAX_SAFE_INTEGER);
  let maxDuration = Duration.fromMillis(Number.MIN_SAFE_INTEGER);

  for (const item of flightSchedules.items) {
    if (!item.flightVariantId) {
      continue
    }

    lastModified = dateTimeMax(lastModified, DateTime.fromISO(item.version, { setZone: true }));

    const variant = flightSchedules.variants[item.flightVariantId];
    const departureAirport = flightSchedules.airports[item.departureAirportId];
    const arrivalAirport = flightSchedules.airports[variant.arrivalAirportId];
    const ac = flightSchedules.aircraft[variant.aircraftId];

    if (!departureAirports.includes(departureAirport)) {
      departureAirports.push(departureAirport);
    }

    if (!arrivalAirports.includes(arrivalAirport)) {
      arrivalAirports.push(arrivalAirport);
    }

    if (routes.findIndex((v) => v[0] === departureAirport && v[1] === arrivalAirport) === -1) {
      routes.push([departureAirport, arrivalAirport]);
    }

    let aircraftIndex = aircraft.findIndex((v) => v[0] === ac);
    if (aircraftIndex === -1) {
      aircraftIndex = aircraft.push([ac, 0]) - 1;
    }

    if (!aircraftConfigurationVersions.includes(variant.aircraftConfigurationVersion)) {
      aircraftConfigurationVersions.push(variant.aircraftConfigurationVersion);
    }

    const oas: [Airline, FlightNumber] = [flightSchedules.airlines[variant.operatedAs.airlineId], variant.operatedAs];
    if (operatedAs.findIndex((v) => compareFlightNumbers(v, oas) === 0) === -1) {
      operatedAs.push(oas);
    }

    const css: Array<[Airline, FlightNumber]> = [];
    for (const cs of item.codeShares) {
      const csAirline = flightSchedules.airlines[cs.airlineId];
      css.push([csAirline, cs]);

      if (codeShares.findIndex((v) => compareFlightNumbersPlain(v[1], cs) === 0) === -1) {
        codeShares.push([csAirline, cs]);
      }
    }

    const departureZone = FixedOffsetZone.instance(variant.departureUtcOffsetSeconds / 60);
    const arrivalZone = FixedOffsetZone.instance(variant.arrivalUtcOffsetSeconds / 60);
    const duration = Duration.fromMillis(variant.durationSeconds * 1000);
    const departureTime = DateTime.fromISO(`${item.departureDateLocal}T${variant.departureTimeLocal}.000`).setZone(departureZone, { keepLocalTime: true });
    const arrivalTime = departureTime.plus(duration).setZone(arrivalZone, { keepLocalTime: false });

    if (duration < minDuration) {
      minDuration = duration;
    }

    if (duration > maxDuration) {
      maxDuration = duration;
    }

    if (departureTime.isValid && arrivalTime.isValid) {
      if (!operatingDays.includes(departureTime.weekday)) {
        operatingDays.push(departureTime.weekday);
      }

      flights.push({
        operatedAs: oas,
        departureAirport: departureAirport,
        departureTime: departureTime,
        arrivalAirport: arrivalAirport,
        arrivalTime: arrivalTime,
        serviceType: variant.serviceType,
        aircraftOwner: variant.aircraftOwner,
        aircraft: ac,
        aircraftConfigurationVersion: variant.aircraftConfigurationVersion,
        codeShares: css,
      } satisfies ScheduledFlight);
    }
  }

  flights.sort((a, b) => a.departureTime.toMillis() - b.departureTime.toMillis());

  return {
    summary: {
      lastModified: lastModified,
      departureAirports: departureAirports,
      arrivalAirports: arrivalAirports,
      routes: routes,
      aircraft: aircraft,
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

function dateTimeMax(first: DateTime<true>, ...values: ReadonlyArray<DateTime<true | false>>): DateTime<true> {
  let max = first;
  for (const value of values) {
    if (value.isValid) {
      max = DateTime.max<[DateTime<true>, DateTime<true>]>(max, value);
    }
  }

  return max;
}

function compareFlightNumbers(v1: [Airline, FlightNumber], v2: [Airline, FlightNumber]) {
  return compareFlightNumbersPlain(v1[1], v2[1]);
}

function compareFlightNumbersPlain(v1: FlightNumber, v2: FlightNumber) {
  let cmpResult = v1.airlineId.localeCompare(v2.airlineId);
  if (cmpResult != 0) {
    return cmpResult;
  }

  cmpResult = v1.number - v2.number;
  if (cmpResult != 0) {
    return cmpResult;
  }

  return (v1.suffix ?? '').localeCompare(v2.suffix ?? '');
}

function compareAirports(v1: Airport, v2: Airport) {
  if (v1.icaoCode && v2.icaoCode) {
    return v1.icaoCode.localeCompare(v2.icaoCode);
  } else if (v1.iataCode && v2.iataCode) {
    return v1.iataCode.localeCompare(v2.iataCode);
  }

  return v1.id.localeCompare(v2.id);
}

function compareAircraft(v1: Aircraft, v2: Aircraft) {
  if (v1.icaoCode && v2.icaoCode) {
    return v1.icaoCode.localeCompare(v2.icaoCode);
  } else if (v1.iataCode && v2.iataCode) {
    return v1.iataCode.localeCompare(v2.iataCode);
  } else if (v1.equipCode && v2.equipCode) {
    return v1.equipCode.localeCompare(v2.equipCode);
  }

  return v1.id.localeCompare(v2.id);
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

    case 'aircraft_id':
      cmpResult = flight.aircraft.id.localeCompare(filterValue);
      break;

    case 'aircraft_type':
      cmpResult = flight.aircraft.iataCode?.localeCompare(filterValue) ?? 1;
      break;

    case 'aircraft_configuration_version':
      cmpResult = flight.aircraftConfigurationVersion.localeCompare(filterValue);
      break;

    case 'departure_airport_id':
      cmpResult = flight.departureAirport.id.localeCompare(filterValue);
      break;

    case 'departure_airport':
      cmpResult = flight.departureAirport.iataCode?.localeCompare(filterValue) ?? 1;
      break;

    case 'arrival_airport_id':
      cmpResult = flight.arrivalAirport.id.localeCompare(filterValue);
      break;

    case 'arrival_airport':
      cmpResult = flight.arrivalAirport.iataCode?.localeCompare(filterValue) ?? 1;
      break;

    case 'operating_day':
      cmpResult = flight.departureTime.weekday.toString(10).localeCompare(filterValue);
      break;

    case 'departure_date_utc':
      cmpResult = flight.departureTime.toUTC().toISODate().localeCompare(filterValue);
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
  for (const prop of ['departure_time', 'aircraft_type', 'aircraft_id', 'aircraft_configuration_version', 'departure_airport', 'departure_airport_id', 'arrival_airport', 'arrival_airport_id', 'operating_day', 'departure_date_utc']) {
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

  const minDepartureDate = v.get('departure_date_gte');
  if (minDepartureDate) {
    tokens.push({
      propertyKey: 'departure_time',
      value: minDepartureDate,
      operator: '>=',
    });
  }

  const maxDepartureDate = v.get('departure_date_lte');
  if (maxDepartureDate) {
    tokens.push({
      propertyKey: 'departure_time',
      value: maxDepartureDate,
      operator: '<=',
    });
  }

  if (tokens.length < 1) {
    return null;
  }

  return {
    operation: 'and',
    tokens: tokens,
  } satisfies PropertyFilterProps.Query;
}

export function withDepartureDateFilter(q: URLSearchParams, date: DateTime<true>, operator: '=' | '>=' | '<=' = '='): URLSearchParams {
  switch (operator) {
    case '=':
      q.append('departure_time', date.toISODate());
      break;

    case '>=':
      q.append('departure_date_gte', date.toISODate());
      break;

    case '<=':
      q.append('departure_date_lte', date.toISODate());
      break;
  }

  return q;
}

export function withDepartureAirportIdFilter(q: URLSearchParams, airportId: AirportId): URLSearchParams {
  q.append('departure_airport_id', airportId);
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