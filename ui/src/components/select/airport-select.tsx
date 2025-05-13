import React, { useEffect, useMemo, useState } from 'react';
import { Multiselect, MultiselectProps, Select, SelectProps } from '@cloudscape-design/components';
import { Airport, AirportId } from '../../lib/api/api.model';
import { useAirports } from '../util/state/data';
import { useDebounce } from '../util/state/use-debounce';

export interface AirportSelectProps {
  selectedAirportId: AirportId | null;
  disabled: boolean;
  onChange: (value: AirportId | null) => void;
  placeholder?: string;
}

export function AirportSelect({ selectedAirportId, disabled, onChange, placeholder }: AirportSelectProps) {
  const { data, isLoading: loading } = useAirports();
  const [options, optionByAirportId] = useAirportOptions(data.airports);

  const [filterText, setFilterText] = useState('');
  const [filterLoading, displayOptions] = useFilteredOptions(useDebounce(filterText, 250), options);

  const selectedOption = useMemo(() => {
    if (!selectedAirportId) {
      return null;
    }

    return optionByAirportId[selectedAirportId];
  }, [optionByAirportId, selectedAirportId]);

  return (
    <Select
      options={displayOptions}
      selectedOption={selectedOption}
      onChange={(e) => onChange((e.detail.selectedOption?.value as AirportId) ?? null)}
      virtualScroll={true}
      disabled={disabled}
      statusType={(loading || filterLoading) ? 'loading' : 'finished'}
      filteringType={'manual'}
      onLoadItems={(e) => setFilterText(e.detail.filteringText)}
      placeholder={placeholder}
    />
  );
}

export interface AirportMultiselectProps {
  selectedAirportIds: ReadonlyArray<AirportId>;
  rawSelectedAirports?: ReadonlyArray<string>;
  disabled: boolean;
  onChange: (options: ReadonlyArray<AirportId>) => void;
}

export function AirportMultiselect({ selectedAirportIds, rawSelectedAirports, disabled, onChange }: AirportMultiselectProps) {
  const { data, isLoading: loading } = useAirports();
  const [options, optionByAirportId] = useAirportOptions(data.airports);

  const [filterText, setFilterText] = useState('');
  const [filterLoading, displayOptions] = useFilteredOptions(useDebounce(filterText, 250), options);

  const selectedOptions = useMemo(() => {
    const result: Array<MultiselectProps.Option> = [];
    for (const airportId of selectedAirportIds) {
      const option = optionByAirportId[airportId];
      if (option) {
        result.push(option);
      }
    }

    if (rawSelectedAirports) {
      for (const maybeAirportId of rawSelectedAirports) {
        const option = optionByAirportId[maybeAirportId as AirportId];
        if (option) {
          result.push(option);
        }
      }
    }

    return result;
  }, [optionByAirportId, selectedAirportIds, rawSelectedAirports]);

  return (
    <Multiselect
      options={displayOptions}
      selectedOptions={selectedOptions}
      onChange={(e) => onChange(e.detail.selectedOptions.flatMap((v) => v.value ? [v.value as AirportId] : []))}
      keepOpen={true}
      virtualScroll={true}
      tokenLimit={2}
      disabled={disabled}
      statusType={(loading || filterLoading) ? 'loading' : 'finished'}
      filteringType={'manual'}
      onLoadItems={(e) => setFilterText(e.detail.filteringText)}
    />
  );
}

type CommonOption = SelectProps.Option & MultiselectProps.Option;
type CommonOptionGroup = SelectProps.OptionGroup & MultiselectProps.OptionGroup;
function useAirportOptions(airports: ReadonlyArray<Airport>): [ReadonlyArray<CommonOption | CommonOptionGroup>, Record<AirportId, CommonOption>] {
  return useMemo(() => {
    const options: Array<CommonOption | CommonOptionGroup> = [];
    const optionByAirportId: Record<AirportId, CommonOption> = {};
    const areaCodeOptions: Record<string, Array<CommonOption>> = {};

    for (const airport of airports) {
      const tags: Array<string> = [];
      if (airport.countryCode) {
        tags.push(airport.countryCode);
      }

      if (airport.cityCode) {
        tags.push(airport.cityCode);
      }

      if (airport.icaoCode) {
        tags.push(airport.icaoCode);
      }

      const option = {
        label: airport.iataCode ?? airport.icaoCode ?? airport.name ?? airport.id,
        description: airport.name,
        tags: tags,
        value: airport.id,
      } satisfies CommonOption;

      if (airport.iataAreaCode) {
        if (!areaCodeOptions[airport.iataAreaCode]) {
          areaCodeOptions[airport.iataAreaCode] = [];
        }

        areaCodeOptions[airport.iataAreaCode].push(option);
      } else {
        options.push(option);
      }

      optionByAirportId[airport.id] = option;
    }

    for (const [areaCode, childOptions] of Object.entries(areaCodeOptions)) {
      options.push({
        label: areaCode,
        options: childOptions,
      } satisfies CommonOptionGroup);
    }

    return [options, optionByAirportId];
  }, [airports]);
}

function useFilteredOptions(filterText: string, options: ReadonlyArray<CommonOption | CommonOptionGroup>): [boolean, ReadonlyArray<CommonOption | CommonOptionGroup>] {
  const [loading, setLoading] = useState(false);
  const [filteredOptions, setFilteredOptions] = useState(options);

  useEffect(() => {
    setLoading(true);

    (async () => {
      const filter = filterText.trim();
      if (filter === '') {
        return options;
      }

      const [filtered] = await filterOptions(filter.toUpperCase(), options);
      return filtered;
    })()
      .then((v) => setFilteredOptions(v))
      .finally(() => setLoading(false));
  }, [filterText, options]);

  return [loading, filteredOptions] as const;
}

async function filterOptions(filter: string, options: ReadonlyArray<CommonOption | CommonOptionGroup>): Promise<[ReadonlyArray<CommonOption | CommonOptionGroup>, boolean, boolean]> {
  const matchByLabel: Array<SelectProps.Option | SelectProps.OptionGroup> = [];
  const matchByTags: Array<SelectProps.Option | SelectProps.OptionGroup> = [];
  const matchByDescription: Array<SelectProps.Option | SelectProps.OptionGroup> = [];

  for (const option of options) {
    const label = option.label?.toUpperCase();
    const description = option.description?.toUpperCase();
    let matched = false;

    if (label?.includes(filter)) {
      matchByLabel.push(option);
      matched = true;
    } else if (isOptionGroup(option)) {
      const [filtered, anyMatchedByLabel, anyMatchByTags] = await filterOptions(filter, option.options);
      if (filtered.length > 0) {
        const filteredOption = {
          ...option,
          options: filtered,
        } satisfies SelectProps.OptionGroup;

        if (anyMatchedByLabel) {
          matchByLabel.push(filteredOption);
        } else if (anyMatchByTags) {
          matchByTags.push(filteredOption);
        } else {
          matchByDescription.push(filteredOption);
        }

        matched = true;
      }
    }

    if (!matched) {
      let matchedByTags = false;
      if (option.tags) {
        for (const tag of option.tags) {
          if (tag.toUpperCase().includes(filter)) {
            matchByTags.push(option);
            matchedByTags = true;
            break;
          }
        }
      }

      if (!matchedByTags && description?.includes(filter)) {
        matchByDescription.push(option);
      }
    }
  }

  return [[...matchByLabel, ...matchByTags, ...matchByDescription], matchByLabel.length > 0, matchByTags.length > 0];
}

function isOptionGroup(option: CommonOption | CommonOptionGroup): option is CommonOptionGroup {
  return !!(option as SelectProps.OptionGroup).options;
}