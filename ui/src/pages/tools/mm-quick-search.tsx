import React, { useCallback, useMemo, useState } from 'react';
import { useHttpClient } from '../../components/util/context/http-client';
import {
  ArrivalDeparture,
  FareFamily, FlightLookup,
  MilesAndMoreClient,
  MMResponse,
  Mode,
  PassengerCode,
} from '../../lib/milesandmore/client';
import {
  Alert, Box,
  Button,
  ColumnLayout,
  Container,
  ContentLayout,
  DateRangePicker,
  Form,
  FormField,
  Grid,
  Header, Link, Select, SelectProps, Table
} from '@cloudscape-design/components';
import { AirportMultiselect } from '../../components/select/airport-multiselect';
import { DateTime } from 'luxon';
import { catchNotify, useAppControls } from '../../components/util/context/app-controls';
import { useCollection } from '@cloudscape-design/collection-hooks';
import { useInterval } from '../../components/util/state/common';
import { useAirports } from '../../components/util/state/data';
import { FlightLink } from '../../components/common/flight-link';
import { withDepartureAirportFilter, withDepartureDateFilter } from '../flight';
import { BulletSeperator, Join } from '../../components/common/join';

const CABIN_OPTIONS = [
  {
    label: 'Economy',
    description: FareFamily.ECO,
    value: FareFamily.ECO,
  },
  {
    label: 'Premium Economy',
    description: FareFamily.PRECO,
    value: FareFamily.PRECO,
  },
  {
    label: 'Business',
    description: FareFamily.BUSINESS,
    value: FareFamily.BUSINESS,
  },
  {
    label: 'First',
    description: FareFamily.FIRST,
    value: FareFamily.FIRST,
  },
] satisfies ReadonlyArray<SelectProps.Option>;

interface MmSearchMatch {
  legs: ReadonlyArray<MmSearchMatchLeg>;
  miles: number;
  cash: ReadonlyArray<[string, string]>;
}

interface MmSearchMatchLeg {
  departureTime: DateTime<true>;
  departureAirport: string;
  arrivalTime: DateTime<true>;
  arrivalAirport: string;
  flight: FlightLookup;
}

export function MmQuickSearch() {
  const { httpClient } = useHttpClient();
  const { notification } = useAppControls();
  const mmClient = useMemo(() => new MilesAndMoreClient(httpClient), [httpClient]);

  const airportsQuery = useAirports();

  const [isLoading, setLoading] = useState(false);
  const [cabin, setCabin] = useState<SelectProps.Option>(CABIN_OPTIONS[2]);
  const [origins, setOrigins] = useState<ReadonlyArray<string>>([]);
  const [destinations, setDestinations] = useState<ReadonlyArray<string>>([]);
  const [minDeparture, setMinDeparture] = useState<DateTime<true>>(DateTime.now().startOf('day'));
  const [maxDeparture, setMaxDeparture] = useState<DateTime<true>>(minDeparture.endOf('month'));

  const [items, setItems] = useState<ReadonlyArray<MmSearchMatch>>([]);

  function onSearch() {
    setLoading(true);
    (async () => {
      const promises: Array<[string, string, Promise<MMResponse>]> = [];
      const fareFamily = cabin.value as FareFamily;

      for (const origin of origins) {
        for (const destination of destinations) {
          const promise = mmClient.getBestBy({
            mode: Mode.BEST_BY_DAY,
            fareFamily: fareFamily,
            travelers: [PassengerCode.ADULT],
            minDepartureDateTime: minDeparture,
            maxDepartureDateTime: maxDeparture,
            origin: origin,
            destination: destination,
          });

          promises.push([origin, destination, promise]);
        }
      }

      const allErrors: Array<string> = [];

      for (const [origin, destination, promise] of promises) {
        let res: MMResponse;
        try {
          res = await promise;
        } catch (e) {
          catchNotify(notification)(e);
          continue;
        }

        const [entries, errors] = mmResponseToEntries(origin, destination, res);
        allErrors.push(...errors);

        setItems((prev) => [...prev, ...entries]);
      }

      if (allErrors.length > 0) {
        notification.addOnce({
          type: 'warning',
          header: 'Could not display all matches',
          content: (
            <ColumnLayout columns={1}>
              {...allErrors.map((v) => <Box>{v}</Box>)}
            </ColumnLayout>
          ),
          dismissible: true,
        });
      }
    })()
      .catch(catchNotify(notification))
      .finally(() => setLoading(false));
  }

  return (
    <ContentLayout header={<Header variant={'h1'}>M&M Quick Search</Header>}>
      <ColumnLayout columns={1}>
        <ProxyConnectionAlert client={mmClient} />

        <Container>
          <Form actions={<Button onClick={onSearch} loading={isLoading} iconName={'search'}>Search</Button>}>
            <Grid
              gridDefinition={[
                { colspan: { default: 12, xs: 6, m: 3 } },
                { colspan: { default: 12, xs: 6, m: 3 } },
                { colspan: { default: 12, xs: 6, m: 3 } },
                { colspan: { default: 12, xs: 12, m: 3 } },
              ]}
            >
              <FormField label={'Cabin'}>
                <Select
                  selectedOption={cabin}
                  options={CABIN_OPTIONS}
                  onChange={(e) => setCabin(e.detail.selectedOption)}
                  disabled={isLoading}
                />
              </FormField>

              <FormField label={'Origin'}>
                <AirportMultiselect
                  airports={airportsQuery.data}
                  selectedAirportCodes={origins}
                  loading={airportsQuery.isLoading}
                  disabled={isLoading}
                  onChange={setOrigins}
                />
              </FormField>

              <FormField label={'Destination'}>
                <AirportMultiselect
                  airports={airportsQuery.data}
                  selectedAirportCodes={destinations}
                  loading={airportsQuery.isLoading}
                  disabled={isLoading}
                  onChange={setDestinations}
                />
              </FormField>

              <FormField label={'Departure'}>
                <DateRangePicker
                  value={{ type: 'absolute', startDate: minDeparture.toISO(), endDate: maxDeparture.toISO() }}
                  onChange={(e) => {
                    const value = e.detail.value;
                    if (value === null || value.type !== 'absolute') {
                      return;
                    }

                    const start = DateTime.fromISO(value.startDate, { setZone: true });
                    const end = DateTime.fromISO(value.endDate, { setZone: true });
                    if (!start.isValid || !end.isValid) {
                      return;
                    }

                    setMinDeparture(start);
                    setMaxDeparture(end);
                  }}
                  relativeOptions={[]}
                  isValidRange={(v) => {
                    if (v === null || v.type !== 'absolute') {
                      return {
                        valid: false,
                        errorMessage: 'Absolute range is required',
                      };
                    }

                    const start = DateTime.fromISO(v.startDate, { setZone: true });
                    const end = DateTime.fromISO(v.endDate, { setZone: true });
                    if (!start.isValid || !end.isValid) {
                      return {
                        valid: false,
                        errorMessage: 'Invalid dates',
                      };
                    }

                    return { valid: true };
                  }}
                  rangeSelectorMode={'absolute-only'}
                  disabled={isLoading}
                />
              </FormField>
            </Grid>
          </Form>
        </Container>

        <AvailabilityTable items={items} onClear={() => setItems([])} />
      </ColumnLayout>
    </ContentLayout>
  )
}

function ProxyConnectionAlert({ client }: { client: MilesAndMoreClient }) {
  const [connected, setConnected] = useState(false);
  const ping = useCallback(async () => setConnected(await client.ping()), [client]);
  useInterval(ping, 2500);

  if (!connected) {
    return (
      <Alert type={'warning'}>
        This page requires you to run the M&M Proxy locally.
        You can download the latest version of the proxy <Link href={'https://github.com/explore-flights/monorepo/releases/latest'} external={true}>here</Link>.
      </Alert>
    )
  }

  return (
    <Alert type={'success'}>Proxy Connected!</Alert>
  )
}

function AvailabilityTable({ items: rawItems, onClear }: { items: ReadonlyArray<MmSearchMatch>, onClear: () => void }) {
  const { items, collectionProps } = useCollection(rawItems, { sorting: {} });

  return (
    <Table
      {...collectionProps}
      header={<Header counter={`(${items.length})`} actions={<Button onClick={onClear} iconName={'remove'}>Clear</Button>}>Results</Header>}
      variant={'container'}
      items={items}
      columnDefinitions={[
        {
          id: 'departure_time',
          header: 'Departure Time',
          cell: (v) => v.legs[0].departureTime.toISO(),
          sortingComparator: useCallback((a: MmSearchMatch, b: MmSearchMatch) => {
            return compareDateTime(a.legs[0].departureTime, b.legs[0].departureTime);
          }, []),
        },
        {
          id: 'departure_airport',
          header: 'Departure Airport',
          cell: (v) => v.legs[0].departureAirport,
          sortingComparator: useCallback((a: MmSearchMatch, b: MmSearchMatch) => {
            return a.legs[0].departureAirport.localeCompare(b.legs[0].departureAirport);
          }, []),
        },
        {
          id: 'arrival_time',
          header: 'Arrival Time',
          cell: (v) => v.legs[v.legs.length - 1].arrivalTime.toISO(),
          sortingComparator: useCallback((a: MmSearchMatch, b: MmSearchMatch) => {
            return compareDateTime(a.legs[a.legs.length - 1].arrivalTime, b.legs[b.legs.length - 1].arrivalTime);
          }, []),
        },
        {
          id: 'arrival_airport',
          header: 'Arrival Airport',
          cell: (v) => v.legs[v.legs.length - 1].arrivalAirport,
          sortingComparator: useCallback((a: MmSearchMatch, b: MmSearchMatch) => {
            return a.legs[a.legs.length - 1].arrivalAirport.localeCompare(b.legs[b.legs.length - 1].arrivalAirport);
          }, []),
        },
        {
          id: 'duration',
          header: 'Duration',
          cell: (v) => {
            const start = v.legs[0].departureTime;
            const end = v.legs[v.legs.length - 1].arrivalTime;
            const duration = end.diff(start);

            return duration.rescale().toHuman();
          },
        },
        {
          id: 'route',
          header: 'Route',
          cell: (v) => {
            const route = [v.legs[0].departureAirport];

            for (const leg of v.legs) {
              route.push(leg.arrivalAirport);
            }

            return <Join seperator={BulletSeperator} items={route} />;
          },
        },
        {
          id: 'flight_numbers',
          header: 'Flight Numbers',
          cell: (v) => {
            const elements = v.legs
              .map((v) => v.flight)
              .map((v) => (<FlightNumber flightNumber={`${v.operatingAirlineCode}${v.marketingFlightNumber}`} departure={v.departure} />));

            return <Join seperator={BulletSeperator} items={elements} />;
          },
        },
        {
          id: 'miles_price',
          header: 'Miles',
          cell: (v) => {
            return v.miles;
          },
          sortingField: 'miles',
        },
        {
          id: 'cash',
          header: 'Cash',
          cell: (v) => {
            const elements = v.cash
              .map((v) => `${v[0]} ${v[1]}`)

            return <Join seperator={BulletSeperator} items={elements} />;
          },
        }
      ]}
    />
  )
}

function FlightNumber({ flightNumber, departure }: { flightNumber: string, departure: ArrivalDeparture }) {
  let query = new URLSearchParams();
  query = withDepartureAirportFilter(query, departure.locationCode);

  const date = DateTime.fromISO(departure.dateTime, { setZone: true });
  if (date.isValid) {
    query = withDepartureDateFilter(query, date);
  }

  return <FlightLink flightNumber={flightNumber} query={query} />;
}

function mmResponseToEntries(departureAirport: string, arrivalAirport: string, resp: MMResponse): [ReadonlyArray<MmSearchMatch>, ReadonlyArray<string>] {
  const allFlights: Array<MmSearchMatchLeg> = [];
  const errors: Array<string> = [];

  for (const [key, flight] of Object.entries(resp.dictionaries.flight)) {
    const departureTime = DateTime.fromISO(flight.departure.dateTime, { setZone: true });
    const arrivalTime = DateTime.fromISO(flight.arrival.dateTime, { setZone: true });

    if (departureTime.isValid && arrivalTime.isValid) {
      allFlights.push({
        departureTime: departureTime,
        departureAirport: flight.departure.locationCode,
        arrivalTime: arrivalTime,
        arrivalAirport: flight.arrival.locationCode,
        flight: flight,
      });
    } else {
      errors.push(`could not parse departure/arrival time for flight ${key}`);
    }
  }

  const result: Array<MmSearchMatch> = [];

  for (const entry of resp.data) {
    let numFlights = 0;
    for (const bound of entry.bounds) {
      numFlights += bound.flights.length;
    }

    if (numFlights < 1) {
      errors.push(`found match for ${departureAirport}-${arrivalAirport} on ${entry.departureDate}, but match does not have any flights`);
      continue
    }

    const legs = findMatchingLegs(allFlights, departureAirport, entry.departureDate, arrivalAirport, numFlights);
    if (!legs) {
      errors.push(`found match for ${departureAirport}-${arrivalAirport} on ${entry.departureDate}, but no flights could be matched from the response`);
      continue
    }

    result.push({
      legs: legs.toSorted((a, b) => compareDateTime(a.departureTime, b.departureTime)),
      miles: entry.prices.milesConversion.convertedMiles.base,
      cash: entry.prices.totalPrices
        .map((v) => {
          const currency = resp.dictionaries.currency[v.currencyCode] ?? { name: v.currencyCode, decimalPlaces: 0 };
          const decimals = currency.decimalPlaces;

          return [
            (v.totalTaxes / Math.pow(10, decimals)).toFixed(decimals),
            v.currencyCode,
          ];
        }),
    });
  }

  return [result, errors];
}

function findMatchingLegs(allFlights: ReadonlyArray<MmSearchMatchLeg>, departureAirport: string, departureDate: string, arrivalAirport: string, numFlights: number): ReadonlyArray<MmSearchMatchLeg> | null {
  const potentialResults: Array<ReadonlyArray<MmSearchMatchLeg>> = [];

  for (const flight of allFlights) {
    if (flight.departureAirport === departureAirport && flight.departureTime.toISODate() === departureDate) {
      const following = findFollowingLegs(allFlights, flight.arrivalAirport, arrivalAirport, numFlights - 1, flight.arrivalTime);
      if (following) {
        potentialResults.push([flight, ...following]);
      }
    }
  }

  if (potentialResults.length !== 1) {
    return null;
  }

  return potentialResults[0];
}

function findFollowingLegs(allFlights: ReadonlyArray<MmSearchMatchLeg>, departureAirport: string, arrivalAirport: string, numFlights: number, offset: DateTime<true>): ReadonlyArray<MmSearchMatchLeg> | null {
  if (numFlights < 1) {
    return [];
  }

  const potentialResults: Array<ReadonlyArray<MmSearchMatchLeg>> = [];

  for (const flight of allFlights) {
    if (flight.departureAirport === departureAirport && flight.departureTime >= offset) {
      if (numFlights > 1 && flight.arrivalAirport !== arrivalAirport) {
        const following = findFollowingLegs(allFlights, flight.arrivalAirport, arrivalAirport, numFlights - 1, flight.arrivalTime);
        if (following) {
          potentialResults.push([flight, ...following]);
        }
      } else if (numFlights === 1 && flight.arrivalAirport === arrivalAirport) {
        potentialResults.push([flight]);
      }
    }
  }

  if (potentialResults.length < 1) {
    return null;
  }

  potentialResults.sort((a, b) => compareDateTime(a[0].departureTime, b[0].departureTime));

  return potentialResults[0];
}

function compareDateTime(a: DateTime<boolean>, b: DateTime<boolean>): number {
  if (a > b) {
    return 1;
  } else if (a < b) {
    return -1;
  }

  return 0;
}