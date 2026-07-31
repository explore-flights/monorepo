import { useHttpClient } from '../context/http-client';
import { useQueries, useQuery, UseQueryResult } from '@tanstack/react-query';
import { ApiError, expectSuccess } from '../../../lib/api/api';
import { DateTime } from 'luxon';
import {
  Aircraft,
  AircraftId,
  Airline,
  AirlineId,
  Airport,
  AirportId,
  FlightNumber,
  FlightSchedules,
  FlightScheduleItem,
  QuerySchedulesRequest,
  QuerySchedulesResponseV2,
  SearchResponse,
} from '../../../lib/api/api.model';

export interface LoadedYears {
  readonly loadedYears: ReadonlyArray<number>;
}

export type YearRange = [number, number];
export type FlightSchedulesForYears = FlightSchedules & LoadedYears;
export type QuerySchedulesResponseForYears = QuerySchedulesResponseV2 & LoadedYears;

export interface ScheduleQueryResult<T> {
  readonly data: T | undefined;
  readonly error: Error | null;
  readonly status: 'pending' | 'error' | 'success';
  readonly isPending: boolean;
}

export function defaultScheduleYearRange(): YearRange {
  const currentYear = DateTime.now().year;
  return [currentYear, currentYear + 1];
}

export interface Airlines {
  readonly airlines: ReadonlyArray<Airline>;
  readonly lookupById: ReadonlyMap<AirlineId, Airline>;
  readonly lookupByIata: ReadonlyMap<string, Airline>;
  readonly lookupByIcao: ReadonlyMap<string, Airline>;
}

export function useAirlines() {
  const { apiClient } = useHttpClient();
  return useQuery({
    queryKey: ['airlines'],
    queryFn: async () => {
      const { body: airlines } = expectSuccess(await apiClient.getAirlines());
      const lookupById = new Map<AirlineId, Airline>();
      const lookupByIata = new Map<string, Airline>();
      const lookupByIcao = new Map<string, Airline>();

      for (const airline of airlines) {
        lookupById.set(airline.id, airline);
        lookupByIata.set(airline.iataCode, airline);

        if (airline.icaoCode) {
          lookupByIcao.set(airline.icaoCode, airline);
        }
      }

      return {
        airlines: airlines,
        lookupById: lookupById,
        lookupByIata: lookupByIata,
        lookupByIcao: lookupByIcao,
      } satisfies Airlines;
    },
    retry: 5,
    initialData: {
      airlines: [],
      lookupById: new Map(),
      lookupByIata: new Map(),
      lookupByIcao: new Map(),
    } satisfies Airlines,
  });
}

export interface Airports {
  readonly airports: ReadonlyArray<Airport>;
  readonly lookupById: ReadonlyMap<AirportId, Airport>;
  readonly lookupByIata: ReadonlyMap<string, Airport>;
  readonly lookupByIcao: ReadonlyMap<string, Airport>;
}

export function useAirports() {
  const { apiClient } = useHttpClient();
  return useQuery({
    queryKey: ['airports'],
    queryFn: async () => {
      const { body: airports } = expectSuccess(await apiClient.getAirports());
      const lookupById = new Map<AirportId, Airport>();
      const lookupByIata = new Map<string, Airport>();
      const lookupByIcao = new Map<string, Airport>();

      for (const airport of airports) {
        lookupById.set(airport.id, airport);
        lookupByIata.set(airport.iataCode, airport);

        if (airport.icaoCode) {
          lookupByIcao.set(airport.icaoCode, airport);
        }
      }

      return {
        airports: airports,
        lookupById: lookupById,
        lookupByIata: lookupByIata,
        lookupByIcao: lookupByIcao,
      } satisfies Airports;
    },
    retry: 5,
    initialData: {
      airports: [],
      lookupById: new Map(),
      lookupByIata: new Map(),
      lookupByIcao: new Map(),
    } satisfies Airports,
  });
}

export interface Aircrafts {
  readonly aircraft: ReadonlyArray<Aircraft>;
  readonly lookupById: ReadonlyMap<AircraftId, Aircraft>;
  readonly lookupByIata: ReadonlyMap<string, Aircraft>;
  readonly lookupByIcao: ReadonlyMap<string, Aircraft>;
}

export function useAircrafts() {
  const { apiClient } = useHttpClient();
  return useQuery({
    queryKey: ['aircraft'],
    queryFn: async () => {
      const { body: aircraft } = expectSuccess(await apiClient.getAircraft());
      const lookupById = new Map<AircraftId, Aircraft>();
      const lookupByIata = new Map<string, Aircraft>();
      const lookupByIcao = new Map<string, Aircraft>();

      for (const ac of aircraft) {
        lookupById.set(ac.id, ac);

        if (ac.iataCode) {
          lookupByIata.set(ac.iataCode, ac);
        }

        if (ac.icaoCode) {
          lookupByIcao.set(ac.icaoCode, ac);
        }
      }

      return {
        aircraft: aircraft,
        lookupById: lookupById,
        lookupByIata: lookupByIata,
        lookupByIcao: lookupByIcao,
      } satisfies Aircrafts;
    },
    retry: 5,
    initialData: {
      aircraft: [],
      lookupById: new Map(),
      lookupByIata: new Map(),
      lookupByIcao: new Map(),
    } satisfies Aircrafts,
  });
}

export function useFlightSchedule(flightNumber: string, yearRange: YearRange, version?: DateTime<true>) {
  const { apiClient } = useHttpClient();
  const years = yearsInRange(yearRange);
  return useQueries({
    queries: years.map((year) => ({
      queryKey: ['flight_schedule', flightNumber, year, version],
      queryFn: async () => {
        const { body } = expectSuccess(await apiClient.getFlightSchedule(flightNumber, year, version));
        return body;
      },
      retry: shouldRetryScheduleQuery,
      staleTime: 1000 * 60 * 15,
    })),
    combine: (results) => combineScheduleQueries(years, results, mergeFlightSchedules),
  });
}

function shouldRetryScheduleQuery(count: number, e: Error): boolean {
  if (count > 3) {
    return false;
  } else if (e instanceof ApiError && (e.response.status === 400 || e.response.status === 404)) {
    return false;
  }

  return true;
}

export function useFlightScheduleVersions(flightNumber: string, departureAirport: string, departureDateLocal: string) {
  const { apiClient } = useHttpClient();
  return useQuery({
    queryKey: ['flight_schedule_versions', flightNumber, departureAirport, departureDateLocal],
    queryFn: async () => {
      const { body } = expectSuccess(await apiClient.getFlightScheduleVersions(flightNumber, departureAirport, departureDateLocal));
      return body;
    },
    retry: (count, e) => {
      if (count > 3) {
        return false;
      } else if (e instanceof ApiError && (e.response.status === 400 || e.response.status === 404)) {
        return false;
      }

      return true;
    },
    staleTime: 1000 * 60 * 15,
  });
}

export function useSeatMap(flightNumber: string, departureAirport: string, departureTime: DateTime<true>) {
  const { apiClient } = useHttpClient();
  return useQuery({
    queryKey: ['seatmap', flightNumber, departureAirport, departureTime],
    queryFn: async () => {
      const { body } = expectSuccess(await apiClient.getSeatMap(flightNumber, departureAirport, departureTime));
      return body;
    },
    retry: (count, e) => {
      if (count > 3) {
        return false;
      } else if (e instanceof ApiError && (e.response.status === 400 || e.response.status === 404)) {
        return false;
      }

      return true;
    },
  });
}

export function useSpecialAircraftSchedules(identifier: string, yearRange: YearRange) {
  const { apiClient } = useHttpClient();
  const years = yearsInRange(yearRange);
  return useQueries({
    queries: years.map((year) => ({
      queryKey: ['special_schedule', identifier, year],
      queryFn: async () => {
        const { body } = expectSuccess(await apiClient.getSpecialAircraftSchedules(identifier, year));
        return body;
      },
      retry: shouldRetryScheduleQuery,
    })),
    combine: (results) => combineScheduleQueries(years, results, mergeQuerySchedules),
  });
}

function combineScheduleQueries<TSchedule, TMerged>(
  years: ReadonlyArray<number>,
  results: ReadonlyArray<UseQueryResult<TSchedule>>,
  merge: (years: ReadonlyArray<number>, schedules: ReadonlyArray<TSchedule>) => TMerged,
): ScheduleQueryResult<TMerged> {

  const error = results.find((result) => result.error)?.error ?? null;
  const status = error
    ? 'error'
    : results.some((result) => result.isPending)
      ? 'pending'
      : 'success';
  const schedules = results.every((result) => result.data !== undefined)
    ? results.map((result) => result.data as TSchedule)
    : undefined;

  return {
    data: schedules ? merge(years, schedules) : undefined,
    error: error,
    status: status,
    isPending: status === 'pending',
  };
}

function yearsInRange([startYear, endYear]: YearRange): ReadonlyArray<number> {
  if (!Number.isInteger(startYear) || !Number.isInteger(endYear) || startYear > endYear) {
    throw new Error(`invalid year range: ${startYear} - ${endYear}`);
  }

  return Array.from({ length: endYear - startYear + 1 }, (_, index) => startYear + index);
}

function mergeFlightSchedules(years: ReadonlyArray<number>, schedules: ReadonlyArray<FlightSchedules>): FlightSchedulesForYears {
  const first = schedules[0];
  if (!first) {
    throw new Error('at least one flight schedule is required');
  }

  const relatedFlightNumbers = new Map<string, FlightNumber>();
  const items: Array<FlightScheduleItem> = [];
  const variants = {} as FlightSchedules['variants'];
  const airlines = {} as FlightSchedules['airlines'];
  const airports = {} as FlightSchedules['airports'];
  const aircraft = {} as FlightSchedules['aircraft'];

  for (const schedule of schedules) {
    for (const flightNumber of schedule.relatedFlightNumbers) {
      relatedFlightNumbers.set(flightNumberKey(flightNumber), flightNumber);
    }
    items.push(...schedule.items);
    Object.assign(variants, schedule.variants);
    Object.assign(airlines, schedule.airlines);
    Object.assign(airports, schedule.airports);
    Object.assign(aircraft, schedule.aircraft);
  }

  items.sort((a, b) => a.departureDateLocal.localeCompare(b.departureDateLocal));

  return {
    ...first,
    relatedFlightNumbers: Array.from(relatedFlightNumbers.values()),
    items: items,
    variants: variants,
    airlines: airlines,
    airports: airports,
    aircraft: aircraft,
    loadedYears: years,
  };
}

function mergeQuerySchedules(years: ReadonlyArray<number>, responses: ReadonlyArray<QuerySchedulesResponseV2>): QuerySchedulesResponseForYears {
  const schedulesByFlightNumber = new Map<string, { flightNumber: FlightNumber, items: Array<FlightScheduleItem> }>();
  const variants = {} as QuerySchedulesResponseV2['variants'];
  const airlines = {} as QuerySchedulesResponseV2['airlines'];
  const airports = {} as QuerySchedulesResponseV2['airports'];
  const aircraft = {} as QuerySchedulesResponseV2['aircraft'];

  for (const response of responses) {
    for (const schedule of response.schedules) {
      const key = flightNumberKey(schedule.flightNumber);
      let merged = schedulesByFlightNumber.get(key);
      if (!merged) {
        merged = { flightNumber: schedule.flightNumber, items: [] };
        schedulesByFlightNumber.set(key, merged);
      }
      merged.items.push(...schedule.items);
    }
    Object.assign(variants, response.variants);
    Object.assign(airlines, response.airlines);
    Object.assign(airports, response.airports);
    Object.assign(aircraft, response.aircraft);
  }

  for (const schedule of schedulesByFlightNumber.values()) {
    schedule.items.sort((a, b) => a.departureDateLocal.localeCompare(b.departureDateLocal));
  }

  return {
    schedules: Array.from(schedulesByFlightNumber.values()),
    variants: variants,
    airlines: airlines,
    airports: airports,
    aircraft: aircraft,
    loadedYears: years,
  };
}

function flightNumberKey(flightNumber: FlightNumber): string {
  return `${flightNumber.airlineId}:${flightNumber.number}:${flightNumber.suffix ?? ''}`;
}

export function useQueryFlightSchedules(req: QuerySchedulesRequest) {
  const { apiClient } = useHttpClient();
  return useQuery({
    queryKey: ['query_flight_schedules', req],
    queryFn: async () => {
      if (Object.entries(req).length < 1) {
        return {
          schedules: [],
          variants: {},
          airlines: {},
          airports: {},
          aircraft: {},
        } satisfies QuerySchedulesResponseV2;
      }

      const { body } = expectSuccess(await apiClient.queryFlightSchedules(req));
      return body;
    },
    retry: (count, e) => {
      if (count > 3) {
        return false;
      } else if (e instanceof ApiError && (e.response.status === 400 || e.response.status === 404)) {
        return false;
      }

      return true;
    },
  });
}

export function useSearch(query: string, enabled: boolean) {
  const { apiClient } = useHttpClient();
  return useQuery({
    queryKey: ['search', query, enabled],
    queryFn: async () => {
      if (!enabled) {
        return {
          airlines: [],
          flightNumbers: [],
        } satisfies SearchResponse;
      }

      const { body } = expectSuccess(await apiClient.search(query));
      return body;
    },
    retry: 3,
    staleTime: 1000 * 60 * 15,
  });
}

export function useDestinations(airportId?: AirportId) {
  const { apiClient } = useHttpClient();
  return useQuery({
    queryKey: ['destinations', airportId],
    queryFn: async () => {
      if (!airportId) {
        return [] satisfies ReadonlyArray<Airport>;
      }

      const { body } = expectSuccess(await apiClient.getDestinations(airportId));
      return body;
    },
    retry: 5,
    initialData: [] satisfies ReadonlyArray<Airport>,
  });
}

export function useDestinationsNoInitial(airportId?: AirportId) {
  const { apiClient } = useHttpClient();
  return useQuery({
    queryKey: ['destinations_no_initial', airportId],
    queryFn: async () => {
      if (!airportId) {
        return [] satisfies ReadonlyArray<Airport>;
      }

      const { body } = expectSuccess(await apiClient.getDestinations(airportId));
      return body;
    },
    retry: 5,
  });
}

export function useGlobalUpdates() {
  const { apiClient } = useHttpClient();
  return useQuery({
    queryKey: ['global_updates'],
    queryFn: async () => {
      const { body } = expectSuccess(await apiClient.getGlobalUpdates());
      return body;
    },
    retry: 5,
  });
}

export function useConnectionGameChallenge(seed?: string, minFlights?: number, maxFlights?: number) {
  const { apiClient } = useHttpClient();
  return useQuery({
    queryKey: ['game', 'connection', seed, minFlights, maxFlights],
    queryFn: async () => {
      const { body } = expectSuccess(await apiClient.getConnectionGame(seed, minFlights, maxFlights));
      return body;
    },
    retry: 5,
    staleTime: Number.POSITIVE_INFINITY,
  });
}
