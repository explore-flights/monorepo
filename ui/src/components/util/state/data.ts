import { useHttpClient } from '../context/http-client';
import { useQuery } from '@tanstack/react-query';
import { expectSuccess } from '../../../lib/api/api';
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

export function useFlight(flightNumber: string, airport: string, date: DateTime<true>) {
  const { apiClient } = useHttpClient();
  return useQuery({
    queryKey: ['flight', flightNumber, airport, date.toUTC().toISODate()],
    queryFn: async () => {
      const { body } = expectSuccess(await apiClient.getFlight(flightNumber, airport, date));
      return body;
    },
    retry: 3,
  });
}