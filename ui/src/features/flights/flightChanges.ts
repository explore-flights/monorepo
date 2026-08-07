import type {
  FlightNumber,
  FlightReferenceData,
  FlightScheduleItem,
  FlightScheduleVariant,
} from '@/api/types';
import { duration, flightName } from '@/lib/format';
import { arrivalScheduleTime, formatUtcOffset } from '@/lib/time';

export interface FieldChange {
  key: string;
  label: string;
  before: string;
  after: string;
  group: 'schedule' | 'operation' | 'distribution';
}

export function compareFlightVariants(
  before: FlightScheduleVariant | undefined,
  after: FlightScheduleVariant | undefined,
  data: FlightReferenceData,
  departureDateLocal: string,
): FieldChange[] {
  if (!before && !after) {
    return [];
  }
  if (before && !after) {
    return [
      {
        key: 'status',
        label: 'Status',
        before: 'Scheduled',
        after: 'Cancelled',
        group: 'schedule',
      },
    ];
  }
  if (!before && after) {
    return [
      {
        key: 'status',
        label: 'Status',
        before: 'Cancelled',
        after: 'Scheduled',
        group: 'schedule',
      },
    ];
  }
  if (!before || !after) {
    return [];
  }

  const beforeArrival = arrivalScheduleTime(departureDateLocal, before);
  const afterArrival = arrivalScheduleTime(departureDateLocal, after);
  const values: Array<[string, string, string, string, FieldChange['group']]> = [
    [
      'operated-as',
      'Operated as',
      formatFlightNumber(before.operatedAs, data),
      formatFlightNumber(after.operatedAs, data),
      'operation',
    ],
    [
      'departure-time',
      'Departure local time',
      before.departureTimeLocal,
      after.departureTimeLocal,
      'schedule',
    ],
    [
      'departure-offset',
      'Departure UTC offset',
      formatUtcOffset(before.departureUtcOffsetSeconds),
      formatUtcOffset(after.departureUtcOffsetSeconds),
      'schedule',
    ],
    [
      'arrival-airport',
      'Arrival airport',
      airportLabel(before.arrivalAirportId, data),
      airportLabel(after.arrivalAirportId, data),
      'schedule',
    ],
    [
      'arrival-time',
      'Arrival local time',
      `${beforeArrival.date} ${beforeArrival.time}`,
      `${afterArrival.date} ${afterArrival.time}`,
      'schedule',
    ],
    [
      'arrival-offset',
      'Arrival UTC offset',
      formatUtcOffset(before.arrivalUtcOffsetSeconds),
      formatUtcOffset(after.arrivalUtcOffsetSeconds),
      'schedule',
    ],
    [
      'duration',
      'Duration',
      duration(before.durationSeconds),
      duration(after.durationSeconds),
      'schedule',
    ],
    ['service-type', 'Service type', before.serviceType, after.serviceType, 'operation'],
    ['aircraft-owner', 'Aircraft owner', before.aircraftOwner, after.aircraftOwner, 'operation'],
    [
      'aircraft',
      'Aircraft',
      aircraftLabel(before.aircraftId, data),
      aircraftLabel(after.aircraftId, data),
      'operation',
    ],
    [
      'configuration',
      'Configuration',
      before.aircraftConfigurationVersion,
      after.aircraftConfigurationVersion,
      'operation',
    ],
    [
      'codeshares',
      'Codeshares',
      formatCodeshares(before.codeShares, data),
      formatCodeshares(after.codeShares, data),
      'distribution',
    ],
  ];
  const result = values
    .filter(([, , left, right]) => left !== right)
    .map(([key, label, left, right, group]) => ({ key, label, before: left, after: right, group }));
  const dataElementKeys = new Set([
    ...Object.keys(before.dataElements),
    ...Object.keys(after.dataElements),
  ]);
  for (const key of [...dataElementKeys].sort((left, right) => Number(left) - Number(right))) {
    const left = before.dataElements[Number(key)] ?? '';
    const right = after.dataElements[Number(key)] ?? '';
    if (left !== right) {
      result.push({
        key: `data-element-${key}`,
        label: `Data element ${key}`,
        before: left,
        after: right,
        group: 'distribution',
      });
    }
  }
  return result;
}

export function variantFor(data: FlightReferenceData, id?: string) {
  return id ? data.variants[id] : undefined;
}
export function previousVariantFor(data: FlightReferenceData, item: FlightScheduleItem) {
  return variantFor(data, item.previousFlightVariantId);
}
export function displayVariantFor(data: FlightReferenceData, item: FlightScheduleItem) {
  return variantFor(data, item.flightVariantId ?? item.previousFlightVariantId);
}

function airportLabel(id: string, data: FlightReferenceData) {
  const airport = data.airports[id];
  return airport ? `${airport.iataCode} · ${airport.name}` : id;
}

function aircraftLabel(id: string, data: FlightReferenceData) {
  const aircraft = data.aircraft[id];
  return aircraft?.name ?? aircraft?.icaoCode ?? aircraft?.iataCode ?? id;
}

function formatFlightNumber(value: FlightNumber, data: FlightReferenceData) {
  return flightName(value, data.airlines);
}
function formatCodeshares(values: readonly FlightNumber[], data: FlightReferenceData) {
  return [...values]
    .map((value) => formatFlightNumber(value, data))
    .sort()
    .join(' · ');
}
