import React, { useCallback, useMemo, useState } from 'react';
import { useHttpClient } from '../../components/util/context/http-client';
import {
  ArrivalDeparture,
  Bound,
  FareFamily,
  MilesAndMoreClient,
  MMResponse,
  Mode,
  PassengerCode,
  ResponseDataDictionaries, ResponseDataEntry
} from '../../lib/milesandmore/client';
import {
  Alert,
  Button,
  ColumnLayout,
  Container,
  ContentLayout,
  DateRangePicker,
  Form,
  FormField,
  Grid,
  Header, Link, Table
} from '@cloudscape-design/components';
import { AirportMultiselect } from '../../components/select/airport-multiselect';
import { DateTime, Duration } from 'luxon';
import { catchNotify, useAppControls } from '../../components/util/context/app-controls';
import { useCollection } from '@cloudscape-design/collection-hooks';
import { useInterval } from '../../components/util/state/common';
import { useAirports } from '../../components/util/state/data';
import { FlightLink } from '../../components/common/flight-link';
import { withDepartureAirportFilter, withDepartureDateFilter } from '../flight';

export function MmQuickSearch() {
  const { httpClient } = useHttpClient();
  const { notification } = useAppControls();
  const mmClient = useMemo(() => new MilesAndMoreClient(httpClient), [httpClient]);

  const airportsQuery = useAirports();

  const [isLoading, setLoading] = useState(false);
  const [origins, setOrigins] = useState<ReadonlyArray<string>>([]);
  const [destinations, setDestinations] = useState<ReadonlyArray<string>>([]);
  const [minDeparture, setMinDeparture] = useState<DateTime<true>>(DateTime.now().startOf('day'));
  const [maxDeparture, setMaxDeparture] = useState<DateTime<true>>(DateTime.now().endOf('day'));

  const [items, setItems] = useState<ReadonlyArray<Entry>>([]);

  function onSearch() {
    setLoading(true);
    (async () => {
      const promises: Array<Promise<MMResponse>> = [];
      const start = minDeparture.startOf('month');
      const end = maxDeparture.startOf('month');

      for (const origin of origins) {
        for (const destination of destinations) {
          let curr = start;
          do {
            const promise = mmClient.getBestBy({
              mode: Mode.BEST_BY_DAY,
              fareFamily: FareFamily.BUSINESS,
              travelers: [PassengerCode.ADULT],
              departureDateTime: curr,
              origin: origin,
              destination: destination,
            });

            promises.push(promise);

            curr = curr.plus(Duration.fromMillis(1000 * 60 * 60 * 24 * 32)).startOf('month');
          } while (end.diff(curr).toMillis() > 0);
        }
      }

      for (const promise of promises) {
        let res: MMResponse;
        try {
          res = await promise;
        } catch (e) {
          catchNotify(notification)(e);
          continue;
        }

        for (let d of res.data) {
          const filteredBounds: Array<Bound> = [];
          for (const bound of d.bounds) {
            if (bound.flights.length >= 1) {
              const flight = res.dictionaries.flight[bound.flights[0].id];
              const departure = DateTime.fromISO(flight.departure.dateTime, { setZone: true });

              if (departure.isValid && departure >= minDeparture && departure <= maxDeparture) {
                filteredBounds.push(bound);
              }
            }
          }

          if (filteredBounds.length >= 1) {
            d = { ...d, bounds: filteredBounds };
            setItems((prev) => [...prev, { entry: d, dictionaries: res.dictionaries }]);
          }
        }
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
                { colspan: { default: 12, xs: 12, m: 6 } },
              ]}
            >
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

interface Entry {
  entry: ResponseDataEntry;
  dictionaries: ResponseDataDictionaries;
}

function AvailabilityTable({ items: rawItems, onClear }: { items: ReadonlyArray<Entry>, onClear: () => void }) {
  const { items, collectionProps } = useCollection(rawItems, { sorting: {} });

  const sortByDepartureDate = useCallback((a: Entry, b: Entry) => a.entry.departureDate.localeCompare(b.entry.departureDate), []);
  const sortByMilesPrice = useCallback((a: Entry, b: Entry) => a.entry.prices.milesConversion.convertedMiles.base - b.entry.prices.milesConversion.convertedMiles.base, []);

  return (
    <Table
      {...collectionProps}
      header={<Header counter={`(${items.length})`} actions={<Button onClick={onClear} iconName={'remove'}>Clear</Button>}>Results</Header>}
      variant={'container'}
      items={items}
      columnDefinitions={[
        {
          id: 'departure_date',
          header: 'Departure Date',
          cell: (v) => v.entry.departureDate,
          sortingComparator: sortByDepartureDate,
        },
        {
          id: 'route',
          header: 'Route',
          cell: (v) => {
            return v.entry.bounds
              .map((v) => `${v.originLocationCode} - ${v.destinationLocationCode}`)
              .join(' • ');
          },
        },
        {
          id: 'flight_numbers',
          header: 'Flight Numbers',
          cell: (v) => {
            const elements = v.entry.bounds
              .flatMap((v) => v.flights)
              .map((v) => v.id)
              .map((id) => v.dictionaries.flight[id])
              .map((v) => (<FlightNumber flightNumber={`${v.marketingAirlineCode}${v.marketingFlightNumber}`} departure={v.departure} />));

            return <ColumnLayout columns={elements.length} variant={'text-grid'}>{...elements}</ColumnLayout>
          },
        },
        {
          id: 'miles_price',
          header: 'Miles',
          cell: (v) => {
            return v.entry.prices.milesConversion.convertedMiles.base;
          },
          sortingComparator: sortByMilesPrice,
        },
        {
          id: 'cash',
          header: 'Cash',
          cell: (v) => {
            return v.entry.prices.totalPrices
              .map((v) => `${(v.totalTaxes / 100.0).toFixed(2)} ${v.currencyCode}`)
              .join(', ');
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