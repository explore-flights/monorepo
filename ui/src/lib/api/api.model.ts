export type JsonObject = { [k: string]: JsonType };
export type JsonArray = ReadonlyArray<JsonType>;
export type JsonType = JsonObject | JsonArray | string | number | boolean | null;

export function isJsonObject(v: JsonType): v is JsonObject {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

export interface ApiErrorBody {
  message: string;
}

export type Issuer = string;

export interface AuthInfo {}

export interface Airports {
  airports: ReadonlyArray<Airport>;
  metropolitanAreas: ReadonlyArray<MetropolitanArea>;
}

export interface MetropolitanArea {
  code: string;
  name: string;
  airports: ReadonlyArray<Airport>;
}

export interface Airport {
  code: string;
  name: string;
}

export interface ConnectionsSearchRequest {
  origins: ReadonlyArray<string>;
  destinations: ReadonlyArray<string>;
  minDeparture: string;
  maxDeparture: string;
  maxFlights: number;
  minLayoverMS: number;
  maxLayoverMS: number;
  maxDurationMS: number;
  includeAirport?: ReadonlyArray<string>;
  excludeAirport?: ReadonlyArray<string>;
  includeFlightNumber?: ReadonlyArray<string>;
  excludeFlightNumber?: ReadonlyArray<string>;
  includeAircraft?: ReadonlyArray<string>;
  excludeAircraft?: ReadonlyArray<string>;
}

export interface ConnectionsSearchResponse {
  data: Connections;
}

export interface ConnectionsSearchResponseWithSearch extends ConnectionsSearchResponse {
  search: ConnectionsSearchRequest;
}

export interface Connections {
  connections: ReadonlyArray<Connection>;
  flights: Record<string, Flight>;
}

export interface Connection {
  flightId: string;
  outgoing: ReadonlyArray<Connection>;
}

export interface Flight {
  flightNumber: FlightNumber;
  departureTime: string;
  departureAirport: string;
  arrivalTime: string;
  arrivalAirport: string;
  aircraftOwner: string;
  aircraftType: string;
  registration?: string;
  codeShares: ReadonlyArray<FlightNumber>;
}

export interface FlightNumber {
  airline: string;
  number: number;
  suffix?: string;
}

export interface Aircraft {
  code: string;
  equipCode: string;
  name: string;
}

export interface ConnectionSearchShare {
  htmlUrl: string;
  imageUrl: string;
}