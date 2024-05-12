import { Airports } from '../../lib/api/api.model';
import React, { useEffect, useMemo, useState } from 'react';
import { Multiselect, MultiselectProps } from '@cloudscape-design/components';

export interface AirportMultiselectProps {
  airports: Airports;
  loading: boolean;
  disabled: boolean;
  onChange: (options: ReadonlyArray<string>) => void;
}

export function AirportMultiselect({ airports, loading, disabled, onChange }: AirportMultiselectProps) {
  const options = useMemo<MultiselectProps.Options>(() => {
    const options: Array<MultiselectProps.Option | MultiselectProps.OptionGroup> = [];

    for (const airport of airports.airports) {
      options.push({
        label: airport.code,
        value: airport.code,
        description: airport.name,
      });
    }

    for (const metroArea of airports.metropolitanAreas) {
      const airportOptions: Array<MultiselectProps.Option> = [];

      for (const airport of metroArea.airports) {
        airportOptions.push({
          label: airport.code,
          value: airport.code,
          description: airport.name,
        });
      }

      options.push({
        label: metroArea.code,
        description: metroArea.name,
        options: airportOptions,
      });
    }

    return options;
  }, [airports]);

  const [selectedOptions, setSelectedOptions] = useState<ReadonlyArray<MultiselectProps.Option>>([]);

  useEffect(() => {
    onChange(selectedOptions.map((v) => v.value!));
  }, [selectedOptions]);

  return (
    <Multiselect
      options={options}
      selectedOptions={selectedOptions}
      onChange={(e) => setSelectedOptions(e.detail.selectedOptions)}
      keepOpen={true}
      virtualScroll={true}
      filteringType={'auto'}
      tokenLimit={2}
      disabled={disabled}
      statusType={loading ? 'loading' : 'finished'}
    />
  );
}