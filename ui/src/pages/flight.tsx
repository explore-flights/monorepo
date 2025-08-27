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
  DateInput, DatePicker, ExpandableSection, FormField,
  Header, KeyValuePairs, LineChart,
  Link,
  Modal,
  Pagination, PieChart,
  Popover,
  PropertyFilter,
  PropertyFilterProps, SpaceBetween,
  Spinner,
  StatusIndicator,
  Table, Tabs
} from '@cloudscape-design/components';
import { CodeView } from '@cloudscape-design/code-view';
import jsonHighlight from '@cloudscape-design/code-view/highlight/json';
import {
  useFlightSchedule,
  useSeatMap
} from '../components/util/state/data';
import { ErrorNotificationContent } from '../components/util/context/app-controls';
import { Aircraft, AircraftId, Airline, Airport, AirportId, FlightNumber, FlightSchedules } from '../lib/api/api.model';
import { DateTime, Duration, FixedOffsetZone, WeekdayNumbers } from 'luxon';
import {
  PropertyFilterOperator,
  PropertyFilterOperatorExtended,
  useCollection
} from '@cloudscape-design/collection-hooks';
import { ApiError } from '../lib/api/api';
import { FlightNumberList, InternalFlightLink } from '../components/common/flight-link';
import { SeatMapView } from '../components/seatmap/seatmap';
import { aircraftConfigurationVersionToName } from '../lib/consts';
import { AircraftConfigurationVersionText, AirportInlineText } from '../components/common/text';
import { airportToString, flightNumberToString } from '../lib/util/flight';
import {
  SeriesBuilder,
  PieChartDataBuilder,
  LineSeries,
  ThresholdSeries, BarSeries
} from '../lib/charts/builder';
import { RouterInlineLink } from '../components/common/router-link';
import { FitBounds, MaplibreMap, SmartLine } from '../components/maplibre/maplibre-map';
import { Marker } from 'react-map-gl/maplibre';
import { Feature, Point } from 'geojson';
import { bbox, featureCollection, point } from '@turf/turf';

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

interface FlightTableBaseItem {
  type: 'scheduled' | 'cancelled';
  operatedAs?: [Airline, FlightNumber];
  departureAirport: Airport;
  departureDateLocal: string;
  departureTime?: DateTime<true>;
  arrivalAirport?: Airport;
  arrivalTime?: DateTime<true>;
  serviceType?: string;
  aircraftOwner?: string;
  aircraft?: Aircraft,
  aircraftConfigurationVersion?: string;
  codeShares?: ReadonlyArray<[Airline, FlightNumber]>;
  version: DateTime<true>;
  versionCount: number;
}

interface ScheduledFlight extends FlightTableBaseItem {
  type: 'scheduled';
  operatedAs: [Airline, FlightNumber];
  departureAirport: Airport;
  departureDateLocal: string;
  departureTime: DateTime<true>;
  arrivalAirport: Airport;
  arrivalTime: DateTime<true>;
  serviceType: string;
  aircraftOwner: string;
  aircraft: Aircraft,
  aircraftConfigurationVersion: string;
  codeShares: ReadonlyArray<[Airline, FlightNumber]>;
  version: DateTime<true>;
  versionCount: number;
}

interface CancelledFlight extends FlightTableBaseItem {
  type: 'cancelled';
  operatedAs: undefined;
  departureAirport: Airport;
  departureDateLocal: string;
  departureTime: undefined;
  arrivalAirport: undefined;
  arrivalTime: undefined;
  serviceType: undefined;
  aircraftOwner: undefined;
  aircraft: undefined,
  aircraftConfigurationVersion: undefined;
  codeShares: undefined;
  version: DateTime<true>;
  versionCount: number;
}

type FlightTableItem = ScheduledFlight | CancelledFlight;

interface FlightScheduleSummary {
  lastModified: DateTime<true>;
  departureAirports: ReadonlyArray<Airport>;
  arrivalAirports: ReadonlyArray<Airport>;
  aircraft: ReadonlyArray<[Aircraft, number]>;
  aircraftConfigurationVersions: ReadonlyArray<string>;
  operatedAs: ReadonlyArray<[Airline, FlightNumber]>,
  codeShares: ReadonlyArray<[Airline, FlightNumber]>,
  relatedFlightNumbers: ReadonlyArray<[Airline, FlightNumber]>;
  years: ReadonlyArray<number>,
}

interface ProcessedFlightSchedule {
  summary: FlightScheduleSummary;
  flights: ReadonlyArray<FlightTableItem>;
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
  const departureTimeComparator = useCallback((a: FlightTableItem, b: FlightTableItem) => {
    return flightDepartureTime(a).toMillis() - flightDepartureTime(b).toMillis();
  }, []);
  const { items, collectionProps, paginationProps } = useCollection(filteredFlights, {
    sorting: {
      defaultState: {
        isDescending: false,
        sortingColumn: {
          sortingComparator: departureTimeComparator,
        },
      },
    },
    pagination: { pageSize: 25 },
  });

  const [seatMapFlight, setSeatMapFlight] = useState<ScheduledFlight>();

  function queryForFlight(flight: FlightTableItem) {
    let query = new URLSearchParams();
    query = withDepartureAirportIdFilter(query, flight.departureAirport.id);
    query = withDepartureDateRawFilter(query, flight.departureDateLocal);
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
                  codes.push(airline.iataCode);

                  if (airline.icaoCode) {
                    codes.push(airline.icaoCode);
                  }

                  return `${airline.name} (${codes.join('/')})`;
                }, [flightSchedules]),
              },
              {
                label: 'Number',
                value: `${flightSchedules.flightNumber.number}${flightSchedules.flightNumber.suffix ?? ''}`,
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
                label: 'Related',
                value: <FlightNumberList flightNumbers={summary.relatedFlightNumbers} exclude={flightSchedules.flightNumber} rel={'alternate'} />,
              },
              {
                label: 'Links',
                value: (
                  <SpaceBetween direction={'vertical'} size={'xs'}>
                    <Link href={`https://www.flightradar24.com/data/flights/${flightNumber.toLowerCase()}`} external={true}>flightradar24.com</Link>
                    <Link href={`https://www.flightera.net/flight/${flightNumber}`} external={true}>flightera.net</Link>
                    <Link href={`https://www.flightstats.com/v2/flight-tracker/${flightSchedules.airlines[flightSchedules.flightNumber.airlineId].iataCode}/${flightSchedules.flightNumber.number}${flightSchedules.flightNumber.suffix ?? ''}`} external={true}>flightstats.com</Link>
                  </SpaceBetween>
                ),
              },
            ]}
          />
        </Container>

        <>
          <Map flights={filteredFlights} />
          <Stats flights={filteredFlights} />
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
                cell: useCallback((v: FlightTableItem) => {
                  return v.type === 'scheduled'
                    ? <TimeCell value={v.departureTime} />
                    : <Box>{v.departureDateLocal}</Box>;
                }, []),
                sortingComparator: departureTimeComparator,
              },
              {
                id: 'operated_as',
                header: 'Operated As',
                cell: useCallback((v: FlightTableItem) => {
                  return v.type === 'scheduled'
                    ? <InternalFlightLink flightNumber={v.operatedAs[1]} airline={v.operatedAs[0]} query={queryForFlight(v)} exclude={flightSchedules.flightNumber} rel={'alternate nofollow'} />
                    : (
                      <Popover content={'This flight was no longer present in the Lufthansa API. This usually means that the flight has been cancelled.'}>
                        <StatusIndicator type={'info'}>CANCELLED</StatusIndicator>
                      </Popover>
                    );
                }, []),
              },
              {
                id: 'departure_airport',
                header: 'Departure Airport',
                cell: useCallback((v: FlightTableItem) => <AirportInlineText airport={v.departureAirport} />, []),
                sortingComparator: useCallback((a: FlightTableItem, b: FlightTableItem) => compareAirports(a.departureAirport, b.departureAirport), []),
              },
              {
                id: 'arrival_airport',
                header: 'Arrival Airport',
                cell: useCallback((v: FlightTableItem) => {
                  return v.type === 'scheduled'
                    ? <AirportInlineText airport={v.arrivalAirport} />
                    : '';
                }, []),
                sortingComparator: useCallback((a: FlightTableItem, b: FlightTableItem) => {
                  return compareScheduled(a, b, (a, b) => compareAirports(a.arrivalAirport, b.arrivalAirport));
                }, []),
              },
              {
                id: 'arrival_time',
                header: 'Arrival Time',
                cell: useCallback((v: FlightTableItem) => {
                  return v.type === 'scheduled'
                    ? <TimeCell value={v.arrivalTime} />
                    : '';
                }, []),
              },
              {
                id: 'aircraft_type',
                header: 'Aircraft',
                cell: useCallback((v: FlightTableItem) => {
                  return v.type === 'scheduled'
                    ? <AircraftCell value={v.aircraft} />
                    : '';
                }, []),
                sortingComparator: useCallback((a: FlightTableItem, b: FlightTableItem) => {
                  return compareScheduled(a, b, (a, b) => compareAircraft(a.aircraft, b.aircraft));
                }, []),
              },
              {
                id: 'aircraft_configuration_version',
                header: 'Aircraft Configuration',
                cell: useCallback((v: FlightTableItem) => {
                  if (v.type !== 'scheduled') {
                    return '';
                  }

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
                }, []),
                sortingField: 'aircraftConfigurationVersion',
              },
              {
                id: 'duration',
                header: 'Duration',
                cell: useCallback((v: FlightTableItem) => {
                  return v.type === 'scheduled'
                    ? v.arrivalTime.diff(v.departureTime).rescale().toHuman({ unitDisplay: 'short' })
                    : '';
                }, []),
                sortingComparator: useCallback((a: FlightTableItem, b: FlightTableItem) => {
                  return compareScheduled(a, b, (a, b) => {
                    const aDuration = a.arrivalTime.diff(a.departureTime);
                    const bDuration = b.arrivalTime.diff(b.departureTime);
                    return aDuration.toMillis() - bDuration.toMillis();
                  });
                }, []),
              },
              {
                id: 'code_shares',
                header: 'Codeshares',
                cell: useCallback((v: FlightTableItem) => {
                  return v.type === 'scheduled'
                    ? <FlightNumberList flightNumbers={v.codeShares.toSorted(compareFlightNumbers)} query={queryForFlight(v)} exclude={flightSchedules.flightNumber} rel={'alternate nofollow'} />
                    : '';
                }, []),
              },
              {
                id: 'version',
                header: 'Version',
                cell: useCallback((v: FlightTableItem) => <Box variant={'samp'}>{v.version.toISO()}</Box>, []),
                sortingField: 'version',
              },
              {
                id: 'version_count',
                header: 'Versions',
                cell: useCallback((v: FlightTableItem) => <Box variant={'samp'}>{v.versionCount}</Box>, []),
                sortingField: 'versionCount',
              },
              {
                id: 'actions',
                header: 'Actions',
                cell: useCallback((v: FlightTableItem) => {
                  const airportRef = v.departureAirport.iataCode;
                  const historyLink = `/flight/${encodeURIComponent(flightNumber)}/versions/${encodeURIComponent(airportRef)}/${encodeURIComponent(v.departureDateLocal)}`;
                  
                  return <RouterInlineLink to={historyLink} target={'_blank'}>History</RouterInlineLink>;
                }, []),
              },
            ]}
          />
        </>

      </ColumnLayout>

      <SeatMapModal flight={seatMapFlight} onDismiss={() => setSeatMapFlight(undefined)} />
    </ContentLayout>
  );
}

function Map({ flights }: { flights: ReadonlyArray<FlightTableItem> }) {
  const [markers, lines, bounds] = useMemo(() => {
    const markers: Array<React.ReactNode> = [];
    const lines: Array<React.ReactNode> = [];
    const points: Array<Feature<Point, any>> = [];
    const addedAirports = new Set<AirportId>();
    const addedRoutes = new Set<string>();

    for (const flight of flights) {
      if (flight.type !== 'scheduled' || !flight.departureAirport.location || !flight.arrivalAirport.location) {
        continue;
      }

      const departureAirport = { ...flight.departureAirport, location: flight.departureAirport.location };
      const arrivalAirport = { ...flight.arrivalAirport, location: flight.arrivalAirport.location };

      for (const airport of [{ ...departureAirport }, { ...arrivalAirport }]) {
        if (!addedAirports.has(airport.id)) {
          addedAirports.add(airport.id);

          markers.push(
            <Marker latitude={airport.location.lat} longitude={airport.location.lng}>
              <AirportInlineText airport={airport} badgeColor={'green'} renderWithPortal={true} />
            </Marker>
          );

          points.push(point([airport.location.lng, airport.location.lat]));
        }
      }

      const routeId = `${departureAirport.id}/${arrivalAirport.id}`;
      if (!addedRoutes.has(routeId)) {
        addedRoutes.add(routeId);

        lines.push(
          <SmartLine
            src={[departureAirport.location.lng, departureAirport.location.lat]}
            dst={[arrivalAirport.location.lng, arrivalAirport.location.lat]}
          />
        );
      }
    }

    let lngLatBounds: [number, number, number, number] | null = null;
    if (points.length > 0) {
      const bounds = bbox(featureCollection(points));

      if (bounds.length === 4) {
        lngLatBounds = bounds;
      } else {
        lngLatBounds = [bounds[0], bounds[1], bounds[3], bounds[4]];
      }
    }

    return [markers, lines, lngLatBounds];
  }, [flights]);

  return (
    <ExpandableSection variant={'stacked'} headerText={'Map'} headerInfo={<Box variant={'small'}>Table filters applied</Box>} defaultExpanded={true}>
      <MaplibreMap height={'50vh'}>
        {...markers}
        {...lines}
        {bounds && <FitBounds bounds={bounds} options={{ padding: 100 }} />}
      </MaplibreMap>
    </ExpandableSection>
  );
}

function Stats({ flights }: { flights: ReadonlyArray<FlightTableItem> }) {
  const now = useMemo(() => DateTime.now(), []);
  const scheduledFlights = useMemo(() => flights.filter((v) => v.type === 'scheduled'), [flights]);
  return (
    <ExpandableSection variant={'stacked'} headerText={'Stats'} headerInfo={<Box variant={'small'}>Table filters applied</Box>} defaultExpanded={false}>
      <Tabs
        tabs={[
          {
            id: 'route',
            label: 'Route',
            content: <RouteStat flights={scheduledFlights} />,
          },
          {
            id: 'aircraft',
            label: 'Aircraft',
            content: <AircraftStat now={now} flights={scheduledFlights} />,
          },
          {
            id: 'duration',
            label: 'Duration',
            content: <DurationStat now={now} flights={scheduledFlights} />,
          },
          {
            id: 'operating_day',
            label: 'Operating Day',
            content: <OperatingDayStat flights={scheduledFlights} />,
          },
        ]}
      />
    </ExpandableSection>
  );
}

function RouteStat({ flights }: { flights: ReadonlyArray<ScheduledFlight> }) {
  const data = useMemo(() => {
    const builder = new PieChartDataBuilder<string, [Airport, Airport]>(undefined, ([a1, a2]) => a1.id + a2.id);

    for (const flight of flights) {
      builder.add([flight.departureAirport, flight.arrivalAirport], 1);
    }

    return builder.data(([a1, a2]) => ({
      title: `${airportToString(a1)} \u2014 ${airportToString(a2)}`,
    }));
  }, [flights]);

  return (
    <PieChart data={data} />
  );
}

function AircraftStat({ now, flights }: { now: DateTime<true>, flights: ReadonlyArray<ScheduledFlight> }) {
  const [series, xDomain, yDomain] = useMemo(() => {
    const builder = new SeriesBuilder<string, LineSeries<Date>, [Aircraft, string]>(
      'line',
      undefined,
      ([ac, acc]) => ac.id + acc,
    );

    for (const flight of flights) {
      builder.add(
        [flight.aircraft, flight.aircraftConfigurationVersion],
        flight.departureTime.toUTC().startOf('week').toJSDate(),
        1,
      );
    }

    const [series, xDomain, yDomain] = builder.series(([aircraft, configuration]) => ({
      title: `${aircraft.name ?? aircraft.icaoCode ?? aircraft.iataCode ?? aircraft.id} (${aircraftConfigurationVersionToName(configuration) ?? configuration})`,
    }), true, true);

    return [
      [
        ...series,
        ...generateThresholds(now, xDomain),
      ] as ReadonlyArray<LineSeries<Date>>,
      xDomain,
      yDomain,
    ] as const;
  }, [now, flights]);

  return (
    <LineChart
      series={series}
      xDomain={xDomain}
      yDomain={yDomain ? [0, yDomain[1]] : undefined}
      xScaleType={'time'}
      xTitle={'Week (UTC)'}
      yTitle={'Flights'}
      xTickFormatter={(e) => DateTime.fromJSDate(e).toFormat('W/yyyy')}
    />
  );
}

function DurationStat({ now, flights }: { now: DateTime<true>, flights: ReadonlyArray<ScheduledFlight> }) {
  const durationFormatter = useCallback((v: number) => {
    return Duration.fromMillis(v).shiftTo('hours', 'minutes').toHuman({ listStyle: 'narrow', unitDisplay: 'narrow', maximumFractionDigits: 0 });
  }, []);

  const [series, xDomain, yDomain] = useMemo(() => {
    const builder = new SeriesBuilder<string, LineSeries<Date>, [Airport, Airport]>(
      'line',
      undefined,
      ([a1, a2]) => a1.id + a2.id,
    );

    for (const flight of flights) {
      builder.add(
        [flight.departureAirport, flight.arrivalAirport],
        flight.departureTime.toUTC().startOf('day').toJSDate(),
        flight.departureTime.until(flight.arrivalTime).toDuration('milliseconds').milliseconds,
      );
    }

    const [series, xDomain, yDomain] = builder.series(([a1, a2]) => ({
      title: `${airportToString(a1)} \u2014 ${airportToString(a2)}`,
      valueFormatter: (v, _) => durationFormatter(v),
    }), false, true);

    return [
      [
        ...series,
        ...generateThresholds(now, xDomain),
      ] as ReadonlyArray<LineSeries<Date>>,
      xDomain,
      yDomain,
    ] as const;
  }, [now, flights]);

  return (
    <LineChart
      series={series}
      xDomain={xDomain}
      yDomain={yDomain ? [0, yDomain[1]]: undefined}
      xScaleType={'time'}
      xTitle={'Day (UTC)'}
      yTitle={'Duration'}
      xTickFormatter={(e) => DateTime.fromJSDate(e).toFormat('yyyy-MM-dd')}
      yTickFormatter={durationFormatter}
    />
  );
}

function OperatingDayStat({ flights }: { flights: ReadonlyArray<ScheduledFlight> }) {
  const data = useMemo(() => {
    const builder = new PieChartDataBuilder<WeekdayNumbers>([1, 2, 3, 4, 5, 6, 7]);

    for (const flight of flights) {
      builder.add(flight.departureTime.weekday, 1);
    }

    return builder.data((weekday) => ({
      title: ({
        1: 'Monday',
        2: 'Tuesday',
        3: 'Wednesday',
        4: 'Thursday',
        5: 'Friday',
        6: 'Saturday',
        7: 'Sunday',
      })[weekday],
    }));
  }, [flights]);

  return (
    <PieChart data={data} />
  );
}

function generateThresholds(now: DateTime<true>, xDomain: [Date, Date] | undefined): ReadonlyArray<ThresholdSeries<any>> {
  const series: Array<ThresholdSeries<BarSeries<Date>>> = [
    {
      type: 'threshold',
      title: 'Today',
      x: now.toJSDate(),
      color: 'green',
    },
  ];

  if (!xDomain) {
    return series;
  }

  let nextScheduleChangeDT = DateTime.fromJSDate(xDomain[0]);
  let nextScheduleChangeName = '';
  if (!nextScheduleChangeDT.isValid) {
    return series;
  }

  [nextScheduleChangeDT, nextScheduleChangeName] = nextScheduleChange(nextScheduleChangeDT);
  while (nextScheduleChangeDT.toMillis() < xDomain[1].getTime()) {
    series.push({
      type: 'threshold',
      title: nextScheduleChangeName,
      x: nextScheduleChangeDT.toJSDate(),
    });

    [nextScheduleChangeDT, nextScheduleChangeName] = nextScheduleChange(nextScheduleChangeDT);
  }

  return series;
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
        ...(summary.aircraft.map(([v]) => ({ propertyKey: 'aircraft_id', value: v.id, label: v.icaoCode ?? v.name ?? v.iataCode ?? v.id }))),
        ...(summary.aircraftConfigurationVersions.map((v) => ({ propertyKey: 'aircraft_configuration_version', value: v, label: aircraftConfigurationVersionToName(v) ?? v }))),
        ...(summary.departureAirports.map((v) => ({ propertyKey: 'departure_airport_id', value: v.id, label: v.iataCode }))),
        ...(summary.arrivalAirports.map((v) => ({ propertyKey: 'arrival_airport_id', value: v.id, label: v.iataCode }))),
        ...(([1, 2, 3, 4, 5, 6, 7] satisfies Array<WeekdayNumbers>).map((v) => ({ propertyKey: 'operating_day', value: v.toString(10), label: weekdayNumberToName(v) }))),
        ...(summary.years.map((v) => ({ propertyKey: 'year', value: v.toString(10), label: v.toString(10) }))),
        {
          propertyKey: 'schedule',
          value: 'summer',
          label: 'Summer',
        },
        {
          propertyKey: 'schedule',
          value: 'winter',
          label: 'Winter',
        },
        {
          propertyKey: 'type',
          value: 'scheduled',
          label: 'Scheduled',
        },
        {
          propertyKey: 'type',
          value: 'cancelled',
          label: 'Cancelled',
        },
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
        {
          key: 'schedule',
          operators: [
            { operator: '=', tokenType: 'enum' },
          ],
          propertyLabel: 'Schedule',
          groupValuesLabel: 'Schedule values',
        },
        {
          key: 'year',
          operators: [
            { operator: '=', tokenType: 'enum' },
            { operator: '!=', tokenType: 'enum' },
          ],
          propertyLabel: 'Year',
          groupValuesLabel: 'Year values',
        },
        {
          key: 'type',
          operators: [
            { operator: '=', tokenType: 'enum' },
            { operator: '!=', tokenType: 'enum' },
          ],
          propertyLabel: 'Type',
          groupValuesLabel: 'Type values',
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
      header={flight ? `Seatmap ${flightNumberToString(flight.operatedAs[1], flight.operatedAs[0])}, ${flight.departureTime.toISODate()} (${flight.aircraftConfigurationVersion})` : 'Seatmap'}
      size={'large'}
    >
      {flight && <SeatMapModalContent flight={flight} />}
    </Modal>
  );
}

function SeatMapModalContent({ flight }: { flight: ScheduledFlight }) {
  if (!flight.aircraft.iataCode) {
    return <StatusIndicator type={'info'}>Seat Map can not be displayed for this flight</StatusIndicator>;
  }

  const seatMapQuery = useSeatMap(
    flightNumberToString(flight.operatedAs[1], flight.operatedAs[0]),
    flight.departureAirport.iataCode,
    flight.departureTime,
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
  if (!lastModified.isValid) {
    throw new Error('invalid state: DateTime.fromSeconds(0) is invalid');
  }

  const departureAirports: Array<Airport> = [];
  const arrivalAirports: Array<Airport> = [];
  const aircraft: Array<[Aircraft, number]> = [];
  const aircraftConfigurationVersions: Array<string> = [];
  const operatedAs: Array<[Airline, FlightNumber]> = [];
  const codeShares: Array<[Airline, FlightNumber]> = [];
  const years: Array<number> = [];
  const flights: Array<FlightTableItem> = [];

  for (const item of flightSchedules.items) {
    const version = DateTime.fromISO(item.version, { setZone: true });
    if (!version.isValid) {
      continue;
    }

    const departureAirport = flightSchedules.airports[item.departureAirportId];
    if (!item.flightVariantId) {
      flights.push({
        type: 'cancelled',
        operatedAs: undefined,
        departureAirport: departureAirport,
        departureDateLocal: item.departureDateLocal,
        departureTime: undefined,
        arrivalAirport: undefined,
        arrivalTime: undefined,
        serviceType: undefined,
        aircraftOwner: undefined,
        aircraft: undefined,
        aircraftConfigurationVersion: undefined,
        codeShares: undefined,
        version: version,
        versionCount: item.versionCount,
      } satisfies CancelledFlight);
      continue;
    }

    lastModified = DateTime.max(lastModified, version);

    const variant = flightSchedules.variants[item.flightVariantId];
    const arrivalAirport = flightSchedules.airports[variant.arrivalAirportId];
    const ac = flightSchedules.aircraft[variant.aircraftId];
    const css: Array<[Airline, FlightNumber]> = [];

    for (const cs of variant.codeShares) {
      const csAirline = flightSchedules.airlines[cs.airlineId];
      css.push([csAirline, cs]);

      if (codeShares.findIndex((v) => compareFlightNumbersPlain(v[1], cs) === 0) === -1) {
        codeShares.push([csAirline, cs]);
      }
    }

    if (!departureAirports.includes(departureAirport)) {
      departureAirports.push(departureAirport);
    }

    if (!arrivalAirports.includes(arrivalAirport)) {
      arrivalAirports.push(arrivalAirport);
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

    const departureZone = FixedOffsetZone.instance(variant.departureUtcOffsetSeconds / 60);
    const arrivalZone = FixedOffsetZone.instance(variant.arrivalUtcOffsetSeconds / 60);
    const duration = Duration.fromMillis(variant.durationSeconds * 1000);
    const departureTime = DateTime.fromISO(`${item.departureDateLocal}T${variant.departureTimeLocal}.000`).setZone(departureZone, { keepLocalTime: true });
    const arrivalTime = departureTime.plus(duration).setZone(arrivalZone, { keepLocalTime: false });

    if (!years.includes(departureTime.year)) {
      years.push(departureTime.year);
    }

    if (departureTime.isValid && arrivalTime.isValid && version.isValid) {
      flights.push({
        type: 'scheduled',
        operatedAs: oas,
        departureAirport: departureAirport,
        departureDateLocal: item.departureDateLocal,
        departureTime: departureTime,
        arrivalAirport: arrivalAirport,
        arrivalTime: arrivalTime,
        serviceType: variant.serviceType,
        aircraftOwner: variant.aircraftOwner,
        aircraft: ac,
        aircraftConfigurationVersion: variant.aircraftConfigurationVersion,
        codeShares: css,
        version: version,
        versionCount: item.versionCount,
      } satisfies ScheduledFlight);
    }
  }

  flights.sort((a, b) => flightDepartureTime(a).toMillis() - flightDepartureTime(b).toMillis());
  operatedAs.sort(compareFlightNumbers);
  codeShares.sort(compareFlightNumbers);

  const relatedFlightNumbers = flightSchedules.relatedFlightNumbers.map((fn) => {
    const airline = flightSchedules.airlines[fn.airlineId];
    return [airline, fn] as [Airline, FlightNumber];
  });
  relatedFlightNumbers.sort(compareFlightNumbers);

  return {
    summary: {
      lastModified: lastModified,
      departureAirports: departureAirports,
      arrivalAirports: arrivalAirports,
      aircraft: aircraft,
      aircraftConfigurationVersions: aircraftConfigurationVersions,
      operatedAs: operatedAs,
      codeShares: codeShares,
      relatedFlightNumbers: relatedFlightNumbers,
      years: years,
    },
    flights: flights,
  };
}

function compareScheduled(a: FlightTableItem, b: FlightTableItem, cmpFn: (a: ScheduledFlight, b: ScheduledFlight) => number) {
  if (a.type === 'scheduled' && b.type === 'scheduled') {
    return cmpFn(a, b);
  } else if (a.type === 'cancelled' && b.type === 'cancelled') {
    return 0;
  } else if (a.type === 'scheduled') {
    return 1;
  } else {
    return -1;
  }
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
  }

  return v1.iataCode.localeCompare(v2.iataCode);
}

function compareAircraft(v1: Aircraft, v2: Aircraft) {
  if (v1.icaoCode && v2.icaoCode) {
    return v1.icaoCode.localeCompare(v2.icaoCode);
  } else if (v1.iataCode && v2.iataCode) {
    return v1.iataCode.localeCompare(v2.iataCode);
  }

  return v1.id.localeCompare(v2.id);
}

function flightDepartureTime(flight: FlightTableItem) {
  return flight.departureTime ?? DateTime.fromISO(flight.departureDateLocal, { zone: flight.departureAirport.timezone ?? 'utc' });
}

function useFilteredFlights(flights: ReadonlyArray<FlightTableItem>, query: PropertyFilterProps.Query) {
  return useMemo(() => {
    if (query.tokens.length < 1) {
      return flights;
    }

    return flights.filter((v) => evaluateFilter(v, query));
  }, [flights, query]);
}

function evaluateFilter(flight: FlightTableItem, query: PropertyFilterProps.Query) {
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

function evaluateToken(flight: FlightTableItem, token: PropertyFilterProps.Token) {
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

function evaluateTokenSingle(flight: FlightTableItem, propertyKey: string, operator: string, filterValue: string) {
  let cmpResult = 0;

  switch (propertyKey) {
    case 'departure_time':
      cmpResult = flightDepartureTime(flight).toFormat('yyyy-MM-dd').localeCompare(filterValue);
      break;

    case 'aircraft_id':
      cmpResult = flight.type === 'scheduled'
        ? flight.aircraft.id.localeCompare(filterValue)
        : Number.NaN;
      break;

    case 'aircraft_type':
      cmpResult = flight.aircraft?.iataCode?.localeCompare(filterValue) ?? Number.NaN;
      break;

    case 'aircraft_configuration_version':
      cmpResult = flight.type === 'scheduled'
        ? flight.aircraftConfigurationVersion.localeCompare(filterValue)
        : Number.NaN;
      break;

    case 'departure_airport_id':
      cmpResult = flight.departureAirport.id.localeCompare(filterValue);
      break;

    case 'departure_airport':
      cmpResult = flight.departureAirport.iataCode.localeCompare(filterValue) ?? 1;
      break;

    case 'arrival_airport_id':
      cmpResult = flight.type === 'scheduled'
        ? flight.arrivalAirport.id.localeCompare(filterValue)
        : Number.NaN;
      break;

    case 'arrival_airport':
      cmpResult = flight.arrivalAirport?.iataCode.localeCompare(filterValue) ?? 1;
      break;

    case 'operating_day':
      cmpResult = flightDepartureTime(flight).weekday.toString(10).localeCompare(filterValue);
      break;

    case 'departure_date_utc':
      cmpResult = flightDepartureTime(flight).toUTC().toISODate()?.localeCompare(filterValue) ?? Number.NaN;
      break;

    case 'schedule':
      const departureTime = flightDepartureTime(flight);
      if (departureTime.isValid) {
        if (filterValue === 'summer') {
          cmpResult = isSummerSchedule(departureTime) ? 0 : 1;
        } else {
          cmpResult = isSummerSchedule(departureTime) ? 1 : 0;
        }
      } else {
        cmpResult = Number.NaN;
      }
      break;

    case 'year':
      cmpResult = flightDepartureTime(flight).year - Number.parseInt(filterValue, 10);
      break;

    case 'type':
      cmpResult = flight.type.localeCompare(filterValue);
      break;
  }

  if (Number.isNaN(cmpResult)) {
    return operator !== '!=';
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
  const regularProps = [
    'departure_time',
    'aircraft_type',
    'aircraft_id',
    'aircraft_configuration_version',
    'departure_airport',
    'departure_airport_id',
    'arrival_airport',
    'arrival_airport_id',
    'operating_day',
    'departure_date_utc',
    'schedule',
    'year',
    'type',
  ];

  for (const prop of regularProps) {
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

function nextScheduleChange(dt: DateTime<true>): [DateTime<true>, string] {
  if (isSummerSchedule(dt)) {
    const lastSundayOfOct = lastWeekdayOfMonth(dt, 10, 7).startOf('day');
    return [lastSundayOfOct, `Start of winter schedule ${lastSundayOfOct.year}/${lastSundayOfOct.year+1}`];
  } else {
    if (dt.month >= 10) {
      dt = dt.set({ year: dt.year + 1 });
    }

    const lastSundayOfMar = lastWeekdayOfMonth(dt, 3, 7).startOf('day');
    return [lastSundayOfMar, `Start of summer schedule ${lastSundayOfMar.year}`];
  }
}

function isSummerSchedule(dt: DateTime<true>) {
  const lastSundayOfMar = lastWeekdayOfMonth(dt, 3, 7).startOf('day').toMillis();
  const lastSaturdayOfOct = lastWeekdayOfMonth(dt, 10, 6).endOf('day').toMillis();
  const millis = dt.toMillis();

  return millis >= lastSundayOfMar && millis <= lastSaturdayOfOct;
}

function lastWeekdayOfMonth(dt: DateTime<true>, month: number, weekday: WeekdayNumbers) {
  dt = dt.set({ month: month }).endOf('month');
  if (dt.weekday === weekday) {
    return dt;
  }

  return dt.minus({ day: ((dt.weekday - weekday + 7) % 7) });
}

export function withDepartureDateRawFilter(q: URLSearchParams, date: string, operator: '=' | '>=' | '<=' = '='): URLSearchParams {
  switch (operator) {
    case '=':
      q.append('departure_time', date);
      break;

    case '>=':
      q.append('departure_date_gte', date);
      break;

    case '<=':
      q.append('departure_date_lte', date);
      break;
  }

  return q;
}

export function withDepartureDateFilter(q: URLSearchParams, date: DateTime<true>, operator: '=' | '>=' | '<=' = '='): URLSearchParams {
  return withDepartureDateRawFilter(q, date.toISODate(), operator);
}

export function withDepartureAirportIdFilter(q: URLSearchParams, airportId: AirportId): URLSearchParams {
  q.append('departure_airport_id', airportId);
  return q;
}

export function withDepartureAirportFilter(q: URLSearchParams, airport: string): URLSearchParams {
  q.append('departure_airport', airport);
  return q;
}

export function withAircraftIdFilter(q: URLSearchParams, aircraftId: AircraftId): URLSearchParams {
  q.append('aircraft_id', aircraftId);
  return q;
}

export function withAircraftConfigurationVersionFilter(q: URLSearchParams, aircraftConfigurationVersion: string): URLSearchParams {
  q.append('aircraft_configuration_version', aircraftConfigurationVersion);
  return q;
}