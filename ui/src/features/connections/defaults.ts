import type { ConnectionsSearchRequest } from '@/api/types';

export const connectionSearchDefaults = {
  maxFlights: 2,
  minLayoverMS: 45 * 60_000,
  maxLayoverMS: 6 * 3_600_000,
  maxDurationMS: 36 * 3_600_000,
  countMultiLeg: false,
} as const satisfies Pick<
  ConnectionsSearchRequest,
  'maxFlights' | 'minLayoverMS' | 'maxLayoverMS' | 'maxDurationMS' | 'countMultiLeg'
>;
