import { DateTime, Duration } from 'luxon';
import { Aircraft, Airports } from '../../lib/api/api.model';
import React, { useMemo, useState } from 'react';
import {
  Box,
  Button,
  ColumnLayout,
  DateRangePicker,
  ExpandableSection,
  Form,
  FormField,
  Grid, Header,
  Slider, SpaceBetween, Toggle
} from '@cloudscape-design/components';
import { AirportMultiselect } from '../select/airport-multiselect';
import { AircraftMultiselect } from '../select/aircraft-multiselect';
import { ValueMultilineEditor } from './value-multiline-editor';

export interface ConnectionSearchParams {
  readonly origins: ReadonlyArray<string>;
  readonly destinations: ReadonlyArray<string>;
  readonly minDeparture: DateTime<true>;
  readonly maxDeparture: DateTime<true>;
  readonly maxFlights: number;
  readonly minLayover: Duration<true>;
  readonly maxLayover: Duration<true>;
  readonly maxDuration: Duration<true>;
  readonly includeAirport?: ReadonlyArray<string>;
  readonly excludeAirport?: ReadonlyArray<string>;
  readonly includeFlightNumber?: ReadonlyArray<string>;
  readonly excludeFlightNumber?: ReadonlyArray<string>;
  readonly includeAircraft?: ReadonlyArray<string>;
  readonly excludeAircraft?: ReadonlyArray<string>;
}

interface ConnectionSearchFormErrors {
  origins?: string;
  destinations?: string;
  departure?: string;
  maxFlights?: string;
  minLayover?: string;
  maxLayover?: string;
  maxDuration?: string;
}

export interface ConnectionSearchFormProps {
  airports: Airports;
  airportsLoading: boolean;
  aircraft: ReadonlyArray<Aircraft>;
  aircraftLoading: boolean;
  isLoading: boolean;
  params: ConnectionSearchParams;
  onChange: React.Dispatch<React.SetStateAction<ConnectionSearchParams>>;
  onSearch: () => void;
  onShare: () => void;
}

export function ConnectionSearchForm({ airports, airportsLoading, aircraft, aircraftLoading, isLoading, params, onChange, onSearch, onShare }: ConnectionSearchFormProps) {
  const {
    origins,
    destinations,
    minDeparture,
    maxDeparture,
    maxFlights,
    minLayover,
    maxLayover,
    maxDuration,
    includeAirport,
    excludeAirport,
    includeFlightNumber,
    excludeFlightNumber,
    includeAircraft,
    excludeAircraft,
  } = params;

  const errors = useMemo<ConnectionSearchFormErrors | null>(() => {
    const e: ConnectionSearchFormErrors = {};
    let anyError = false;

    if (origins.length < 1) {
      e.origins = 'At least one required';
      anyError = true;
    } else if (origins.length > 10) {
      e.origins = 'At most 10 allowed';
      anyError = true;
    }

    if (destinations.length < 1) {
      e.destinations = 'At least one required';
      anyError = true;
    } else if (destinations.length > 10) {
      e.destinations = 'At most 10 allowed';
      anyError = true;
    }

    const duration = maxDeparture.diff(minDeparture).plus(maxDuration);
    if (duration.toMillis() > 1000*60*60*24*14) {
      e.departure = 'The duration from start to end + Max Duration must not exceed 14 days';
      e.maxDuration = 'The duration from start to end + Max Duration must not exceed 14 days';
      anyError = true;
    }

    if (minLayover.toMillis() > maxLayover.toMillis()) {
      e.minLayover = 'Must not be greater than Max Layover';
      e.maxLayover = 'Must not be smaller than Min Layover';
      anyError = true;
    }

    return anyError ? e : null;
  }, [origins, destinations, minDeparture, maxDeparture, minLayover, maxLayover, maxDuration]);

  return (
    <Form
      variant={'embedded'}
      actions={
      <SpaceBetween size={'xs'} direction={'horizontal'}>
        <Button onClick={onShare} loading={isLoading} disabled={errors !== null} iconName={'share'}>Share</Button>
        <Button onClick={onSearch} loading={isLoading} disabled={errors !== null} iconName={'search'}>Search</Button>
      </SpaceBetween>
      }
    >
      <ColumnLayout columns={1}>
        <Grid
          gridDefinition={[
            { colspan: { default: 12, xs: 6, m: 3 } },
            { colspan: { default: 12, xs: 6, m: 3 } },
            { colspan: { default: 12, xs: 12, m: 6 } },
            { colspan: { default: 12, xs: 6, m: 3 } },
            { colspan: { default: 12, xs: 6, m: 3 } },
            { colspan: { default: 12, xs: 6, m: 3 } },
            { colspan: { default: 12, xs: 6, m: 3 } },
          ]}
        >
          <FormField label={'Origin'} errorText={errors?.origins}>
            <AirportMultiselect
              airports={airports}
              selectedAirportCodes={origins}
              loading={airportsLoading}
              disabled={isLoading}
              onChange={(v) => onChange((prev) => ({ ...prev, origins: v }))}
            />
          </FormField>

          <FormField label={'Destination'} errorText={errors?.destinations}>
            <AirportMultiselect
              airports={airports}
              selectedAirportCodes={destinations}
              loading={airportsLoading}
              disabled={isLoading}
              onChange={(v) => onChange((prev) => ({ ...prev, destinations: v }))}
            />
          </FormField>

          <FormField label={'Departure'} errorText={errors?.departure}>
            <DateRangePicker
              value={{ type: 'absolute', startDate: minDeparture.toISO(), endDate: maxDeparture.toISO() }}
              onChange={(e) => {
                const value = e.detail.value;
                if (value === null || value.type !== 'absolute') {
                  return;
                }

                const start = DateTime.fromISO(value.startDate, { setZone: true });
                const end = DateTime.fromISO(value.endDate, { setZone: true });
                if (!start.isValid || !end.isValid) {
                  return;
                }

                onChange((prev) => ({
                  ...prev,
                  minDeparture: start,
                  maxDeparture: end,
                }));
              }}
              relativeOptions={[]}
              isValidRange={(v) => {
                if (v === null || v.type !== 'absolute') {
                  return {
                    valid: false,
                    errorMessage: 'Absolute range is required',
                  };
                }

                const start = DateTime.fromISO(v.startDate, { setZone: true });
                const end = DateTime.fromISO(v.endDate, { setZone: true });
                if (!start.isValid || !end.isValid) {
                  return {
                    valid: false,
                    errorMessage: 'Invalid dates',
                  };
                }

                if (end.diff(start).toMillis() > 1000*60*60*24*14) {
                  return {
                    valid: false,
                    errorMessage: 'At most 14 days can be searched',
                  };
                }

                return { valid: true };
              }}
              rangeSelectorMode={'absolute-only'}
              disabled={isLoading}
            />
          </FormField>

          <FormField label={'Max Flights'} errorText={errors?.maxFlights}>
            <Slider
              min={1}
              max={4}
              referenceValues={[2, 3]}
              value={maxFlights}
              onChange={(e) => onChange((prev) => ({ ...prev, maxFlights: e.detail.value }))}
              disabled={isLoading}
            />
          </FormField>

          <FormField label={'Min Layover'} errorText={errors?.minLayover}>
            <Slider
              min={1000*60*5}
              max={1000*60*60*24}
              step={1000*60*5}
              valueFormatter={(v) => Duration.fromMillis(v).rescale().toHuman({ unitDisplay: 'short' })}
              value={minLayover.toMillis()}
              onChange={(e) => onChange((prev) => ({ ...prev, minLayover: Duration.fromMillis(e.detail.value) }))}
              disabled={isLoading}
            />
          </FormField>

          <FormField label={'Max Layover'} errorText={errors?.maxLayover}>
            <Slider
              min={1000*60*5}
              max={1000*60*60*24}
              step={1000*60*5}
              valueFormatter={(v) => Duration.fromMillis(v).rescale().toHuman({ unitDisplay: 'short' })}
              value={maxLayover.toMillis()}
              onChange={(e) => onChange((prev) => ({ ...prev, maxLayover: Duration.fromMillis(e.detail.value) }))}
              disabled={isLoading}
            />
          </FormField>

          <FormField label={'Max Duration'} errorText={errors?.maxDuration}>
            <Slider
              min={1000*60*5}
              max={1000*60*60*24*3}
              step={1000*60*5}
              valueFormatter={(v) => Duration.fromMillis(v).rescale().toHuman({ unitDisplay: 'short' })}
              value={maxDuration.toMillis()}
              onChange={(e) => onChange((prev) => ({ ...prev, maxDuration: Duration.fromMillis(e.detail.value) }))}
              disabled={isLoading}
            />
          </FormField>
        </Grid>

        <ExpandableSection headerText={'Advanced options'} variant={'footer'}>
          <ColumnLayout columns={2}>
            <Header variant={'h3'} description={'Apply inclusions on whole connections. The result will only contain connections for which every given inclusion is matched by at least one flight.'}>Include</Header>
            <Header variant={'h3'} description={'Apply exclusions on flights taken into consideration. Exclusions will result in no flight of the result matching any of the supplied values.'}>Exclude</Header>

            <FormField label={<Toggle checked={includeAirport !== undefined} onChange={(e) => onChange((prev) => ({ ...prev, includeAirport: e.detail.checked ? [] : undefined}))}><Box variant={'awsui-key-label'}>Include Airport</Box></Toggle>}>
              <AirportMultiselectOrEditor
                airports={airports}
                selectedAirportCodes={includeAirport ?? []}
                setSelectedAirportCodes={(v) => onChange((prev) => ({ ...prev, includeAirport: v }))}
                loading={airportsLoading}
                disabled={isLoading || includeAirport === undefined}
              />
            </FormField>

            <FormField label={<Toggle checked={excludeAirport !== undefined} onChange={(e) => onChange((prev) => ({ ...prev, excludeAirport: e.detail.checked ? [] : undefined}))}><Box variant={'awsui-key-label'}>Exclude Airport</Box></Toggle>}>
              <AirportMultiselectOrEditor
                airports={airports}
                selectedAirportCodes={excludeAirport ?? []}
                setSelectedAirportCodes={(v) => onChange((prev) => ({ ...prev, excludeAirport: v }))}
                loading={airportsLoading}
                disabled={isLoading || excludeAirport === undefined}
              />
            </FormField>

            <FormField label={<Toggle checked={includeFlightNumber !== undefined} onChange={(e) => onChange((prev) => ({ ...prev, includeFlightNumber: e.detail.checked ? [] : undefined}))}><Box variant={'awsui-key-label'}>Include Flightnumber</Box></Toggle>}>
              <ValueMultilineEditor
                values={includeFlightNumber ?? []}
                setValues={(v) => onChange((prev) => ({ ...prev, includeFlightNumber: v }))}
                disabled={isLoading || includeFlightNumber === undefined}
                placeholder={'SX???*'}
              />
            </FormField>

            <FormField label={<Toggle checked={excludeFlightNumber !== undefined} onChange={(e) => onChange((prev) => ({ ...prev, excludeFlightNumber: e.detail.checked ? [] : undefined}))}><Box variant={'awsui-key-label'}>Exclude Flightnumber</Box></Toggle>}>
              <ValueMultilineEditor
                values={excludeFlightNumber ?? []}
                setValues={(v) => onChange((prev) => ({ ...prev, excludeFlightNumber: v }))}
                disabled={isLoading || excludeFlightNumber === undefined}
                placeholder={'SX???*'}
              />
            </FormField>

            <FormField label={<Toggle checked={includeAircraft !== undefined} onChange={(e) => onChange((prev) => ({ ...prev, includeAircraft: e.detail.checked ? [] : undefined}))}><Box variant={'awsui-key-label'}>Include Aircraft</Box></Toggle>}>
              <AircraftMultiselectOrEditor
                aircraft={aircraft}
                selectedAircraftCodes={includeAircraft ?? []}
                setSelectedAircraftCodes={(v) => onChange((prev) => ({ ...prev, includeAircraft: v }))}
                loading={aircraftLoading}
                disabled={isLoading || includeAircraft === undefined}
              />
            </FormField>

            <FormField label={<Toggle checked={excludeAircraft !== undefined} onChange={(e) => onChange((prev) => ({ ...prev, excludeAircraft: e.detail.checked ? [] : undefined}))}><Box variant={'awsui-key-label'}>Exclude Aircraft</Box></Toggle>}>
              <AircraftMultiselectOrEditor
                aircraft={aircraft}
                selectedAircraftCodes={excludeAircraft ?? []}
                setSelectedAircraftCodes={(v) => onChange((prev) => ({ ...prev, excludeAircraft: v }))}
                loading={aircraftLoading}
                disabled={isLoading || excludeAircraft === undefined}
              />
            </FormField>
          </ColumnLayout>
        </ExpandableSection>
      </ColumnLayout>
    </Form>
  );
}

interface AirportMultiselectOrEditorProps {
  airports: Airports;
  selectedAirportCodes: ReadonlyArray<string>;
  setSelectedAirportCodes: (v: ReadonlyArray<string>) => void;
  loading: boolean;
  disabled: boolean;
}

function AirportMultiselectOrEditor({ airports, selectedAirportCodes, setSelectedAirportCodes, loading, disabled }: AirportMultiselectOrEditorProps) {
  return (
    <StandardOrMultilineEditor values={selectedAirportCodes} setValues={setSelectedAirportCodes} disabled={disabled}>
      <AirportMultiselect
        airports={airports}
        selectedAirportCodes={selectedAirportCodes}
        loading={loading}
        disabled={disabled}
        onChange={setSelectedAirportCodes}
      />
    </StandardOrMultilineEditor>
  );
}

interface AircraftMultiselectOrEditorProps {
  aircraft: ReadonlyArray<Aircraft>;
  selectedAircraftCodes: ReadonlyArray<string>;
  setSelectedAircraftCodes: (v: ReadonlyArray<string>) => void;
  loading: boolean;
  disabled: boolean;
}

function AircraftMultiselectOrEditor({ aircraft, selectedAircraftCodes, setSelectedAircraftCodes, loading, disabled }: AircraftMultiselectOrEditorProps) {
  return (
    <StandardOrMultilineEditor values={selectedAircraftCodes} setValues={setSelectedAircraftCodes} disabled={disabled}>
      <AircraftMultiselect
        aircraft={aircraft}
        selectedAircraftCodes={selectedAircraftCodes}
        loading={loading}
        disabled={disabled}
        onChange={setSelectedAircraftCodes}
      />
    </StandardOrMultilineEditor>
  );
}

interface StandardOrMultilineEditorProps {
  values: ReadonlyArray<string>;
  setValues: (v: ReadonlyArray<string>) => void;
  disabled: boolean;
}

function StandardOrMultilineEditor({ values, setValues, disabled, children }: React.PropsWithChildren<StandardOrMultilineEditorProps>) {
  const [useEditor, setUseEditor] = useState(false);
  const editor = (
    <ValueMultilineEditor
      values={values}
      setValues={setValues}
      disabled={disabled}
      placeholder={'7??'}
    />
  );

  return (
    <ColumnLayout columns={1}>
      <Toggle checked={useEditor} disabled={disabled} onChange={(e) => setUseEditor(e.detail.checked)}>Raw Edit</Toggle>
      {useEditor ? editor : children}
    </ColumnLayout>
  );
}