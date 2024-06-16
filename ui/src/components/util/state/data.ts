import { useHttpClient } from '../context/http-client';
import { useQuery } from '@tanstack/react-query';
import { expectSuccess } from '../../../lib/api/api';

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