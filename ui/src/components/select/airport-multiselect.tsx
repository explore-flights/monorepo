import { Airports } from '../../lib/api/api.model';
import React, { useMemo } from 'react';
import { Multiselect, MultiselectProps } from '@cloudscape-design/components';

export interface AirportMultiselectProps {
  airports: Airports;
  selectedAirportCodes: ReadonlyArray<string>;
  loading: boolean;
  disabled: boolean;
  onChange: (options: ReadonlyArray<string>) => void;
}

export function AirportMultiselect({ airports, selectedAirportCodes, loading, disabled, onChange }: AirportMultiselectProps) {
  const [options, optionByAirportCode] = useMemo(() => {
    const options: Array<MultiselectProps.Option | MultiselectProps.OptionGroup> = [];
    const optionByAirportCode: Record<string, MultiselectProps.Option> = {};

    for (const airport of airports.airports) {
      const option = {
        label: airport.code,
        value: airport.code,
        description: airport.name,
      } satisfies MultiselectProps.Option;

      options.push(option);
      optionByAirportCode[airport.code] = option;
    }

    for (const metroArea of airports.metropolitanAreas) {
      const airportOptions: Array<MultiselectProps.Option> = [];

      for (const airport of metroArea.airports) {
        const option = {
          label: airport.code,
          value: airport.code,
          description: airport.name,
        } satisfies MultiselectProps.Option;

        airportOptions.push(option);
        optionByAirportCode[airport.code] = option;
      }

      options.push({
        label: metroArea.code,
        description: metroArea.name,
        options: airportOptions,
      });
    }

    return [options, optionByAirportCode];
  }, [airports]);

  const selectedOptions = useMemo(() => {
    const result: Array<MultiselectProps.Option> = [];
    for (const airportCode of selectedAirportCodes) {
      const option = optionByAirportCode[airportCode];
      if (option) {
        result.push(option);
      }
    }

    return result;
  }, [optionByAirportCode, selectedAirportCodes]);

  return (
    <Multiselect
      options={options}
      selectedOptions={selectedOptions}
      onChange={(e) => onChange(e.detail.selectedOptions.flatMap((v) => v.value ? [v.value] : []))}
      keepOpen={true}
      virtualScroll={true}
      filteringType={'auto'}
      tokenLimit={2}
      disabled={disabled}
      statusType={loading ? 'loading' : 'finished'}
    />
  );
}