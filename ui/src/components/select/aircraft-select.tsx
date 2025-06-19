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
  const [options, optionByAircraftId] = useAircraftOptions(data.lookupById);

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
  const [options, optionByAircraftId] = useAircraftOptions(data.lookupById);

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
function useAircraftOptions(aircraftLookupById: Map<AircraftId, Aircraft>): [ReadonlyArray<CommonOption | CommonOptionGroup>, Record<AircraftId, CommonOption>] {
  return useMemo(() => {
    const optionByAircraftId: Record<AircraftId, CommonOption> = {};
    const groupOptions: Array<CommonOptionGroup> = [];
    const orphanOptions: Array<CommonOption> = [];

    const [aircraftByTopmostFamily, orphans] = groupByTopmostFamily(aircraftLookupById);
    const buildAircraftOption = (ac: Aircraft): CommonOption => {
      const tags: Array<string> = [];
      if (ac.iataCode) {
        tags.push(ac.iataCode);
      }

      if (ac.icaoCode) {
        tags.push(ac.icaoCode);
      }

      let suffix = '';
      if (ac.type === 'family') {
        suffix = ' (family, not further specified)';
      }

      return {
        label: (ac.name ?? ac.icaoCode ?? ac.iataCode ?? ac.id) + suffix,
        description: ac.icaoCode,
        tags: tags,
        value: ac.id,
      } satisfies CommonOption;
    };

    for (const [familyId, aircraft] of aircraftByTopmostFamily.entries()) {
      const family = aircraftLookupById.get(familyId)!;
      const options: Array<CommonOption> = [];

      if (Object.keys(family.configurations).length > 0) {
        const option = buildAircraftOption(family);
        options.push(option);
        optionByAircraftId[family.id] = option;
      }

      for (const ac of aircraft) {
        const option = buildAircraftOption(ac);
        options.push(option);
        optionByAircraftId[ac.id] = option;
      }

      groupOptions.push({
        label: family.name,
        options: options,
      } satisfies CommonOptionGroup);
    }

    for (const ac of orphans) {
      const option = buildAircraftOption(ac);
      orphanOptions.push(option);
      optionByAircraftId[ac.id] = option;
    }

    // sort by group size descending
    groupOptions.sort((a: CommonOptionGroup, b: CommonOptionGroup) => {
      return b.options.length - a.options.length;
    });

    const options: Array<CommonOption | CommonOptionGroup> = [
      ...groupOptions,
      ...orphanOptions,
    ];

    return [options, optionByAircraftId];
  }, [aircraftLookupById]);
}

function groupByTopmostFamily(aircraftLookupById: Map<AircraftId, Aircraft>): [Map<AircraftId, ReadonlyArray<Aircraft>>, ReadonlyArray<Aircraft>] {
  const result = new Map<AircraftId, Array<Aircraft>>();
  const unmapped: Array<Aircraft> = [];

  for (const ac of aircraftLookupById.values()) {
    if (Object.keys(ac.configurations).length > 0) {
      let curr = ac;
      while (curr.parentFamilyId) {
        curr = aircraftLookupById.get(curr.parentFamilyId)!;
      }

      if (curr !== ac) {
        let items = result.get(curr.id);
        if (!items) {
          items = [];
          result.set(curr.id, items);
        }

        items.push(ac);
      } else {
        unmapped.push(ac);
      }
    }
  }

  return [result, unmapped] as const;
}