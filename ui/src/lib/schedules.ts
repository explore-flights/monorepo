import type { FlightScheduleItem, OperatingFlightScheduleItem } from '@/api/types';

export function isOperatingScheduleItem(
  item: FlightScheduleItem,
): item is OperatingFlightScheduleItem {
  return item.flightVariantId !== undefined;
}
