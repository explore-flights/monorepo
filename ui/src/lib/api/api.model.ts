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

export interface AuthInfo {
  sessionId: string;
  sessionCreationTime: string;
  issuer: Issuer;
  idAtIssuer: string;
}

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