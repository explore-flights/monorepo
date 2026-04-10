import {
  Aircraft,
  AircraftId,
  Airline, Airport,
  AirportId,
  FlightNumber,
  QuerySchedulesResponseV2
} from '../../lib/api/api.model';
import {
  Box,
  ExpandableSection, FormField,
  Header, LineChart,
  Pagination, PropertyFilter,
  PropertyFilterProps,
  Table, ToggleButton
} from '@cloudscape-design/components';
import React, { useCallback, useMemo, useState } from 'react';
import { useCollection } from '@cloudscape-design/collection-hooks';
import { DateTime, Duration, FixedOffsetZone } from 'luxon';
import { aircraftConfigurationVersionToName } from '../../lib/consts';
import { FlightNumberList, InternalFlightLink } from '../common/flight-link';
import { AircraftConfigurationVersionText, AircraftText, AirportInlineText } from '../common/text';
import { Feature, Point } from 'geojson';
import { Marker } from 'react-map-gl/maplibre';
import { bbox, featureCollection, point } from '@turf/turf';
import { FitBounds, MaplibreMap, SmartLine } from '../maplibre/maplibre-map';
import { useConsent } from '../util/state/use-consent';
import { ConsentLevel } from '../../lib/consent.model';
import { LineSeries, SeriesBuilder } from '../../lib/charts/builder';

export interface FlightItem {
  flightNumber: [Airline, FlightNumber];
  departureAirport: Airport;
  departureTime: DateTime<true>;
  arrivalAirport: Airport;
  arrivalTime: DateTime<true>;
  serviceType: string;
  aircraftOwner: string;
  aircraft: Aircraft;
  aircraftConfigurationVersion: string;
  codeShares: ReadonlyArray<[Airline, FlightNumber]>;
}

function querySchedulesResponseV2ToFlights(data: QuerySchedulesResponseV2): ReadonlyArray<FlightItem> {
  const result: Array<FlightItem> = [];

  for (const schedule of data.schedules) {
    const flightNumber: [Airline, FlightNumber] = [data.airlines[schedule.flightNumber.airlineId], schedule.flightNumber];

    for (const item of schedule.items) {
      if (!item.flightVariantId) {
        continue;
      }

      const variant = data.variants[item.flightVariantId];
      const departureZone = FixedOffsetZone.instance(variant.departureUtcOffsetSeconds / 60);
      const arrivalZone = FixedOffsetZone.instance(variant.arrivalUtcOffsetSeconds / 60);
      const duration = Duration.fromMillis(variant.durationSeconds * 1000);
      const departureTime = DateTime.fromISO(`${item.departureDateLocal}T${variant.departureTimeLocal}.000`).setZone(departureZone, { keepLocalTime: true });
      const arrivalTime = departureTime.plus(duration).setZone(arrivalZone, { keepLocalTime: false });

      if (!departureTime.isValid || !arrivalTime.isValid) {
        continue;
      }

      result.push({
        flightNumber: flightNumber,
        departureAirport: data.airports[item.departureAirportId],
        departureTime: departureTime,
        arrivalAirport: data.airports[variant.arrivalAirportId],
        arrivalTime: arrivalTime,
        serviceType: variant.serviceType,
        aircraftOwner: variant.aircraftOwner,
        aircraft: data.aircraft[variant.aircraftId],
        aircraftConfigurationVersion: variant.aircraftConfigurationVersion,
        codeShares: variant.codeShares.map((v) => [data.airlines[v.airlineId], v] satisfies [Airline, FlightNumber]),
      });
    }
  }

  return result;
}

export function QueryScheduleResult({ data, flightLinkQuery, loading, showMap, showStats }: { data: QuerySchedulesResponseV2 | undefined, flightLinkQuery: ((item: FlightItem) => URLSearchParams), loading: boolean, showMap: boolean, showStats: boolean }) {
  const flights = useMemo(() => {
    if (!data) {
      const result: ReadonlyArray<FlightItem> = [];
      return result;
    }

    return querySchedulesResponseV2ToFlights(data);
  }, [data]);

  const departureTimeComparator = useCallback((a: FlightItem, b: FlightItem) => {
    return a.departureTime.toMillis() - b.departureTime.toMillis();
  }, []);

  const { items, collectionProps, propertyFilterProps, paginationProps, filteredItemsCount, allPageItems } = useCollection(flights, {
    sorting: {
      defaultState: {
        isDescending: false,
        sortingColumn: {
          sortingComparator: departureTimeComparator,
        },
      },
    },
    propertyFiltering: {
      filteringProperties: [
        {
          key: 'departure_time_iso',
          operators: ['>=', '>', '<=', '<'],
          propertyLabel: 'Departure Time',
          groupValuesLabel: 'Departure Time values',
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
          propertyLabel: 'Aircraft Configuration',
          groupValuesLabel: 'Aircraft Configuration values',
        },
      ],
      filteringFunction: evaluateFilter,
      defaultQuery: {
        operation: 'and',
        tokens: [
          {
            propertyKey: 'departure_time_iso',
            value: DateTime.now().toISO(),
            operator: '>=',
          },
        ],
      },
    },
    pagination: { pageSize: 25 },
  });

  const filteringOptions = useMemo(() => {
    const filteringOptions: Array<PropertyFilterProps.FilteringOption> = [];
    const uniqueDepartureAirportIds = new Set<AirportId>();
    const uniqueArrivalAirportIds = new Set<AirportId>();
    const uniqueAircraftIds = new Set<AircraftId>();
    const uniqueAircraftConfigurations = new Set<string>();

    for (const flight of flights) {
      if (!uniqueDepartureAirportIds.has(flight.departureAirport.id)) {
        uniqueDepartureAirportIds.add(flight.departureAirport.id);

        let label: string;
        const tags = [flight.departureAirport.iataCode, flight.departureAirport.icaoCode].filter(Boolean).join('/');
        if (flight.departureAirport.name) {
          label = `${flight.departureAirport.name} (${tags})`;
        } else {
          label = tags;
        }

        filteringOptions.push({
          propertyKey: 'departure_airport_id',
          label: label,
          value: flight.departureAirport.id,
        });
      }

      if (!uniqueArrivalAirportIds.has(flight.arrivalAirport.id)) {
        uniqueArrivalAirportIds.add(flight.arrivalAirport.id);

        let label: string;
        const tags = [flight.arrivalAirport.iataCode, flight.arrivalAirport.icaoCode].filter(Boolean).join('/');
        if (flight.arrivalAirport.name) {
          label = `${flight.arrivalAirport.name} (${tags})`;
        } else {
          label = tags;
        }

        filteringOptions.push({
          propertyKey: 'arrival_airport_id',
          label: label,
          value: flight.arrivalAirport.id,
        });
      }

      if (!uniqueAircraftIds.has(flight.aircraft.id)) {
        uniqueAircraftIds.add(flight.aircraft.id);
        filteringOptions.push({
          propertyKey: 'aircraft_id',
          label: flight.aircraft.name ?? flight.aircraft.icaoCode ?? flight.aircraft.iataCode ?? flight.aircraft.id,
          value: flight.aircraft.id,
        });
      }

      if (!uniqueAircraftConfigurations.has(flight.aircraftConfigurationVersion)) {
        uniqueAircraftConfigurations.add(flight.aircraftConfigurationVersion);
        filteringOptions.push({
          propertyKey: 'aircraft_configuration_version',
          label: aircraftConfigurationVersionToName(flight.aircraftConfigurationVersion),
          value: flight.aircraftConfigurationVersion,
        });
      }
    }

    return filteringOptions;
  }, [flights]);

  return (
    <>
      {showMap ? <AircraftMap flights={allPageItems} loading={loading} /> : null}
      {showStats ? <AircraftStats flights={allPageItems} /> : null}
      <Table
        {...collectionProps}
        loading={loading}
        variant={'stacked'}
        items={items}
        header={<Header counter={filteredItemsCount && filteredItemsCount < flights.length ? `${filteredItemsCount}/${flights.length}` : `(${flights.length})`}>Flights</Header>}
        pagination={<Pagination {...paginationProps}  />}
        filter={<PropertyFilter {...propertyFilterProps} filteringOptions={filteringOptions} />}
        columnDefinitions={[
          {
            id: 'flight_number',
            header: 'Flight Number',
            cell: useCallback((v: FlightItem) => <InternalFlightLink flightNumber={v.flightNumber[1]} airline={v.flightNumber[0]} query={flightLinkQuery(v)} rel={'alternate nofollow'} />, []),
            sortingComparator: useCallback((a: FlightItem, b: FlightItem) => compareFlightNumbers(a.flightNumber, b.flightNumber), []),
          },
          {
            id: 'departure_time',
            header: 'Departure Time',
            cell: useCallback((v: FlightItem) => <TimeCell value={v.departureTime} />, []),
            sortingComparator: departureTimeComparator,
          },
          {
            id: 'departure_airport',
            header: 'Departure Airport',
            cell: useCallback((v: FlightItem) => <AirportInlineText airport={v.departureAirport} />, []),
            sortingComparator: useCallback((a: FlightItem, b: FlightItem) => compareAirports(a.departureAirport, b.departureAirport), []),
          },
          {
            id: 'arrival_airport',
            header: 'Arrival Airport',
            cell: useCallback((v: FlightItem) => <AirportInlineText airport={v.arrivalAirport} />, []),
            sortingComparator: useCallback((a: FlightItem, b: FlightItem) => compareAirports(a.arrivalAirport, b.arrivalAirport), []),
          },
          {
            id: 'arrival_time',
            header: 'Arrival Time',
            cell: useCallback((v: FlightItem) => <TimeCell value={v.arrivalTime} />, []),
            sortingComparator: useCallback((a: FlightItem, b: FlightItem) => a.arrivalTime.toMillis() - b.arrivalTime.toMillis(), []),
          },
          {
            id: 'aircraft_type',
            header: 'Aircraft',
            cell: useCallback((v: FlightItem) => <AircraftText code={v.aircraft.name ?? v.aircraft.icaoCode ?? v.aircraft.iataCode ?? v.aircraft.id} aircraft={v.aircraft} />, []),
            sortingComparator: useCallback((a: FlightItem, b: FlightItem) => compareAircraft(a.aircraft, b.aircraft), []),
          },
          {
            id: 'aircraft_configuration_version',
            header: 'Aircraft Configuration',
            cell: useCallback((v: FlightItem) => {
              return (
                <AircraftConfigurationVersionText
                  value={v.aircraftConfigurationVersion}
                  popoverContent={v.aircraftConfigurationVersion}
                />
              );
            }, []),
            sortingField: 'aircraftConfigurationVersion',
          },
          {
            id: 'duration',
            header: 'Duration',
            cell: useCallback((v: FlightItem) => v.arrivalTime.diff(v.departureTime).rescale().toHuman({ unitDisplay: 'short' }), []),
            sortingComparator: useCallback((a: FlightItem, b: FlightItem) => {
              const aDuration = a.arrivalTime.diff(a.departureTime);
              const bDuration = b.arrivalTime.diff(b.departureTime);
              return aDuration.toMillis() - bDuration.toMillis();
            }, []),
          },
          {
            id: 'code_shares',
            header: 'Codeshares',
            cell: useCallback((v: FlightItem) => <FlightNumberList flightNumbers={v.codeShares.toSorted(compareFlightNumbers)} query={flightLinkQuery(v)} rel={'alternate nofollow'} />, []),
          },
        ]}
      />
    </>
  );
}

function AircraftMap({ flights, loading }: { flights: ReadonlyArray<FlightItem>, loading: boolean }) {
  const [markers, lines, bounds] = useMemo(() => {
    const markers: Array<React.ReactNode> = [];
    const lines: Array<React.ReactNode> = [];
    const points: Array<Feature<Point, never>> = [];
    const addedAirports = new Set<AirportId>();
    const addedRoutes = new Set<string>();

    for (const flight of flights) {
      if (!flight.departureAirport.location || !flight.arrivalAirport.location) {
        continue;
      }

      const departureAirport = { ...flight.departureAirport, location: flight.departureAirport.location };
      const arrivalAirport = { ...flight.arrivalAirport, location: flight.arrivalAirport.location };

      for (const airport of [departureAirport, arrivalAirport]) {
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
    <ExpandableSection
      variant={'stacked'}
      headerText={'Map'}
      headerInfo={<Box variant={'small'}>Table filters applied</Box>}
      defaultExpanded={useConsent()[0].has(ConsentLevel.VERSATILES)}
      disableContentPaddings={true}
    >
      <MaplibreMap height={'50vh'} loading={loading}>
        {...markers}
        {...lines}
        {bounds && <FitBounds bounds={bounds} options={{ padding: 100 }} />}
      </MaplibreMap>
    </ExpandableSection>
  );
}

function AircraftStats({ flights }: { flights: ReadonlyArray<FlightItem> }) {
  const now = useMemo(() => DateTime.now(), []);
  const [aircraftOnly, setAircraftOnly] = useState(false);
  const [series, xDomain, yDomain] = useMemo(() => {
    const builder = new SeriesBuilder<string, LineSeries<Date>, [Aircraft, string]>(
      'line',
      undefined,
      ([ac, acc]) => ac.id + acc,
    );

    for (const flight of flights) {
      builder.add(
        [flight.aircraft, aircraftOnly ? '' : flight.aircraftConfigurationVersion],
        flight.departureTime.toUTC().startOf('week').toJSDate(),
        1,
      );
    }

    let formatFn: (aircraft: Aircraft, configuration: string) => string;
    if (aircraftOnly) {
      formatFn = (aircraft, _) => aircraft.name ?? aircraft.icaoCode ?? aircraft.iataCode ?? aircraft.id;
    } else {
      formatFn = (aircraft, configuration) => `${aircraft.name ?? aircraft.icaoCode ?? aircraft.iataCode ?? aircraft.id} (${aircraftConfigurationVersionToName(configuration) ?? configuration})`;
    }

    const [series, xDomain, yDomain] = builder.series(([aircraft, configuration]) => ({
      title: formatFn(aircraft, configuration),
    }), true, true);

    return [
      series,
      xDomain,
      yDomain,
    ] as const;
  }, [now, aircraftOnly, flights]);

  return (
    <ExpandableSection
      variant={'stacked'}
      headerText={'Stats'}
      headerInfo={<Box variant={'small'}>Table filters applied</Box>}
      defaultExpanded={false}
    >
      <LineChart
        series={series}
        xDomain={xDomain}
        yDomain={yDomain ? [0, yDomain[1]] : undefined}
        xScaleType={'time'}
        xTitle={'Week (UTC)'}
        yTitle={'Flights'}
        xTickFormatter={(e) => DateTime.fromJSDate(e).toFormat('W/yyyy')}
        additionalFilters={
          <FormField label={'Grouping'}>
            <ToggleButton
              pressed={aircraftOnly}
              onChange={(e) => setAircraftOnly(e.detail.pressed)}
              iconName={'shrink'}
              pressedIconName={'expand'}
            >{aircraftOnly ? 'Aircraft with Configuration' : 'Aircraft only'}</ToggleButton>
          </FormField>
        }
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

function compareAirports(a: Airport, b: Airport) {
  if (a.iataCode && b.iataCode) {
    return a.iataCode.localeCompare(b.iataCode);
  } else if (b.icaoCode && b.icaoCode) {
    return b.icaoCode.localeCompare(b.icaoCode);
  }

  return a.id.localeCompare(b.id);
}

function compareAircraft(a: Aircraft, b: Aircraft) {
  if (a.iataCode && b.iataCode) {
    return a.iataCode.localeCompare(a.iataCode);
  } else if (a.icaoCode && b.icaoCode) {
    return a.icaoCode.localeCompare(a.icaoCode);
  }

  return a.id.localeCompare(b.id);
}

function evaluateFilter(flight: FlightItem, query: PropertyFilterProps.Query) {
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

function evaluateToken(flight: FlightItem, token: PropertyFilterProps.Token) {
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

function evaluateTokenSingle(flight: FlightItem, propertyKey: string, operator: string, filterValue: string) {
  let cmpResult = 0;

  switch (propertyKey) {
    case 'departure_time_iso':
      cmpResult = flight.departureTime.toMillis() - DateTime.fromISO(filterValue, { setZone: true }).toMillis();
      break;

    case 'departure_airport_id':
      cmpResult = flight.departureAirport.id.localeCompare(filterValue);
      break;

    case 'arrival_airport_id':
      cmpResult = flight.arrivalAirport.id.localeCompare(filterValue);
      break;

    case 'aircraft_id':
      cmpResult = flight.aircraft.id.localeCompare(filterValue);
      break;

    case 'aircraft_configuration_version':
      cmpResult = flight.aircraftConfigurationVersion.localeCompare(filterValue);
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