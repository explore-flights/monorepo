import { Airports } from '../../lib/api/api.model';
import React, { useMemo, useState } from 'react';
import { Multiselect, MultiselectProps } from '@cloudscape-design/components';

export interface AirportMultiselectProps {
  airports: Airports;
  selectedAirportCodes: ReadonlyArray<string>;
  loading: boolean;
  disabled: boolean;
  onChange: (options: ReadonlyArray<string>) => void;
}

export function AirportMultiselect({ airports, selectedAirportCodes, loading, disabled, onChange }: AirportMultiselectProps) {
  const [filterText, setFilterText] = useState('');
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

  const displayOptions = useMemo(() => {
    const filter = filterText.trim();
    if (filter === '') {
      return options;
    }

    return filterOptions(filter.toUpperCase(), options)[0];
  }, [filterText, options]);

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
      options={displayOptions}
      selectedOptions={selectedOptions}
      onChange={(e) => onChange(e.detail.selectedOptions.flatMap((v) => v.value ? [v.value] : []))}
      keepOpen={true}
      virtualScroll={true}
      tokenLimit={2}
      disabled={disabled}
      statusType={loading ? 'loading' : 'finished'}
      filteringType={'manual'}
      onLoadItems={(e) => setFilterText(e.detail.filteringText)}
    />
  );
}

function filterOptions(filter: string, options: ReadonlyArray<MultiselectProps.Option | MultiselectProps.OptionGroup>): [ReadonlyArray<MultiselectProps.Option | MultiselectProps.OptionGroup>, boolean] {
  const matchByLabel: Array<MultiselectProps.Option | MultiselectProps.OptionGroup> = [];
  const matchByDescription: Array<MultiselectProps.Option | MultiselectProps.OptionGroup> = [];

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
        } satisfies MultiselectProps.OptionGroup;

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

function isOptionGroup(option: MultiselectProps.Option | MultiselectProps.OptionGroup): option is MultiselectProps.OptionGroup {
  return !!(option as MultiselectProps.OptionGroup).options;
}