import { HTTPClient } from '../http';
import {
  isJsonObject,
  JsonType,
  ApiErrorBody, Airports, Connections, Aircraft
} from './api.model';
import { DateTime, Duration } from 'luxon';

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
  constructor(private readonly httpClient: HTTPClient) {}

  getLocations(): Promise<ApiResponse<Airports>> {
    return transform(this.httpClient.fetch('/data/airports.json'));
  }

  getAircraft(): Promise<ApiResponse<ReadonlyArray<Aircraft>>> {
    return transform(this.httpClient.fetch('/data/aircraft.json'));
  }

  getConnections(
    origins: ReadonlyArray<string>,
    destinations: ReadonlyArray<string>,
    minDeparture: DateTime<true>,
    maxDeparture: DateTime<true>,
    maxFlights: number,
    minLayover: Duration<true>,
    maxLayover: Duration<true>,
    maxDuration: Duration<true>,
    includeAircraft: ReadonlyArray<string> | null,
    excludeAircraft: ReadonlyArray<string> | null,
  ): Promise<ApiResponse<Connections>> {

    return transform(this.httpClient.fetch(
      '/api/connections/json',
      {
        method: 'POST',
        body: JSON.stringify({
          origins: origins,
          destinations: destinations,
          minDeparture: minDeparture.toISO(),
          maxDeparture: maxDeparture.toISO(),
          maxFlights: maxFlights,
          minLayoverMS: minLayover.toMillis(),
          maxLayoverMS: maxLayover.toMillis(),
          maxDurationMS: maxDuration.toMillis(),
          includeAircraft: includeAircraft ? includeAircraft : undefined,
          excludeAircraft: excludeAircraft ? excludeAircraft : undefined,
        }),
      },
    ));
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
