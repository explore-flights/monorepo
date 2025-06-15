import React, { useCallback, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { useFlightScheduleVersions } from '../components/util/state/data';
import {
  Aircraft,
  Airline,
  Airport,
  FlightNumber,
  FlightScheduleVersions
} from '../lib/api/api.model';
import {
  Alert,
  Box, Button,
  ColumnLayout,
  Container,
  ContentLayout,
  Header, KeyValuePairs, Link, Popover, SpaceBetween,
  Spinner, StatusIndicator,
  Table
} from '@cloudscape-design/components';
import { ErrorNotificationContent } from '../components/util/context/app-controls';
import { airportToString, flightNumberToString } from '../lib/util/flight';
import { DateTime, Duration, FixedOffsetZone } from 'luxon';
import { FlightNumberList } from '../components/common/flight-link';

export function FlightVersionsView() {
  const { id, departureAirport, departureDateLocal } = useParams();
  if (!id || !departureAirport || !departureDateLocal) {
    throw new Error();
  }

  const flightVersionsResult = useFlightScheduleVersions(id, departureAirport, departureDateLocal);

  if (!flightVersionsResult.data) {
    let content: React.ReactNode;
    if (flightVersionsResult.status === 'pending') {
      content = <Spinner size={'large'} />;
    } else {
      let error = flightVersionsResult.error;
      if (!error) {
        error = new Error(flightVersionsResult.status);
      }

      content = (
        <Alert type={'error'}>
          <ErrorNotificationContent error={error} />
        </Alert>
      );
    }

    return (
      <ContentLayout header={<Header variant={'h1'} description={'Loading ...'}>{id}</Header>}>
        {content}
      </ContentLayout>
    );
  }

  return (
    <FlightVersionsContent flightVersions={flightVersionsResult.data} />
  );
}

type Changed<T> = [T, boolean];

interface BaseTableItem {
  type: 'scheduled' | 'cancelled';
  version: DateTime<true>;
}

interface FlightVersionTableItem extends BaseTableItem {
  type: 'scheduled';
  operatedAs: Changed<[Airline, FlightNumber]>;
  departureTime: Changed<DateTime<true>>;
  arrivalAirport: Changed<Airport>;
  arrivalTime: Changed<DateTime<true>>;
  serviceType: Changed<string>;
  aircraftOwner: Changed<string>;
  aircraft: Changed<Aircraft>,
  aircraftConfigurationVersion: Changed<string>;
  codeShares: Changed<ReadonlyArray<[Airline, FlightNumber]>>;
}

interface FlightCancelledTableItem extends BaseTableItem {
  type: 'cancelled';
}

type TableItem = FlightVersionTableItem | FlightCancelledTableItem;

function FlightVersionsContent({ flightVersions }: { flightVersions: FlightScheduleVersions }) {
  const [items, lastModified] = processVersions(flightVersions);

  function pageTitle() {
    const airline = flightVersions.airlines[flightVersions.flightNumber.airlineId];
    const airport = flightVersions.airports[flightVersions.departureAirportId];
    return `${flightNumberToString(flightVersions.flightNumber, airline)}, ${airportToString(airport)}, ${flightVersions.departureDateLocal}`;
  }

  const feedBaseLink = useMemo(() => {
    const airline = flightVersions.airlines[flightVersions.flightNumber.airlineId];
    const airport = flightVersions.airports[flightVersions.departureAirportId];
    const flightNumber = `${airline.iataCode}${flightVersions.flightNumber.number}${flightVersions.flightNumber.suffix ?? ''}`;
    const airportId = airport.iataCode;

    return `/data/flight/${encodeURIComponent(flightNumber)}/versions/${encodeURIComponent(airportId)}/${encodeURIComponent(flightVersions.departureDateLocal)}`;
  }, [flightVersions]);



  return (
    <ContentLayout header={
      <Header
        variant={'h1'}
        description={`Last updated: ${lastModified.toISO()}`}
        actions={
          <SpaceBetween direction={'horizontal'} size={'xs'}>
            <Button href={`${feedBaseLink}/feed.rss`} iconName={'download'} target={'_blank'} rel={'nofollow'}>RSS</Button>
            <Button href={`${feedBaseLink}/feed.atom`} iconName={'download'} target={'_blank'} rel={'nofollow'}>Atom</Button>
          </SpaceBetween>
        }
      >{pageTitle()}</Header>
    }>
      <ColumnLayout columns={1}>
        <Container>
          <KeyValuePairs
            columns={3}
            items={[
              {
                label: 'Airline',
                value: useMemo(() => {
                  const airline = flightVersions.airlines[flightVersions.flightNumber.airlineId];
                  const codes: Array<string> = [];
                  codes.push(airline.iataCode);

                  if (airline.icaoCode) {
                    codes.push(airline.icaoCode);
                  }

                  return `${airline.name} (${codes.join('/')})`;
                }, [flightVersions]),
              },
              {
                label: 'Number',
                value: `${flightVersions.flightNumber.number}`,
              },
              {
                label: 'Suffix',
                value: flightVersions.flightNumber.suffix || <Popover content={'This schedule has no suffix'} dismissButton={false}><StatusIndicator type={'info'}>None</StatusIndicator></Popover>,
              },
              {
                label: 'Departure Airport',
                value: useMemo(() => {
                  const airport = flightVersions.airports[flightVersions.departureAirportId];
                  const codes: Array<string> = [];
                  codes.push(airport.iataCode);

                  if (airport.icaoCode) {
                    codes.push(airport.icaoCode);
                  }

                  return `${airport.name ?? airport.id} (${codes.join('/')})`;
                }, [flightVersions]),
              },
              {
                label: 'Departure Date (Local)',
                value: flightVersions.departureDateLocal,
              },
              {
                label: 'Links',
                value: useMemo(() => {
                  const airline = flightVersions.airlines[flightVersions.flightNumber.airlineId];
                  const airport = flightVersions.airports[flightVersions.departureAirportId];
                  const flighteraLink = `https://www.flightera.net/en/flight_details/${airport.name ?? 'X'}/${airline.iataCode}${flightVersions.flightNumber.number}${flightVersions.flightNumber.suffix ?? ''}/${airport.icaoCode ?? airport.iataCode}/${flightVersions.departureDateLocal}`;

                  let flightStatsLink: string | null = null;
                  const parts = flightVersions.departureDateLocal.split('-', 3);
                  if (parts.length === 3) {
                    flightStatsLink = `https://www.flightstats.com/v2/flight-tracker/${airline.iataCode}/${flightVersions.flightNumber.number}${flightVersions.flightNumber.suffix ?? ''}`;

                    const query = new URLSearchParams();
                    query.set('year', parts[0]);
                    query.set('month', parts[1]);
                    query.set('date', parts[2]);

                    flightStatsLink += `?${query.toString()}`;
                  }

                  return (
                    <SpaceBetween direction={'vertical'} size={'xs'}>
                      <Link href={flighteraLink} external={true}>flightera.net</Link>
                      {flightStatsLink && <Link href={flightStatsLink} external={true}>flightstats.com</Link>}
                    </SpaceBetween>
                  );
                }, []),
              },
            ]}
          />
        </Container>

        <Table
          header={<Header counter={`(${items.length})`}>Versions</Header>}
          items={items}
          columnDefinitions={[
            {
              id: 'version',
              header: 'Version',
              cell: useCallback((v: TableItem) => <Box variant={'samp'}>{v.version.toISO()}</Box>, []),
            },
            {
              id: 'operated_as',
              header: 'Operated As',
              cell: useCallback((v: TableItem) => {
                return v.type === 'scheduled'
                  ? <WrapChanged changed={v.operatedAs}>{flightNumberToString(v.operatedAs[0][1], v.operatedAs[0][0])}</WrapChanged>
                  : (
                    <Popover content={'This flight was no longer present in the Lufthansa API. This usually means that the flight has been cancelled.'}>
                      <StatusIndicator type={'info'}>CANCELLED</StatusIndicator>
                    </Popover>
                  );
              }, []),
            },
            {
              id: 'arrival_airport',
              header: 'Arrival Airport',
              cell: useCallback((v: TableItem) => {
                return v.type === 'scheduled'
                  ? <WrapChanged changed={v.arrivalAirport}>{airportToString(v.arrivalAirport[0])}</WrapChanged>
                  : '';
              }, []),
            },
            {
              id: 'departure_time',
              header: 'Departure Time',
              cell: useCallback((v: TableItem) => {
                return v.type === 'scheduled'
                  ? <WrapChanged changed={v.departureTime}><TimeCell value={v.departureTime[0]} /></WrapChanged>
                  : '';
              }, []),
            },
            {
              id: 'arrival_time',
              header: 'Arrival Time',
              cell: useCallback((v: TableItem) => {
                return v.type === 'scheduled'
                  ? <WrapChanged changed={v.arrivalTime}><TimeCell value={v.arrivalTime[0]} /></WrapChanged>
                  : '';
              }, []),
            },
            {
              id: 'service_type',
              header: 'Service Type',
              cell: useCallback((v: TableItem) => {
                return v.type === 'scheduled'
                  ? <WrapChanged changed={v.serviceType}><Box variant={'samp'}>{v.serviceType[0]}</Box></WrapChanged>
                  : '';
              }, []),
            },
            {
              id: 'aircraft_owner',
              header: 'Aircraft Owner',
              cell: useCallback((v: TableItem) => {
                return v.type === 'scheduled'
                  ? <WrapChanged changed={v.aircraftOwner}>{v.aircraftOwner[0]}</WrapChanged>
                  : '';
              }, []),
            },
            {
              id: 'aircraft',
              header: 'Aircraft',
              cell: useCallback((v: TableItem) => {
                if (v.type !== 'scheduled') {
                  return '';
                }

                const ac = v.aircraft[0];
                return (
                  <WrapChanged changed={v.aircraft}>{ac.name ?? ac.icaoCode ?? ac.iataCode ?? ac.id}</WrapChanged>
                );
              }, []),
            },
            {
              id: 'aircraft_configuration_version',
              header: 'Aircraft Configuration',
              cell: useCallback((v: TableItem) => {
                return v.type === 'scheduled'
                  ? <WrapChanged changed={v.aircraftConfigurationVersion}><Box variant={'samp'}>{v.aircraftConfigurationVersion[0]}</Box></WrapChanged>
                  : '';
              }, []),
            },
            {
              id: 'code_shares',
              header: 'Codeshares',
              cell: useCallback((v: TableItem) => {
                return v.type === 'scheduled'
                  ? <WrapChanged changed={v.codeShares}><FlightNumberList flightNumbers={v.codeShares[0].toSorted(compareFlightNumbers)} rel={'alternate nofollow'} /></WrapChanged>
                  : '';
              }, []),
            },
          ]}
        />
      </ColumnLayout>
    </ContentLayout>
  );
}

function WrapChanged({ children, changed }: React.PropsWithChildren<{ changed: Changed<any> }>) {
  if (!changed[1]) {
    return children;
  }

  return (
    <SpaceBetween direction={'vertical'} size={'xs'}>
      <StatusIndicator type={'info'}>Changed</StatusIndicator>
      {children}
    </SpaceBetween>
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

function processVersions(flightVersions: FlightScheduleVersions): [ReadonlyArray<TableItem>, DateTime<boolean>] {
  return useMemo(() => {
    const sorted = flightVersions.versions.toSorted((a, b) => a.version.localeCompare(b.version));
    const items: Array<TableItem> = [];

    let previous: TableItem | null = null;
    for (const version of sorted) {
      const versionId = DateTime.fromISO(version.version, { setZone: true });
      if (!versionId.isValid) {
        continue;
      }

      if (!version.flightVariantId) {
        const item = {
          type: 'cancelled',
          version: versionId,
        } satisfies FlightCancelledTableItem;

        items.push(item);
        previous = item;
        continue;
      }

      const variant = flightVersions.variants[version.flightVariantId];
      const operatedAsAirline = flightVersions.airlines[variant.operatedAs.airlineId];
      const arrivalAirport = flightVersions.airports[variant.arrivalAirportId];
      const aircraft = flightVersions.aircraft[variant.aircraftId];
      const departureZone = FixedOffsetZone.instance(variant.departureUtcOffsetSeconds / 60);
      const arrivalZone = FixedOffsetZone.instance(variant.arrivalUtcOffsetSeconds / 60);
      const duration = Duration.fromMillis(variant.durationSeconds * 1000);
      const departureTime = DateTime.fromISO(`${flightVersions.departureDateLocal}T${variant.departureTimeLocal}.000`).setZone(departureZone, { keepLocalTime: true });
      const arrivalTime = departureTime.plus(duration).setZone(arrivalZone, { keepLocalTime: false });

      if (departureTime.isValid && arrivalTime.isValid) {
        let codeShares: ReadonlyArray<[Airline, FlightNumber]>;
        {
          const css: Array<[Airline, FlightNumber]> = [];
          for (const cs of variant.codeShares.toSorted(compareFlightNumbersPlain)) {
            const csAirline = flightVersions.airlines[cs.airlineId];
            css.push([csAirline, cs]);
          }

          codeShares = css;
        }

        let item: FlightVersionTableItem;
        item = {
          type: 'scheduled',
          version: versionId,
          operatedAs: buildChanged([operatedAsAirline, variant.operatedAs], 'operatedAs', previous, isSameFlightNumber),
          departureTime: buildChanged(departureTime, 'departureTime', previous, isSameTime),
          arrivalAirport: buildChanged(arrivalAirport, 'arrivalAirport', previous),
          arrivalTime: buildChanged(arrivalTime, 'arrivalTime', previous, isSameTime),
          serviceType: buildChanged(variant.serviceType, 'serviceType', previous),
          aircraftOwner: buildChanged(variant.aircraftOwner, 'aircraftOwner', previous),
          aircraft: buildChanged(aircraft, 'aircraft', previous),
          aircraftConfigurationVersion: buildChanged(variant.aircraftConfigurationVersion, 'aircraftConfigurationVersion', previous),
          codeShares: buildChanged(codeShares, 'codeShares', previous, isSameFlightNumberList),
        } satisfies FlightVersionTableItem;

        items.push(item);
        previous = item;
      }
    }

    let maxVersion = DateTime.fromISO('2024-03-04T00:00:00Z', { setZone: true });
    if (items.length > 0) {
      maxVersion = items[items.length - 1].version;
    }

    return [items.reverse(), maxVersion];
  }, [flightVersions]);
}

function isSameFlightNumberList(a: ReadonlyArray<[Airline, FlightNumber]>, b: ReadonlyArray<[Airline, FlightNumber]>) {
  if (a.length !== b.length) {
    return false;
  }

  for (let i = 0; i < a.length; i++) {
    if (!isSameFlightNumber(a[i], b[i])) {
      return false;
    }
  }

  return true;
}

function isSameFlightNumber(a: [Airline, FlightNumber], b: [Airline, FlightNumber]) {
  return compareFlightNumbers(a, b) === 0;
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


function isSameTime(a: DateTime<true>, b: DateTime<true>) {
  return a.toMillis() === b.toMillis();
}

type KeysWithType<T, TV> = { [K in keyof T]: T[K] extends TV ? K : never; }[keyof T];

function buildChanged<
  T,
  K extends KeysWithType<FlightVersionTableItem, Changed<T>>,
>(v: T, k: K, prev: TableItem | null, cmpFn?: (a: T, b: FlightVersionTableItem[K][0]) => boolean): Changed<T> {

  if (!prev) {
    return [v, false];
  } else if (prev.type !== 'scheduled') {
    return [v, true];
  }

  const prevValue = prev[k][0];
  if (cmpFn) {
    return [v, !cmpFn(v, prevValue)];
  }

  return [v, v !== prevValue];
}
