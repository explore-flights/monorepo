import { Aircraft } from '../../lib/api/api.model';
import React, { useMemo } from 'react';
import { Multiselect, MultiselectProps } from '@cloudscape-design/components';

export interface AircraftMultiselectProps {
  aircraft: ReadonlyArray<Aircraft>;
  selectedAircraftCodes: ReadonlyArray<string>;
  loading: boolean;
  disabled: boolean;
  onChange: (options: ReadonlyArray<string>) => void;
}

export function AircraftMultiselect({ aircraft, selectedAircraftCodes, loading, disabled, onChange }: AircraftMultiselectProps) {
  const [options, optionByAircraftCode] = useMemo(() => {
    const optionByAircraftCode: Record<string, MultiselectProps.Option> = {};
    const otherOptions: Array<MultiselectProps.Option> = [];
    const groups: ReadonlyArray<{ name: string, options: Array<MultiselectProps.Option> }> = [
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
      } satisfies MultiselectProps.Option;

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

    const options: Array<MultiselectProps.Option | MultiselectProps.OptionGroup> = [];
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

  const selectedOptions = useMemo(() => {
    const result: Array<MultiselectProps.Option> = [];
    for (const aircraftCode of selectedAircraftCodes) {
      const option = optionByAircraftCode[aircraftCode];
      if (option) {
        result.push(option);
      }
    }

    return result;
  }, [optionByAircraftCode, selectedAircraftCodes]);

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