import type { FlightScheduleVariant, QuerySchedulesResponse } from '@/api/types';
import { ScheduleHighlightControl } from '@/components/ScheduleControls';
import { aircraftName } from '@/lib/format';

export type FleetHighlight = 'none' | 'aircraft' | 'configuration' | 'both';

const fleetHighlightOptions: ReadonlyArray<readonly [FleetHighlight, string]> = [
  ['none', 'No grouping'],
  ['aircraft', 'Aircraft'],
  ['configuration', 'Configuration'],
  ['both', 'Aircraft + Configuration'],
];

export function FleetHighlightControls({
  value,
  onChange,
  ariaLabel,
}: {
  value: FleetHighlight;
  onChange: (value: FleetHighlight) => void;
  ariaLabel: string;
}) {
  return (
    <ScheduleHighlightControl
      value={value}
      options={fleetHighlightOptions}
      onChange={onChange}
      ariaLabel={ariaLabel}
    />
  );
}

export function fleetHighlightValue(
  variant: FlightScheduleVariant,
  highlight: Exclude<FleetHighlight, 'none'>,
  data: Pick<QuerySchedulesResponse, 'aircraft'>,
) {
  const aircraft = aircraftName(variant.aircraftId, data.aircraft);
  const configuration = variant.aircraftConfigurationVersion || 'No configuration';
  if (highlight === 'aircraft') {
    return { key: variant.aircraftId, label: aircraft };
  }
  if (highlight === 'configuration') {
    return { key: configuration, label: configuration };
  }
  return {
    key: `${variant.aircraftId}|${configuration}`,
    label: `${aircraft} · ${configuration}`,
  };
}
