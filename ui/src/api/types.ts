export type AirportId = string;
export type AirlineId = string;
export type AircraftId = string;
export type FlightVariantId = string;

export interface Airport {
  id: AirportId;
  iataCode: string;
  icaoCode?: string;
  iataAreaCode?: string;
  countryCode: string;
  cityCode: string;
  type: string;
  location: { lng: number; lat: number };
  timezone: string;
  name: string;
}

export interface Airline {
  id: AirlineId;
  iataCode: string;
  icaoCode?: string;
  name: string;
}

export interface Aircraft {
  type: 'aircraft' | 'family';
  id: AircraftId;
  iataCode: string;
  parentFamilyId?: AircraftId;
  icaoCode?: string;
  name: string;
  configurations: Record<AirlineId, ReadonlyArray<string>>;
}

export interface FlightNumber {
  airlineId: AirlineId;
  number: number;
  suffix?: string;
}

interface FlightScheduleItemBase {
  departureDateLocal: string;
  departureAirportId: AirportId;
  previousFlightVariantId?: FlightVariantId;
  version: string;
  versionCount: number;
}

export interface OperatingFlightScheduleItem extends FlightScheduleItemBase {
  flightVariantId: FlightVariantId;
}

export interface CancelledFlightScheduleItem extends FlightScheduleItemBase {
  flightVariantId?: undefined;
}

export type FlightScheduleItem = OperatingFlightScheduleItem | CancelledFlightScheduleItem;

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
  codeShares: ReadonlyArray<FlightNumber>;
  dataElements: Record<number, string>;
}

export interface UpdateReportItem {
  version: string;
  removed: number;
  added: number;
  updated: number;
}

export interface ReferenceData {
  airlines: Record<AirlineId, Airline>;
  airports: Record<AirportId, Airport>;
  aircraft: Record<AircraftId, Aircraft>;
}

export interface FlightReferenceData extends ReferenceData {
  variants: Record<FlightVariantId, FlightScheduleVariant>;
}

export interface FlightSchedules extends FlightReferenceData {
  flightNumber: FlightNumber;
  relatedFlightNumbers: ReadonlyArray<FlightNumber>;
  items: ReadonlyArray<FlightScheduleItem>;
  updateReport: ReadonlyArray<UpdateReportItem>;
}

interface FlightScheduleVersionBase {
  version: string;
}

export interface OperatingFlightScheduleVersion extends FlightScheduleVersionBase {
  flightVariantId: FlightVariantId;
}

export interface CancelledFlightScheduleVersion extends FlightScheduleVersionBase {
  flightVariantId?: undefined;
}

export type FlightScheduleVersion = OperatingFlightScheduleVersion | CancelledFlightScheduleVersion;

export interface FlightScheduleVersions extends FlightReferenceData {
  flightNumber: FlightNumber;
  departureDateLocal: string;
  departureAirportId: AirportId;
  versions: ReadonlyArray<FlightScheduleVersion>;
}

export interface FlightNumberAndScheduleItems {
  flightNumber: FlightNumber;
  items: ReadonlyArray<FlightScheduleItem>;
}
export interface QuerySchedulesResponse extends FlightReferenceData {
  schedules: ReadonlyArray<FlightNumberAndScheduleItems>;
}

export interface QuerySchedulesRequest {
  airlineId?: ReadonlyArray<AirlineId>;
  aircraftId?: ReadonlyArray<AircraftId>;
  aircraftConfigurationVersion?: ReadonlyArray<string>;
  aircraft?: ReadonlyArray<readonly [AircraftId, string]>;
  departureAirportId?: ReadonlyArray<AirportId>;
  arrivalAirportId?: ReadonlyArray<AirportId>;
  route?: ReadonlyArray<readonly [AirportId, AirportId]>;
  minDepartureTime?: string;
  maxDepartureTime?: string;
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

export interface ConnectionFlight {
  flightNumber: FlightNumber;
  departureTime: string;
  departureAirportId: AirportId;
  arrivalTime: string;
  arrivalAirportId: AirportId;
  aircraftOwner: string;
  aircraftId: AircraftId;
  aircraftConfiguration: string;
  codeShares: ReadonlyArray<FlightNumber>;
}
export interface ConnectionBranch {
  flightId: string;
  outgoing: ReadonlyArray<ConnectionBranch>;
}
export interface ConnectionsData extends ReferenceData {
  connections: ReadonlyArray<ConnectionBranch>;
  flights: Record<string, ConnectionFlight>;
}
export interface ConnectionsResponse {
  data: ConnectionsData;
}
export interface ConnectionShare {
  htmlUrl: string;
  imageUrl: string;
}
export interface SharedConnectionsResponse extends ConnectionsResponse {
  search: ConnectionsSearchRequest;
}

export interface SearchResponse {
  airlines: ReadonlyArray<Airline>;
  flightNumbers: ReadonlyArray<FlightNumber>;
}

export interface Notification {
  type: 'success' | 'info' | 'warning' | 'error' | 'in-progress';
  header?: string;
  content?: string;
}

export interface NotificationsResponse {
  notifications: ReadonlyArray<Notification>;
  dataVersion?: string;
}
