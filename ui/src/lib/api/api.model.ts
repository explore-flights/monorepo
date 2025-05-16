import { DateTime } from 'luxon';
import { Branded } from '../util';

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

export type AirportId = Branded<string, 'AirportId'>;
export interface Airport {
  id: AirportId;
  iataAreaCode?: string;
  countryCode?: string;
  cityCode?: string;
  type?: string;
  location?: {
    lng: number;
    lat: number;
  }
  timezone?: string;
  name?: string;
  iataCode?: string;
  icaoCode?: string;
}

export type AirlineId = Branded<string, 'AirlineId'>;
export interface Airline {
  id: AirlineId;
  name: string;
  iataCode?: string;
  icaoCode?: string;
}

export type AircraftId = Branded<string, 'AircraftId'>;
export interface Aircraft {
  id: AircraftId;
  equipCode?: string;
  name?: string;
  iataCode?: string;
  icaoCode?: string;
  configurations: Record<AirlineId, ReadonlyArray<string>>;
}

export interface FlightNumber {
  airlineId: AirlineId;
  number: number;
  suffix?: string;
}

export interface SearchResponse {
  airlines: ReadonlyArray<Airline>;
  flightNumbers: ReadonlyArray<FlightNumber>;
}

export interface ConnectionsSearchRequest {
  origins: ReadonlyArray<AirportId>;
  destinations: ReadonlyArray<AirportId>;
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
  data: ConnectionsResponse;
}

export interface ConnectionsSearchResponseWithSearch extends ConnectionsSearchResponse {
  search: ConnectionsSearchRequest;
}

export interface ConnectionsResponse {
  connections: ReadonlyArray<ConnectionResponse>;
  flights: Record<string, ConnectionFlightResponse>;
  airlines: Record<AirlineId, Airline>;
  airports: Record<AirportId, Airport>;
  aircraft: Record<AircraftId, Aircraft>;
}

export interface ConnectionResponse {
  flightId: string;
  outgoing: ReadonlyArray<ConnectionResponse>;
}

export interface ConnectionFlightResponse {
  flightNumber: FlightNumber;
  departureTime: string;
  departureAirportId: AirportId;
  arrivalTime: string;
  arrivalAirportId: AirportId;
  aircraftOwner: string;
  aircraftId: AircraftId;
  aircraftConfiguration: string;
  aircraftRegistration?: string;
  codeShares: ReadonlyArray<FlightNumber>;
}

export interface ConnectionSearchShare {
  htmlUrl: string;
  imageUrl: string;
}

export type FlightVariantId = Branded<string, 'FlightScheduleVariant'>;
export interface FlightSchedules {
  flightNumber: FlightNumber;
  items: ReadonlyArray<FlightScheduleItem>;
  variants: Record<FlightVariantId, FlightScheduleVariant>;
  airlines: Record<AirlineId, Airline>;
  airports: Record<AirportId, Airport>;
  aircraft: Record<AircraftId, Aircraft>;
}

export interface FlightScheduleItem {
  departureDateLocal: string;
  departureAirportId: AirportId;
  codeShares: ReadonlyArray<FlightNumber>;
  flightVariantId?: FlightVariantId;
  version: string;
  versionCount: number;
}

export interface FlightScheduleVariant {
  id: FlightVariantId;
  operatedAs: FlightNumber;
  departureTimeLocal: string;
  departureUtcOffsetSeconds: number;
  durationSeconds: number;
  arrivalAirportId: AirportId;
  arrivalUtcOffsetSeconds: number;
  serviceType: string;
  aircraftOwner: string;
  aircraftId: AircraftId;
  aircraftConfigurationVersion: string;
}

export interface OldFlightScheduleVariantMetadata {
  creationTime: string;
  rangesUpdateTime: string;
  dateUpdateTime: string;
}

export interface OldFlightScheduleVariantData {
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

export interface OldFlightScheduleVariant {
  ranges: ReadonlyArray<[string, string]>;
  data: OldFlightScheduleVariantData;
  metadata: OldFlightScheduleVariantMetadata;
}

export interface OldFlightSchedule {
  airline: string;
  flightNumber: number;
  suffix: string;
  variants: ReadonlyArray<OldFlightScheduleVariant>;
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

export interface QuerySchedulesRequest {
  airlineId?: ReadonlyArray<AirlineId>;
  aircraftId?: ReadonlyArray<AircraftId>;
  aircraftConfigurationVersion?: ReadonlyArray<string>;
  aircraft?: ReadonlyArray<[AircraftId, string]>;
  departureAirportId?: ReadonlyArray<AirportId>;
  arrivalAirportId?: ReadonlyArray<AirportId>;
  route?: ReadonlyArray<[AirportId, AirportId]>;
  minDepartureTime?: DateTime<true>;
  maxDepartureTime?: DateTime<true>;
}

export type QueryScheduleResponse = Record<string, OldFlightSchedule>;

export interface Notification {
  type: 'success' | 'info' | 'warning' | 'error' | 'in-progress';
  header?: string;
  content?: string;
}
