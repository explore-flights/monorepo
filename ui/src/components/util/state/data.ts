import { useHttpClient } from '../context/http-client';
import { useQuery } from '@tanstack/react-query';
import { ApiError, expectSuccess } from '../../../lib/api/api';
import { DateTime } from 'luxon';
import {
  Aircraft,
  AircraftId,
  Airline,
  AirlineId,
  Airport,
  AirportId,
  QuerySchedulesRequest,
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

        if (airline.iataCode) {
          lookupByIata.set(airline.iataCode, airline);
        }

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

        if (airport.iataCode) {
          lookupByIata.set(airport.iataCode, airport);
        }

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

export function useSeatMap(flightNumber: string,
                           departureAirport: string,
                           arrivalAirport: string,
                           departureTime: DateTime<true>,
                           aircraftType: string,
                           aircraftConfigurationVersion: string) {

  const { apiClient } = useHttpClient();
  return useQuery({
    queryKey: ['seatmap', flightNumber, departureAirport, arrivalAirport, departureTime, aircraftType, aircraftConfigurationVersion],
    queryFn: async () => {
      const { body } = expectSuccess(await apiClient.getSeatMap(flightNumber, departureAirport, arrivalAirport, departureTime, aircraftType, aircraftConfigurationVersion));
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

export function useFlightSchedulesByConfiguration(airline: string, aircraftType: string, aircraftConfigurationVersion: string) {
  const { apiClient } = useHttpClient();
  return useQuery({
    queryKey: ['flight_schedules_by_configuration', airline, aircraftType, aircraftConfigurationVersion],
    queryFn: async () => {
      const { body } = expectSuccess(await apiClient.getFlightSchedulesByConfiguration(airline, aircraftType, aircraftConfigurationVersion));
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
        return {};
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