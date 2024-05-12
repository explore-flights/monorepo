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
  Grid,
  Slider, Toggle
} from '@cloudscape-design/components';
import { AirportMultiselect } from '../select/airport-multiselect';
import { AircraftMultiselect } from '../select/aircraft-multiselect';

export interface ConnectionSearchParams {
  readonly origins: ReadonlyArray<string>;
  readonly destinations: ReadonlyArray<string>;
  readonly minDeparture: DateTime<true>;
  readonly maxDeparture: DateTime<true>;
  readonly maxFlights: number;
  readonly minLayover: Duration<true>;
  readonly maxLayover: Duration<true>;
  readonly maxDuration: Duration<true>;
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
  isDisabled: boolean;
  onSearch: (v: ConnectionSearchParams) => void;
}

export function ConnectionSearchForm({ airports, airportsLoading, aircraft, aircraftLoading, isDisabled, onSearch }: ConnectionSearchFormProps) {
  const [origins, setOrigins] = useState<ReadonlyArray<string>>([]);
  const [destinations, setDestinations] = useState<ReadonlyArray<string>>([]);
  const [departure, setDeparture] = useState<[DateTime<true>, DateTime<true>] | null>([
    DateTime.now().startOf('day'),
    DateTime.now().endOf('day'),
  ]);
  const [maxFlights, setMaxFlights] = useState(2);
  const [minLayover, setMinLayover] = useState(Duration.fromMillis(1000*60*60));
  const [maxLayover, setMaxLayover] = useState(Duration.fromMillis(1000*60*60*6));
  const [maxDuration, setMaxDuration] = useState(Duration.fromMillis(1000*60*60*26));
  const [includeAircraftEnabled, setIncludeAircraftEnabled] = useState(false);
  const [includeAircraft, setIncludeAircraft] = useState<ReadonlyArray<string>>([]);
  const [excludeAircraftEnabled, setExcludeAircraftEnabled] = useState(false);
  const [excludeAircraft, setExcludeAircraft] = useState<ReadonlyArray<string>>([]);
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

    if (departure === null) {
      e.departure = 'Required';
      anyError = true;
    } else {
      const [start, end] = departure;
      const duration = end.diff(start).plus(maxDuration);

      if (duration.toMillis() > 1000*60*60*24*14) {
        e.departure = 'The duration from start to end + Max Duration must not exceed 14 days';
        e.maxDuration = 'The duration from start to end + Max Duration must not exceed 14 days';
        anyError = true;
      }
    }

    if (minLayover.toMillis() > maxLayover.toMillis()) {
      e.minLayover = 'Must not be greater than Max Layover';
      e.maxLayover = 'Must not be smaller than Min Layover';
      anyError = true;
    }

    return anyError ? e : null;
  }, [origins, destinations, departure, maxFlights, minLayover, maxLayover, maxDuration]);

  function onClickSearch() {
    if (departure === null) {
      return;
    }

    onSearch({
      origins: origins,
      destinations: destinations,
      minDeparture: departure[0],
      maxDeparture: departure[1],
      maxFlights: maxFlights,
      minLayover: minLayover,
      maxLayover: maxLayover,
      maxDuration: maxDuration,
      includeAircraft: includeAircraftEnabled ? includeAircraft : undefined,
      excludeAircraft: excludeAircraftEnabled ? excludeAircraft : undefined,
    });
  }

  return (
    <Form variant={'embedded'} actions={<Button onClick={onClickSearch} loading={isDisabled} disabled={errors !== null}>Search</Button>}>
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
            <AirportMultiselect airports={airports} loading={airportsLoading} disabled={isDisabled} onChange={setOrigins} />
          </FormField>

          <FormField label={'Destination'} errorText={errors?.destinations}>
            <AirportMultiselect airports={airports} loading={airportsLoading} disabled={isDisabled} onChange={setDestinations} />
          </FormField>

          <FormField label={'Departure'} errorText={errors?.departure}>
            <DateRangePicker
              value={departure !== null ? { type: 'absolute', startDate: departure[0].toISO(), endDate: departure[1].toISO() } : null}
              onChange={(e) => {
                const value = e.detail.value;
                if (value === null || value.type !== 'absolute') {
                  setDeparture(null);
                  return;
                }

                const start = DateTime.fromISO(value.startDate, { setZone: true });
                const end = DateTime.fromISO(value.endDate, { setZone: true });
                if (!start.isValid || !end.isValid) {
                  setDeparture(null);
                  return;
                }

                setDeparture([start, end]);
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
              disabled={isDisabled}
            />
          </FormField>

          <FormField label={'Max Flights'} errorText={errors?.maxFlights}>
            <Slider
              min={1}
              max={4}
              referenceValues={[2, 3]}
              value={maxFlights}
              onChange={(e) => setMaxFlights(e.detail.value)}
              disabled={isDisabled}
            />
          </FormField>

          <FormField label={'Min Layover'} errorText={errors?.minLayover}>
            <Slider
              min={1000*60*5}
              max={1000*60*60*24}
              step={1000*60*5}
              valueFormatter={(v) => Duration.fromMillis(v).rescale().toHuman({ unitDisplay: 'short' })}
              value={minLayover.toMillis()}
              onChange={(e) => setMinLayover(Duration.fromMillis(e.detail.value))}
              disabled={isDisabled}
            />
          </FormField>

          <FormField label={'Max Layover'} errorText={errors?.maxLayover}>
            <Slider
              min={1000*60*5}
              max={1000*60*60*24}
              step={1000*60*5}
              valueFormatter={(v) => Duration.fromMillis(v).rescale().toHuman({ unitDisplay: 'short' })}
              value={maxLayover.toMillis()}
              onChange={(e) => setMaxLayover(Duration.fromMillis(e.detail.value))}
              disabled={isDisabled}
            />
          </FormField>

          <FormField label={'Max Duration'} errorText={errors?.maxDuration}>
            <Slider
              min={1000*60*5}
              max={1000*60*60*24*3}
              step={1000*60*5}
              valueFormatter={(v) => Duration.fromMillis(v).rescale().toHuman({ unitDisplay: 'short' })}
              value={maxDuration.toMillis()}
              onChange={(e) => setMaxDuration(Duration.fromMillis(e.detail.value))}
              disabled={isDisabled}
            />
          </FormField>
        </Grid>

        <ExpandableSection headerText={'Additional options'} variant={'footer'}>
          <ColumnLayout columns={2}>
            <FormField label={<Toggle checked={includeAircraftEnabled} onChange={(e) => setIncludeAircraftEnabled(e.detail.checked)}><Box variant={'awsui-key-label'}>Include Aircraft</Box></Toggle>}>
              <AircraftMultiselect
                aircraft={aircraft}
                loading={aircraftLoading}
                disabled={isDisabled || !includeAircraftEnabled}
                onChange={setIncludeAircraft}
              />
            </FormField>

            <FormField label={<Toggle checked={excludeAircraftEnabled} onChange={(e) => setExcludeAircraftEnabled(e.detail.checked)}><Box variant={'awsui-key-label'}>Exclude Aircraft</Box></Toggle>}>
              <AircraftMultiselect
                aircraft={aircraft}
                loading={aircraftLoading}
                disabled={isDisabled || !excludeAircraftEnabled}
                onChange={setExcludeAircraft}
              />
            </FormField>
          </ColumnLayout>
        </ExpandableSection>
      </ColumnLayout>
    </Form>
  );
}