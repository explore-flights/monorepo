import type {
  Aircraft,
  Airport,
  AirportSummary,
  AirportTimetable,
  ConnectionShare,
  ConnectionsResponse,
  ConnectionsSearchRequest,
  FlightSchedules,
  FlightScheduleVersions,
  NotificationsResponse,
  QuerySchedulesRequest,
  QuerySchedulesResponse,
  SearchResponse,
  SharedConnectionsResponse,
  UpdateReportItem,
} from './types';

class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

async function requestWithResponse<T>(
  path: string,
  init?: RequestInit,
): Promise<{ data: T; response: Response }> {
  const headers = new Headers(init?.headers);
  const body = init?.body;
  if (body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  if (init?.method && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(init.method)) {
    const token = readCookie('XSRF-TOKEN');
    if (token) {
      headers.set('X-XSRF-TOKEN', token);
    }
    if (typeof body === 'string') {
      const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(body));
      headers.set(
        'X-Amz-Content-Sha256',
        [...new Uint8Array(digest)].map((v) => v.toString(16).padStart(2, '0')).join(''),
      );
    }
  }
  const response = await fetch(path, { ...init, headers, credentials: 'same-origin' });
  if (!response.ok) {
    let message = `Request failed (${response.status})`;
    try {
      message = ((await response.json()) as { message?: string }).message ?? message;
    } catch {
      /* empty */
    }
    throw new ApiError(message, response.status);
  }
  return { data: (await response.json()) as T, response };
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  return (await requestWithResponse<T>(path, init)).data;
}

function readCookie(name: string) {
  return document.cookie
    .split('; ')
    .find((value) => value.startsWith(`${encodeURIComponent(name)}=`))
    ?.split('=')
    .slice(1)
    .join('=');
}

export const api = {
  airlines: () => request<ReadonlyArray<import('./types').Airline>>('/data/airlines.json?v=2'),
  airports: () => request<ReadonlyArray<Airport>>('/data/airports.json?v=2'),
  aircraft: () => request<ReadonlyArray<Aircraft>>('/data/aircraft.json?v=4'),
  search: (query: string) =>
    request<SearchResponse>(`/api/search?q=${encodeURIComponent(query)}`, {
      headers: { Accept: 'application/json' },
    }),
  flight: (flightNumber: string, year: number) =>
    request<FlightSchedules>(`/data/${year}/flight/${encodeURIComponent(flightNumber)}?v=9`),
  flightVersions: (flightNumber: string, airport: string, date: string) =>
    request<FlightScheduleVersions>(
      `/data/flight/${encodeURIComponent(flightNumber)}/versions/${encodeURIComponent(airport)}/${encodeURIComponent(date)}?v=4`,
    ),
  airportStatistics: (airport: string, year: number) =>
    request<AirportSummary>(`/data/airport/${encodeURIComponent(airport)}/${year}/summary?v=1`),
  airportDepartures: (airport: string, date: string) =>
    request<AirportTimetable>(
      `/data/airport/${encodeURIComponent(airport)}/${encodeURIComponent(date)}/departures?v=1`,
    ),
  airportArrivals: (airport: string, date: string) =>
    request<AirportTimetable>(
      `/data/airport/${encodeURIComponent(airport)}/${encodeURIComponent(date)}/arrivals?v=1`,
    ),
  connections: (body: ConnectionsSearchRequest) =>
    request<ConnectionsResponse>('/api/connections/json', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  sharedConnections: (id: string) =>
    request<SharedConnectionsResponse>(
      `/api/connections/json/${encodeURIComponent(id)}?includeSearch=true`,
    ),
  shareConnections: (body: ConnectionsSearchRequest) =>
    request<ConnectionShare>('/api/connections/share', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  special: (identifier: string, year: number) =>
    request<QuerySchedulesResponse>(`/data/${year}/schedule/${encodeURIComponent(identifier)}`),
  querySchedules: (query: QuerySchedulesRequest) => {
    const params = new URLSearchParams();
    query.airlineId?.forEach((value) => params.append('airlineId', value));
    query.aircraftId?.forEach((value) => params.append('aircraftId', value));
    query.aircraftConfigurationVersion?.forEach((value) =>
      params.append('aircraftConfigurationVersion', value),
    );
    query.aircraft?.forEach(([aircraft, configuration]) =>
      params.append('aircraft', `${aircraft}-${configuration}`),
    );
    query.departureAirportId?.forEach((value) => params.append('departureAirportId', value));
    query.arrivalAirportId?.forEach((value) => params.append('arrivalAirportId', value));
    query.route?.forEach(([from, to]) => params.append('route', `${from}-${to}`));
    if (query.minDepartureTime) {
      params.set('minDepartureTime', query.minDepartureTime);
    }
    if (query.maxDepartureTime) {
      params.set('maxDepartureTime', query.maxDepartureTime);
    }
    return request<QuerySchedulesResponse>(`/api/schedule/search?${params}`);
  },
  notifications: async (): Promise<NotificationsResponse> => {
    const { data, response } =
      await requestWithResponse<NotificationsResponse['notifications']>('/api/notifications');
    return {
      notifications: data,
      dataVersion: response.headers.get('Ef-Data-Version') ?? undefined,
    };
  },
  updates: () => request<ReadonlyArray<UpdateReportItem>>('/data/updates'),
};
