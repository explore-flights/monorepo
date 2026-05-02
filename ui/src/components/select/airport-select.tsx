import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Button,
  Multiselect,
  MultiselectProps,
  Select,
  SelectProps,
} from '@cloudscape-design/components';
import { Airport, AirportId } from '../../lib/api/api.model';
import { useAirports } from '../util/state/data';
import { useDebounce } from '../util/state/use-debounce';
import { AirportSelectMapModal, AirportSelectMapModalProps } from './airport-select-map';
import classes from './airport-select.module.scss';

export interface AirportSelectProps {
  selectedAirportId: AirportId | null;
  onChange: (value: AirportId | null) => void;
  placeholder?: string;
  modalHeader?: React.ReactNode;
  disabled?: boolean;
}

export function AirportSelect({ selectedAirportId, onChange, placeholder, modalHeader, disabled }: AirportSelectProps) {
  const { data: { airports }, isLoading: loading } = useAirports();
  const [options, optionByAirportId] = useAirportOptions(airports);

  const [filterText, setFilterText] = useState('');
  const [filterLoading, displayOptions] = useFilteredOptions(useDebounce(filterText, 250), options);

  const selectedOption = useMemo(() => {
    if (!selectedAirportId) {
      return null;
    }

    return optionByAirportId[selectedAirportId] ?? null;
  }, [optionByAirportId, selectedAirportId]);

  const onAirportClick = useCallback((airportId: AirportId) => onChange(airportId === selectedAirportId ? null : airportId), [selectedAirportId, onChange]);

  return (
    <AirportSelectWithMapModal header={modalHeader} selectedAirportIds={selectedAirportId ? [selectedAirportId] : []} onAirportClick={onAirportClick}>
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
    </AirportSelectWithMapModal>
  );
}

export interface AirportMultiselectProps {
  selectedAirportIds: ReadonlyArray<AirportId>;
  onChange: (options: ReadonlyArray<AirportId>) => void;
  inlineTokens?: boolean;
  modalHeader?: React.ReactNode;
  disabled?: boolean;
}

export function AirportMultiselect({ selectedAirportIds, onChange, inlineTokens, modalHeader, disabled }: AirportMultiselectProps) {
  const { data: { airports }, isPending: loading } = useAirports();
  const [options, optionByAirportId] = useAirportOptions(airports);

  const [filterText, setFilterText] = useState('');
  const [filterLoading, displayOptions] = useFilteredOptions(useDebounce(filterText, 250), options);

  const selectedOptions = useMemo(() => selectedAirportIds.flatMap((airportId) => {
    const option = optionByAirportId[airportId];
    return option ? [option] : [];
  }), [optionByAirportId, selectedAirportIds]);

  const onAirportClick = useCallback((airportId: AirportId) => {
    if (selectedAirportIds.includes(airportId)) {
      onChange(selectedAirportIds.filter((id) => id !== airportId));
    } else {
      onChange([...selectedAirportIds, airportId]);
    }
  }, [selectedAirportIds, onChange]);

  return (
    <AirportSelectWithMapModal header={modalHeader} selectedAirportIds={selectedAirportIds} onAirportClick={onAirportClick}>
      <Multiselect
        options={displayOptions}
        selectedOptions={selectedOptions}
        onChange={(e) => onChange(e.detail.selectedOptions.flatMap((v) => v.value ? [v.value as AirportId] : []))}
        keepOpen={true}
        virtualScroll={true}
        inlineTokens={inlineTokens}
        tokenLimit={2}
        disabled={disabled}
        statusType={(loading || filterLoading) ? 'loading' : 'finished'}
        filteringType={'manual'}
        onLoadItems={(e) => setFilterText(e.detail.filteringText)}
      />
    </AirportSelectWithMapModal>
  );
}

function AirportSelectWithMapModal({ children, ...mapModalProps }: React.PropsWithChildren<Omit<AirportSelectMapModalProps, 'visible' | 'onDismiss'>>) {
  const [mapModalVisible, setMapModalVisible] = useState(false);

  return (
    <>
      <div className={classes['airport-select-container']}>
        <div className={classes['airport-select-item-grow']}>{children}</div>
        <div className={classes['airport-select-item-shrink']}>
          <Button iconName={'globe'} onClick={() => setMapModalVisible((prev) => !prev)} />
        </div>
      </div>

      <AirportSelectMapModal
        {...mapModalProps}
        visible={mapModalVisible}
        onDismiss={() => setMapModalVisible(false)}
      />
    </>
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
        label: airport.iataCode,
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

    options.sort((a, b) => {
      if (a.label && b.label) {
        return a.label.localeCompare(b.label);
      } else if (a.label) {
        return -1;
      } else if (b.label) {
        return 1;
      }

      return 0;
    });

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