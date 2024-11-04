export type JsonObject = { [k: string]: JsonType };
export type JsonArray = ReadonlyArray<JsonType>;
export type JsonType = JsonObject | JsonArray | string | number | boolean | null;

export function isJsonObject(v: JsonType): v is JsonObject {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

export function isJsonArray(v: JsonType): v is JsonArray {
  return v !== null && typeof v === 'object' && Array.isArray(v);
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
  lat: number;
  lng: number;
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
  countMultiLeg: boolean;
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

export interface FlightScheduleVariantData {
  operatedAs: string;
  departureTime: string;
  departureAirport: string;
  departureUTCOffset: number;
  durationSeconds: number;
  arrivalAirport: string;
  arrivalUTCOffset: number;
  serviceType: string;
  aircraftOwner: string;
  aircraftType: string;
  aircraftConfigurationVersion: string;
  codeShares: ReadonlyArray<string>;
}

export interface FlightScheduleVariant {
  ranges: ReadonlyArray<[string, string]>;
  data: FlightScheduleVariantData;
}

export interface FlightSchedule {
  airline: string;
  flightNumber: number;
  suffix: string;
  variants: ReadonlyArray<FlightScheduleVariant>;
}

export interface SeatMap {
  cabinClasses: ReadonlyArray<CabinClass>;
  decks: ReadonlyArray<SeatMapDeck>;
}

export interface SeatMapDeck {
  wingPosition?: ReadonlyArray<[number, number]>;
  exitRowPosition?: ReadonlyArray<[number, number]>;
  cabins: ReadonlyArray<SeatMapCabin>;
}

export interface SeatMapCabin {
  cabinClass: CabinClass;
  seatColumns: ReadonlyArray<string>;
  componentColumns: ReadonlyArray<ColumnIdentifier>;
  aisle: ReadonlyArray<number>;
  rows: ReadonlyArray<SeatMapRow>;
}

export interface SeatMapRow {
  number: number;
  front: ReadonlyArray<ReadonlyArray<SeatMapColumnComponent | null>>;
  seats: ReadonlyArray<SeatMapColumnSeat | null>;
  rear: ReadonlyArray<ReadonlyArray<SeatMapColumnComponent | null>>;
}

interface SeatMapColumn {
  type: string;
  features: ReadonlyArray<string>;
}

export interface SeatMapColumnSeat extends SeatMapColumn {
  type: 'seat',
  features: ReadonlyArray<SeatFeature>;
}

export interface SeatMapColumnComponent extends SeatMapColumn {
  type: 'component',
  features: [ComponentFeature];
}

export interface ColumnIdentifier {
  position: ColumnPosition;
  repeat: number;
}

export enum CabinClass {
  ECO = 'ECO',
  PRECO = 'PRECO',
  BUSINESS = 'BIZ',
  FIRST = 'FIRST',
}

export enum ColumnPosition {
  LEFT = 'L',
  LEFT_CENTER = 'LC',
  CENTER = 'C',
  RIGHT_CENTER = 'RC',
  RIGHT = 'R',
}

export enum SeatFeature {
  RESTRICTED = '1',
  NOT_ALLOWED_FOR_INFANT = '1A',
  RESTRICTED_RECLINE = '1D',
  WINDOW_WITHOUT_WINDOW = '1W',
  NO_SEAT_AT_LOCATION = '8',
  CENTER = '9',
  AISLE = 'A',
  BASSINET_FACILITY = 'B',
  BUSINESS_CLASS_BED = 'BC',
  EXIT_ROW = 'E',
  ECONOMY_PLUS = 'EP',
  ECONOMY = 'ES',
  HANDICAPPED_FACILITY = 'H',
  SUITABLE_FOR_ADULT_WITH_INFANT = 'I',
  NOT_SUITABLE_FOR_CHILD = 'IE',
  JUMP = 'JP',
  BULKHEAD = 'K',
  LEG_SPACE = 'L',
  LEFT_SIDE = 'LS',
  PREFERENTIAL = 'O',
  OVERWING = 'OW',
  QUIET_ZONE = 'Q',
  RIGHT_SIDE = 'RS',
  UPPER_DECK = 'UP',
  WINDOW = 'W',
  WINDOW_AND_AISLE_TOGETHER = 'WA',
  BUFFER_ZONE = 'Z',
}

export enum ComponentFeature {
  AIRPHONE = 'AR',
  BAR = 'BA',
  BULKHEAD = 'BK',
  CLOSET = 'CL',
  EXIT_DOOR = 'D',
  EMERGENCY_EXIT = 'E',
  GALLEY = 'G',
  LAVATORY = 'LA',
  LUGGAGE_STORAGE = 'LG',
  MOVIE_SCREEN = 'MV',
  STORAGE_SPACE = 'SO',
  STAIRS = 'ST',
  TABLE = 'TA',
}

export type QueryScheduleResponse = Record<string, ReadonlyArray<RouteAndRange>>;

export interface RouteAndRange {
  departureAirport: string;
  arrivalAirport: string;
  range: [string, string];
}