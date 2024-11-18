import { Airports } from '../../lib/api/api.model';
import React, { useMemo, useState } from 'react';
import { Select, SelectProps } from '@cloudscape-design/components';

export interface AirportSelectProps {
  airports: Airports;
  selectedAirportCode: string | null;
  loading: boolean;
  disabled: boolean;
  onChange: (value: string | null) => void;
  placeholder?: string;
}

export function AirportSelect({ airports, selectedAirportCode, loading, disabled, onChange, placeholder }: AirportSelectProps) {
  const [filterText, setFilterText] = useState('');
  const [options, optionByAirportCode] = useMemo(() => {
    const options: Array<SelectProps.Option | SelectProps.OptionGroup> = [];
    const optionByAirportCode: Record<string, SelectProps.Option> = {};

    for (const airport of airports.airports) {
      const option = {
        label: airport.code,
        value: airport.code,
        description: airport.name,
      } satisfies SelectProps.Option;

      options.push(option);
      optionByAirportCode[airport.code] = option;
    }

    for (const metroArea of airports.metropolitanAreas) {
      const airportOptions: Array<SelectProps.Option> = [];

      for (const airport of metroArea.airports) {
        const option = {
          label: airport.code,
          value: airport.code,
          description: airport.name,
        } satisfies SelectProps.Option;

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

  const displayOptions = useMemo(() => {
    const filter = filterText.trim();
    if (filter === '') {
      return options;
    }

    return filterOptions(filter.toUpperCase(), options)[0];
  }, [filterText, options]);

  const selectedOption = useMemo(() => {
    if (!selectedAirportCode) {
      return null;
    }

    return optionByAirportCode[selectedAirportCode];
  }, [optionByAirportCode, selectedAirportCode]);

  return (
    <Select
      options={displayOptions}
      selectedOption={selectedOption}
      onChange={(e) => onChange(e.detail.selectedOption?.value ?? null)}
      virtualScroll={true}
      disabled={disabled}
      statusType={loading ? 'loading' : 'finished'}
      filteringType={'manual'}
      onLoadItems={(e) => setFilterText(e.detail.filteringText)}
      placeholder={placeholder}
    />
  );
}

function filterOptions(filter: string, options: ReadonlyArray<SelectProps.Option | SelectProps.OptionGroup>): [ReadonlyArray<SelectProps.Option | SelectProps.OptionGroup>, boolean] {
  const matchByLabel: Array<SelectProps.Option | SelectProps.OptionGroup> = [];
  const matchByDescription: Array<SelectProps.Option | SelectProps.OptionGroup> = [];

  for (const option of options) {
    const label = option.label?.toUpperCase();
    const description = option.description?.toUpperCase();
    let matched = false;

    if (label?.includes(filter)) {
      matchByLabel.push(option);
      matched = true;
    } else if (isOptionGroup(option)) {
      const [filtered, anyMatchedByLabel] = filterOptions(filter, option.options);
      if (filtered.length > 0) {
        const filteredOption = {
          ...option,
          options: filtered,
        } satisfies SelectProps.OptionGroup;

        if (anyMatchedByLabel) {
          matchByLabel.push(filteredOption);
        } else {
          matchByDescription.push(filteredOption);
        }

        matched = true;
      }
    }

    if (!matched && description?.includes(filter)) {
      matchByDescription.push(option);
    }
  }

  return [[...matchByLabel, ...matchByDescription], matchByLabel.length > 0];
}

function isOptionGroup(option: SelectProps.Option | SelectProps.OptionGroup): option is SelectProps.OptionGroup {
  return !!(option as SelectProps.OptionGroup).options;
}