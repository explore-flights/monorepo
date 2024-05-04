import { HTTPClient } from '../http';
import {
  isJsonObject,
  JsonType,
  ApiErrorBody, Connections
} from './api.model';

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

  getConnections(origin: string, destination: string, minDeparture: Date, maxDeparture: Date, maxFlights: number, minLayover: number, maxLayover: number, maxDuration: number): Promise<ApiResponse<Connections>> {
    const params = new URLSearchParams();
    params.set('origin', origin);
    params.set('destination', destination);
    params.set('minDeparture', minDeparture.toISOString());
    params.set('maxDeparture', maxDeparture.toISOString());
    params.set('maxFlights', maxFlights.toString());
    params.set('minLayover', `${minLayover}s`);
    params.set('maxLayover', `${maxLayover}s`);
    params.set('maxDuration', `${maxDuration}s`);

    return transform(this.httpClient.fetch(`/api/connections/reactflow?${params.toString()}`));
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
