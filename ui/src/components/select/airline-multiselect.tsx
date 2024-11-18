import React, { useMemo } from 'react';
import { Multiselect, MultiselectProps } from '@cloudscape-design/components';

export interface AirlineMultiselectProps {
  airlines: ReadonlyArray<string>;
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
      const option = {
        label: airline,
        value: airline,
      } satisfies MultiselectProps.Option;


      options.push(option);
      optionByAirline[airline] = option;
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