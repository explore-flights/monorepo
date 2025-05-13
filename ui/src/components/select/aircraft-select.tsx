import React, { useMemo } from 'react';
import { Multiselect, MultiselectProps, Select, SelectProps } from '@cloudscape-design/components';
import { useAircrafts } from '../util/state/data';
import { Aircraft, AircraftId } from '../../lib/api/api.model';

export interface AircraftSelectProps {
  selectedAircraftId: AircraftId | null;
  disabled: boolean;
  onChange: (v: AircraftId | null) => void;
  placeholder?: string;
}

export function AircraftSelect({ selectedAircraftId, disabled, onChange, placeholder }: AircraftSelectProps) {
  const { data, isLoading: loading } = useAircrafts();
  const [options, optionByAircraftId] = useAircraftOptions(data.aircraft);

  const selectedOption = useMemo(() => {
    if (!selectedAircraftId) {
      return null;
    }

    return optionByAircraftId[selectedAircraftId];
  }, [optionByAircraftId, selectedAircraftId]);

  return (
    <Select
      options={options}
      selectedOption={selectedOption}
      onChange={(e) => onChange((e.detail.selectedOption?.value as AircraftId) ?? null)}
      virtualScroll={true}
      filteringType={'auto'}
      disabled={disabled}
      statusType={loading ? 'loading' : 'finished'}
      placeholder={placeholder}
    />
  );
}

export interface AircraftMultiselectProps {
  selectedAircraftIds: ReadonlyArray<AircraftId>;
  rawSelectedAircraft?: ReadonlyArray<string>;
  disabled: boolean;
  onChange: (options: ReadonlyArray<AircraftId>) => void;
  placeholder?: string;
}

export function AircraftMultiselect({ selectedAircraftIds, rawSelectedAircraft, disabled, onChange, placeholder }: AircraftMultiselectProps) {
  const { data, isLoading: loading } = useAircrafts();
  const [options, optionByAircraftId] = useAircraftOptions(data.aircraft);

  const selectedOptions = useMemo(() => {
    const result: Array<MultiselectProps.Option> = [];
    for (const aircraftId of selectedAircraftIds) {
      const option = optionByAircraftId[aircraftId];
      if (option) {
        result.push(option);
      }
    }

    if (rawSelectedAircraft) {
      for (const maybeAircraftId of rawSelectedAircraft) {
        const option = optionByAircraftId[maybeAircraftId as AircraftId];
        if (option) {
          result.push(option);
        }
      }
    }

    return result;
  }, [optionByAircraftId, selectedAircraftIds, rawSelectedAircraft]);

  return (
    <Multiselect
      options={options}
      selectedOptions={selectedOptions}
      onChange={(e) => onChange(e.detail.selectedOptions.flatMap((v) => v.value ? [v.value as AircraftId] : []))}
      keepOpen={true}
      virtualScroll={true}
      filteringType={'auto'}
      tokenLimit={2}
      disabled={disabled}
      statusType={loading ? 'loading' : 'finished'}
      placeholder={placeholder}
    />
  );
}

type CommonOption = SelectProps.Option & MultiselectProps.Option;
type CommonOptionGroup = SelectProps.OptionGroup & MultiselectProps.OptionGroup;
function useAircraftOptions(aircraft: ReadonlyArray<Aircraft>): [ReadonlyArray<CommonOption | CommonOptionGroup>, Record<AircraftId, CommonOption>] {
  return useMemo(() => {
    const optionByAircraftId: Record<AircraftId, CommonOption> = {};
    const otherOptions: Array<CommonOption> = [];
    const groups: ReadonlyArray<{ name: string, options: Array<CommonOption> }> = [
      { name: 'Airbus', options: [] },
      { name: 'Boeing', options: [] },
      { name: 'Embraer', options: [] },
      { name: 'BAE Systems', options: [] },
      { name: 'Antonov', options: [] },
      { name: 'Bombardier', options: [] },
      { name: 'Tupolev', options: [] },
    ];

    for (const ac of aircraft) {
      const tags: Array<string> = [];
      if (ac.iataCode) {
        tags.push(ac.iataCode);
      }

      if (ac.icaoCode) {
        tags.push(ac.icaoCode);
      }

      const option = {
        label: ac.name ?? ac.equipCode ?? ac.iataCode ?? ac.icaoCode ?? ac.id,
        description: ac.equipCode,
        tags: tags,
        value: ac.id,
      } satisfies CommonOption;

      let addedToGroup = false;
      for (const group of groups) {
        if (ac.name?.toLowerCase().includes(group.name.toLowerCase())) {
          group.options.push(option);
          addedToGroup = true;
          break;
        }
      }

      if (!addedToGroup) {
        otherOptions.push(option);
      }

      optionByAircraftId[ac.id] = option;
    }

    const options: Array<CommonOption | CommonOptionGroup> = [];
    for (const group of groups) {
      if (group.options.length > 0) {
        options.push({
          label: group.name,
          options: group.options,
        });
      }
    }

    options.push(...otherOptions);

    return [options, optionByAircraftId];
  }, [aircraft]);
}