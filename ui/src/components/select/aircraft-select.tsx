import { Aircraft } from '../../lib/api/api.model';
import React, { useMemo } from 'react';
import { Select, SelectProps } from '@cloudscape-design/components';

export interface AircraftSelectProps {
  aircraft: ReadonlyArray<Aircraft>;
  selectedAircraftCode: string | null;
  loading: boolean;
  disabled: boolean;
  onChange: (v: string | null) => void;
  placeholder?: string;
}

export function AircraftSelect({ aircraft, selectedAircraftCode, loading, disabled, onChange, placeholder }: AircraftSelectProps) {
  const [options, optionByAircraftCode] = useMemo(() => {
    const optionByAircraftCode: Record<string, SelectProps.Option> = {};
    const otherOptions: Array<SelectProps.Option> = [];
    const groups: ReadonlyArray<{ name: string, options: Array<SelectProps.Option> }> = [
      { name: 'Airbus', options: [] },
      { name: 'Boeing', options: [] },
      { name: 'Embraer', options: [] },
      { name: 'BAE Systems', options: [] },
      { name: 'Antonov', options: [] },
      { name: 'Bombardier', options: [] },
      { name: 'Tupolev', options: [] },
    ];

    for (const a of aircraft) {
      const option = {
        label: a.name,
        value: a.code,
        description: a.equipCode,
      } satisfies SelectProps.Option;

      let addedToGroup = false;
      for (const group of groups) {
        if (a.name.toLowerCase().includes(group.name.toLowerCase())) {
          group.options.push(option);
          addedToGroup = true;
          break;
        }
      }

      if (!addedToGroup) {
        otherOptions.push(option);
      }

      optionByAircraftCode[a.code] = option;
    }

    const options: Array<SelectProps.Option | SelectProps.OptionGroup> = [];
    for (const group of groups) {
      if (group.options.length > 0) {
        options.push({
          label: group.name,
          options: group.options,
        });
      }
    }

    options.push(...otherOptions);

    return [options, optionByAircraftCode];
  }, [aircraft]);

  const selectedOption = useMemo(() => {
    if (!selectedAircraftCode) {
      return null;
    }

    return optionByAircraftCode[selectedAircraftCode];
  }, [optionByAircraftCode, selectedAircraftCode]);

  return (
    <Select
      options={options}
      selectedOption={selectedOption}
      onChange={(e) => onChange(e.detail.selectedOption?.value ?? null)}
      virtualScroll={true}
      filteringType={'auto'}
      disabled={disabled}
      statusType={loading ? 'loading' : 'finished'}
      placeholder={placeholder}
    />
  );
}