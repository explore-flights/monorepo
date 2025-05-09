import React, { useMemo } from 'react';
import { Multiselect, MultiselectProps } from '@cloudscape-design/components';
import { Airline } from '../../lib/api/api.model';

export interface AirlineMultiselectProps {
  airlines: ReadonlyArray<Airline>;
  selectedAirlines: ReadonlyArray<string>;
  loading: boolean;
  disabled: boolean;
  onChange: (options: ReadonlyArray<string>) => void;
  placeholder?: string;
}

export function AirlineMultiselect({ airlines, selectedAirlines, loading, disabled, onChange, placeholder }: AirlineMultiselectProps) {
  const [options, optionByAirline] = useMemo(() => {
    const options: Array<MultiselectProps.Option> = [];
    const optionByAirline: Record<string, MultiselectProps.Option> = {};

    for (const airline of airlines) {
      if (airline.iataCode) {
        const option = {
          label: airline.name,
          labelTag: airline.iataCode,
          tags: airline.icaoCode ? [airline.icaoCode] : undefined,
          value: airline.iataCode,
        } satisfies MultiselectProps.Option;


        options.push(option);
        optionByAirline[airline.iataCode] = option;
      }
    }

    return [options, optionByAirline];
  }, [airlines]);

  const selectedOptions = useMemo(() => {
    const result: Array<MultiselectProps.Option> = [];
    for (const airline of selectedAirlines) {
      const option = optionByAirline[airline];
      if (option) {
        result.push(option);
      }
    }

    return result;
  }, [optionByAirline, selectedAirlines]);

  return (
    <Multiselect
      options={options}
      selectedOptions={selectedOptions}
      onChange={(e) => onChange(e.detail.selectedOptions.flatMap((v) => v.value ? [v.value] : []))}
      keepOpen={true}
      filteringType={'auto'}
      disabled={disabled}
      statusType={loading ? 'loading' : 'finished'}
      placeholder={placeholder}
    />
  );
}