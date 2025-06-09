import React, { useMemo } from 'react';
import { Multiselect, MultiselectProps } from '@cloudscape-design/components';
import { AirlineId } from '../../lib/api/api.model';
import { useAirlines } from '../util/state/data';

export interface AirlineMultiselectProps {
  selectedAirlineIds: ReadonlyArray<AirlineId>;
  disabled: boolean;
  onChange: (options: ReadonlyArray<AirlineId>) => void;
  placeholder?: string;
}

export function AirlineMultiselect({ selectedAirlineIds, disabled, onChange, placeholder }: AirlineMultiselectProps) {
  const { data, isLoading: loading } = useAirlines();
  const [options, optionByAirlineId] = useMemo(() => {
    const options: Array<MultiselectProps.Option> = [];
    const optionByAirlineId: Record<AirlineId, MultiselectProps.Option> = {};

    for (const airline of data.airlines) {
      const tags: Array<string> = [];
      tags.push(airline.iataCode);

      if (airline.icaoCode) {
        tags.push(airline.icaoCode);
      }

      const option = {
        label: airline.name ?? airline.iataCode,
        tags: tags,
        value: airline.id,
      } satisfies MultiselectProps.Option;


      options.push(option);
      optionByAirlineId[airline.id] = option;
    }

    return [options, optionByAirlineId];
  }, [data.airlines]);

  const selectedOptions = useMemo(() => {
    const result: Array<MultiselectProps.Option> = [];
    for (const airlineId of selectedAirlineIds) {
      const option = optionByAirlineId[airlineId];
      if (option) {
        result.push(option);
      }
    }

    return result;
  }, [optionByAirlineId, selectedAirlineIds]);

  return (
    <Multiselect
      options={options}
      selectedOptions={selectedOptions}
      onChange={(e) => onChange(e.detail.selectedOptions.flatMap((v) => v.value ? [v.value as AirlineId] : []))}
      keepOpen={true}
      filteringType={'auto'}
      disabled={disabled}
      statusType={loading ? 'loading' : 'finished'}
      placeholder={placeholder}
    />
  );
}