import { useHttpClient } from '../context/http-client';
import { useQuery } from '@tanstack/react-query';
import { ApiError, expectSuccess } from '../../../lib/api/api';
import { DateTime } from 'luxon';
import {
  Aircraft,
  AircraftId, AircraftReport,
  Airline,
  AirlineId,
  Airport,
  AirportId, DestinationReport, FlightScheduleUpdates,
  QuerySchedulesRequest, QuerySchedulesResponseV2,
  SearchResponse
} from '../../../lib/api/api.model';

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

export function useFlightSchedule(flightNumber: string, version?: DateTime<true>) {
  const { apiClient } = useHttpClient();
  return useQuery({
    queryKey: ['flight_schedule', flightNumber, version],
    queryFn: async () => {
      const { body } = expectSuccess(await apiClient.getFlightSchedule(flightNumber, version));
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

export function useAllegrisSchedules() {
  const { apiClient } = useHttpClient();
  return useQuery({
    queryKey: ['schedule', 'allegris'],
    queryFn: async () => {
      const { body } = expectSuccess(await apiClient.getAllegrisSchedules());
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

export function useDestinations(airport: string, year?: number, summerSchedule?: boolean) {
  const { apiClient } = useHttpClient();
  return useQuery({
    queryKey: ['destinations', airport, year, summerSchedule],
    queryFn: async () => {
      const { body } = expectSuccess(await apiClient.getDestinations(airport, year, summerSchedule));
      return body;
    },
    retry: 5,
    initialData: [] satisfies ReadonlyArray<DestinationReport>,
  });
}

export function useDestinationsNoInitial(airport?: string, year?: number, summerSchedule?: boolean) {
  const { apiClient } = useHttpClient();
  return useQuery({
    queryKey: ['destinations_no_initial', airport, year, summerSchedule],
    queryFn: async () => {
      if (!airport) {
        return [] satisfies ReadonlyArray<DestinationReport>;
      }

      const { body } = expectSuccess(await apiClient.getDestinations(airport, year, summerSchedule));
      return body;
    },
    retry: 5,
  });
}

export function useAircraftReport(airport: string, year?: number, summerSchedule?: boolean) {
  const { apiClient } = useHttpClient();
  return useQuery({
    queryKey: ['aircraft_report', airport, year, summerSchedule],
    queryFn: async () => {
      const { body } = expectSuccess(await apiClient.getAircraftReport(airport, year, summerSchedule));
      return body;
    },
    retry: 5,
    initialData: [] satisfies ReadonlyArray<AircraftReport>,
  });
}

export function useVersions() {
  const { apiClient } = useHttpClient();
  return useQuery({
    queryKey: ['versions'],
    queryFn: async () => {
      const { body } = expectSuccess(await apiClient.getVersions());
      return body;
    },
    retry: 5,
    staleTime: 1000 * 60 * 60,
  });
}

export function useUpdatesForVersion(version: string, active: boolean) {
  const { apiClient } = useHttpClient();
  return useQuery({
    queryKey: ['version', version, active],
    queryFn: async () => {
      if (!active) {
        return {
          updates: [],
          airlines: {},
          airports: {},
        } satisfies FlightScheduleUpdates;
      }

      const { body } = expectSuccess(await apiClient.getUpdatesForVersion(version));
      return body;
    },
    retry: 5,
    staleTime: Number.POSITIVE_INFINITY,
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
