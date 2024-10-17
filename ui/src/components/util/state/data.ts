import { useHttpClient } from '../context/http-client';
import { useQuery } from '@tanstack/react-query';
import { ApiError, expectSuccess } from '../../../lib/api/api';
import { DateTime } from 'luxon';

export function useAirports() {
  const { apiClient } = useHttpClient();
  return useQuery({
    queryKey: ['airports'],
    queryFn: async () => {
      const { body } = expectSuccess(await apiClient.getAirports());
      return body;
    },
    retry: 5,
    initialData: {
      airports: [],
      metropolitanAreas: [],
    },
  });
}

export function useAircraft() {
  const { apiClient } = useHttpClient();
  return useQuery({
    queryKey: ['aircraft'],
    queryFn: async () => {
      const { body } = expectSuccess(await apiClient.getAircraft());
      return body;
    },
    retry: 5,
    initialData: [],
  });
}

export function useFlightSchedule(flightNumber: string) {
  const { apiClient } = useHttpClient();
  return useQuery({
    queryKey: ['flight_schedule', flightNumber],
    queryFn: async () => {
      const { body } = expectSuccess(await apiClient.getFlightSchedule(flightNumber));
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

export function useSearch(query: string, enabled: boolean) {
  const { apiClient } = useHttpClient();
  return useQuery({
    queryKey: ['search', query, enabled],
    queryFn: async () => {
      if (!enabled) {
        return [];
      }

      const { body } = expectSuccess(await apiClient.search(query));
      return body;
    },
    retry: 3,
    staleTime: 1000 * 60 * 15,
  });
}