import type { FlightScheduleVariant, QuerySchedulesResponse } from '@/api/types';

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
    <div className='calendar-highlight-controls' role='group' aria-label={ariaLabel}>
      <strong>Highlight</strong>
      <div className='facet-buttons'>
        {fleetHighlightOptions.map(([key, label]) => (
          <button
            key={key}
            className={value === key ? 'active' : ''}
            aria-pressed={value === key}
            onClick={() => onChange(key)}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}

export function fleetHighlightValue(
  variant: FlightScheduleVariant,
  highlight: Exclude<FleetHighlight, 'none'>,
  data: Pick<QuerySchedulesResponse, 'aircraft'>,
) {
  const aircraft = data.aircraft[variant.aircraftId]?.name ?? variant.aircraftId;
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
