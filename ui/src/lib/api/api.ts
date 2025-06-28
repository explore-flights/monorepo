import { HTTPClient } from '../http';
import {
  isJsonObject,
  JsonType,
  ApiErrorBody,
  Aircraft,
  AuthInfo,
  ConnectionSearchShare,
  ConnectionsSearchRequest,
  ConnectionsSearchResponseWithSearch,
  ConnectionsSearchResponse,
  SeatMap,
  QuerySchedulesRequest,
  Notification,
  Airline,
  SearchResponse,
  Airport,
  FlightSchedules,
  FlightScheduleVersions,
  QuerySchedulesResponseV2,
  AircraftReport, FlightScheduleUpdates, DestinationReport, ConnectionGameChallenge
} from './api.model';
import { ConcurrencyLimit } from './concurrency-limit';
import { DateTime } from 'luxon';

const KindSuccess = 0;
const KindApiError = 1;
const KindError = 2;

interface SimpleHeaders {
  get(name: string): string | null;
  has(name: string): boolean;
}

interface BaseResponse<T> {
  kind: typeof KindSuccess | typeof KindApiError | typeof KindError;
  status: number;
  headers: SimpleHeaders;
  body?: T;
  error?: ApiErrorBody | Error;
}

export interface SuccessResponse<T> extends BaseResponse<T> {
  kind: typeof KindSuccess,
  body: T;
  error: undefined;
}

export interface ApiErrorResponse<T> extends BaseResponse<T> {
  kind: typeof KindApiError;
  body: undefined;
  error: ApiErrorBody;
}

export interface ErrorResponse<T> extends BaseResponse<T> {
  kind: typeof KindError;
  body: undefined;
  error: Error;
}

export type ApiResponse<T> = SuccessResponse<T> | ApiErrorResponse<T> | ErrorResponse<T>;

export class ApiClient {

  private readonly limiter = new ConcurrencyLimit(1);

  constructor(private readonly httpClient: HTTPClient) {}

  getAuthInfo(): Promise<ApiResponse<AuthInfo | null>> {
    return transform(
      this.httpClient.fetch('/auth/info', { method: 'HEAD' }),
      (status) => status >= 200 && status < 300 ? {} : null,
      204,
    );
  }

  getAirlines(): Promise<ApiResponse<ReadonlyArray<Airline>>> {
    return transform(this.httpClient.fetch('/data/airlines.json?v=1'));
  }

  getAirports(): Promise<ApiResponse<ReadonlyArray<Airport>>> {
    return transform(this.httpClient.fetch('/data/airports.json?v=1'));
  }

  getAircraft(): Promise<ApiResponse<ReadonlyArray<Aircraft>>> {
    return transform(this.httpClient.fetch('/data/aircraft.json?v=2'));
  }

  getFlightSchedule(flightNumber: string, version?: DateTime<true>): Promise<ApiResponse<FlightSchedules>> {
    let suffix = '';
    if (version) {
      suffix = `/${version.toUTC().toISO()}`;
    }

    return transform(this.httpClient.fetch(`/data/flight/${encodeURIComponent(flightNumber)}${suffix}?v=4`));
  }

  getFlightScheduleVersions(flightNumber: string, departureAirport: string, departureDateLocal: string): Promise<ApiResponse<FlightScheduleVersions>> {
    return transform(this.httpClient.fetch(`/data/flight/${encodeURIComponent(flightNumber)}/versions/${encodeURIComponent(departureAirport)}/${encodeURIComponent(departureDateLocal)}?v=2`));
  }

  getConnections(req: ConnectionsSearchRequest): Promise<ApiResponse<ConnectionsSearchResponse>> {
    return transform(this.httpClient.fetch(
      '/api/connections/json',
      {
        method: 'POST',
        body: JSON.stringify(req),
      },
    ));
  }

  getConnectionsFromShare(search: string): Promise<ApiResponse<ConnectionsSearchResponseWithSearch>> {
    return transform(this.httpClient.fetch(`/api/connections/json/${encodeURIComponent(search)}?includeSearch=true`));
  }

  getConnectionsSearchShare(req: ConnectionsSearchRequest): Promise<ApiResponse<ConnectionSearchShare>> {
    return transform(this.httpClient.fetch(
      '/api/connections/share',
      {
        method: 'POST',
        body: JSON.stringify(req),
      },
    ));
  }

  getSeatMap(flightNumber: string, departureAirport: string, departureTime: DateTime<true>): Promise<ApiResponse<SeatMap>> {
    const url = [
      '/data/flight',
      encodeURIComponent(flightNumber),
      'seatmap',
      encodeURIComponent(departureAirport),
      encodeURIComponent(departureTime.toISODate()),
    ].join('/');

    return transform(this.httpClient.fetch(url));
  }

  getAllegrisSchedules(): Promise<ApiResponse<QuerySchedulesResponseV2>> {
    return transform(this.httpClient.fetch('/data/schedule/allegris'));
  }

  queryFlightSchedules(req: QuerySchedulesRequest): Promise<ApiResponse<QuerySchedulesResponseV2>> {
    const params = new URLSearchParams();

    for (const airlineId of req.airlineId ?? []) {
      params.append('airlineId', airlineId);
    }

    for (const aircraftId of req.aircraftId ?? []) {
      params.append('aircraftId', aircraftId);
    }

    for (const aircraftConfigurationVersion of req.aircraftConfigurationVersion ?? []) {
      params.append('aircraftConfigurationVersion', aircraftConfigurationVersion);
    }

    for (const [aircraftId, aircraftConfigurationVersion] of req.aircraft ?? []) {
      params.append('aircraft', `${aircraftId}-${aircraftConfigurationVersion}`);
    }

    for (const departureAirportId of req.departureAirportId ?? []) {
      params.append('departureAirportId', departureAirportId);
    }

    for (const arrivalAirportId of req.arrivalAirportId ?? []) {
      params.append('arrivalAirportId', arrivalAirportId);
    }

    for (const [departureAirportId, arrivalAirportId] of req.route ?? []) {
      params.append('route', `${departureAirportId}-${arrivalAirportId}`);
    }

    if (req.minDepartureTime) {
      params.set('minDepartureTime', req.minDepartureTime.toISO());
    }

    if (req.maxDepartureTime) {
      params.set('maxDepartureTime', req.maxDepartureTime.toISO());
    }

    return transform(this.httpClient.fetch(`/api/schedule/search?${params.toString()}`));
  }

  getDestinations(airport: string, year?: number, summerSchedule?: boolean): Promise<ApiResponse<ReadonlyArray<DestinationReport>>> {
    const urlParts = [
      '/data/destinations',
      encodeURIComponent(airport),
    ];

    if (year) {
      urlParts.push(year.toString());

      if (summerSchedule !== undefined) {
        urlParts.push(summerSchedule ? 'summer' : 'winter');
      }
    }

    const url = urlParts.join('/');
    return transform(this.httpClient.fetch(`${url}?v=1`));
  }

  getAircraftReport(airport: string, year?: number, summerSchedule?: boolean): Promise<ApiResponse<ReadonlyArray<AircraftReport>>> {
    const urlParts = [
      '/data/aircraft',
      encodeURIComponent(airport),
    ];

    if (year) {
      urlParts.push(year.toString());

      if (summerSchedule !== undefined) {
        urlParts.push(summerSchedule ? 'summer' : 'winter');
      }
    }

    return transform(this.httpClient.fetch(urlParts.join('/')));
  }

  getVersions(): Promise<ApiResponse<ReadonlyArray<string>>> {
    return transform(this.httpClient.fetch('/data/versions.json'));
  }

  getUpdatesForVersion(version: string): Promise<ApiResponse<FlightScheduleUpdates>> {
    return transform(this.httpClient.fetch(`/data/version/${version}`));
  }

  search(query: string): Promise<ApiResponse<SearchResponse>> {
    const params = new URLSearchParams();
    params.set('q', query);

    return transform(this.httpClient.fetch(
      `/api/search?${params.toString()}`,
      {
        headers: {
          'Accept': 'application/json',
        },
      },
    ));
  }

  raw(url: string): Promise<ApiResponse<JsonType>> {
    if (!url.startsWith('/')) {
      throw new Error('invalid URL');
    }

    return transform(this.httpClient.fetch(url));
  }

  getNotifications(): Promise<ApiResponse<ReadonlyArray<Notification>>> {
    return transform(
      this.httpClient.fetch('/api/notifications'),
      (status, body) => {
        if (status === 502) {
          return [];
        }

        return JSON.parse(body) as ReadonlyArray<Notification>;
      },
      200,
      502,
    );
  }

  getConnectionGame(seed?: string, minFlights?: number, maxFlights?: number): Promise<ApiResponse<ConnectionGameChallenge>> {
    const query = new URLSearchParams();
    if (seed !== undefined) {
      query.set('seed', seed);
    }

    if (minFlights !== undefined) {
      query.set('minFlights', minFlights.toString());
    }

    if (maxFlights !== undefined) {
      query.set('maxFlights', maxFlights.toString());
    }

    let url = '/api/game/connection';
    if (query.size > 0) {
      url += `?${query.toString()}`;
    }

    return transform(this.httpClient.fetch(url));
  }

  logout(): Promise<ApiResponse<unknown>> {
    return transform(this.httpClient.fetch('/auth/logout', { method: 'POST' }));
  }
}

async function transform<T>(resPromise: Promise<Response>, parseFn: (status: number, body: string) => T = (_, body) => JSON.parse(body) as T, successCode = 200, ...successCodes: Array<number>): Promise<ApiResponse<T>> {
  let status = 999;
  let headers = EMPTY_HEADERS;
  let bodyRaw = '';
  let errorCause: unknown;
  try {
    const res = await resPromise;
    status = res.status;
    headers = new ResponseHeaders(res.headers);
    bodyRaw = await res.text();
    // res.headers

    if (status === successCode || successCodes.includes(status)) {
      return {
        kind: KindSuccess,
        status: status,
        headers: headers,
        body: parseFn(status, bodyRaw),
        error: undefined,
      };
    }

    const body = JSON.parse(bodyRaw) as JsonType;
    if (isJsonObject(body) && typeof body.message === 'string') {
      return {
        kind: KindApiError,
        status: status,
        headers: headers,
        body: undefined,
        error: {
          message: body.message,
        },
      };
    }
  } catch (e) {
    errorCause = e;
    if (e instanceof Error) {
      return {
        kind: KindError,
        status: status,
        headers: headers,
        body: undefined,
        error: e,
      };
    }
  }

  return {
    kind: KindError,
    status: status,
    headers: headers,
    body: undefined,
    error: new Error(`unknown error: ${bodyRaw}`, { cause: errorCause }),
  };
}

export class ApiError extends Error {
  constructor(public readonly response: ApiErrorResponse<unknown> | ErrorResponse<unknown>) {
    let message: string;
    let cause: unknown;
    if (response.kind === 1) {
      message = response.error.message;
    } else {
      message = 'unknown error';
      cause = response.error;
    }

    super(message, { cause: cause });
  }
}

export function expectSuccess<T>(resp: ApiResponse<T>): SuccessResponse<T> {
  if (resp.error !== undefined) {
    throw new ApiError(resp);
  }

  return resp;
}

const EMPTY_HEADERS = {
  get(_: string): string | null {
    return null;
  },
  has(_: string): boolean {
    return false;
  },
} satisfies SimpleHeaders;

class ResponseHeaders implements SimpleHeaders {
  constructor(private readonly headers: Headers) {
  }

  get(name: string): string | null {
    return this.headers.get(name);
  }

  has(name: string): boolean {
    return this.headers.has(name);
  }
}
