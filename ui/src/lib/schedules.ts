import type {
  FlightReferenceData,
  FlightScheduleItem,
  FlightScheduleVariant,
  OperatingFlightScheduleItem,
} from '@/api/types';

export function isOperatingScheduleItem(
  item: FlightScheduleItem,
): item is OperatingFlightScheduleItem {
  return item.flightVariantId !== undefined;
}

export function isCancelledScheduleItem(item: FlightScheduleItem): boolean {
  return !isOperatingScheduleItem(item);
}

export function variantFor(
  data: FlightReferenceData,
  id: string | undefined,
): FlightScheduleVariant | undefined {
  return id ? data.variants[id] : undefined;
}

export function previousVariantFor(
  data: FlightReferenceData,
  item: FlightScheduleItem,
): FlightScheduleVariant | undefined {
  return variantFor(data, item.previousFlightVariantId);
}

export function displayVariantFor(
  data: FlightReferenceData,
  item: FlightScheduleItem,
): FlightScheduleVariant | undefined {
  return variantFor(data, item.flightVariantId ?? item.previousFlightVariantId);
}

export function groupScheduleItemsByDepartureDate(
  items: readonly FlightScheduleItem[],
): Map<string, FlightScheduleItem[]> {
  const result = new Map<string, FlightScheduleItem[]>();
  for (const item of items) {
    const dateItems = result.get(item.departureDateLocal) ?? [];
    result.set(item.departureDateLocal, [...dateItems, item]);
  }
  return result;
}
