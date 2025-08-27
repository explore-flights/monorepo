import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  AttributeEditor, Button,
  ColumnLayout,
  Container,
  ContentLayout, DateRangePicker, DateRangePickerProps,
  Form,
  FormField, Grid,
  Header, Select, SelectProps
} from '@cloudscape-design/components';
import {
  AircraftId,
  AirlineId,
  AirportId,
  QuerySchedulesRequest,
  QuerySchedulesResponseV2,
} from '../../lib/api/api.model';
import {
  useAircrafts,
  useQueryFlightSchedules
} from '../../components/util/state/data';
import { AirlineMultiselect } from '../../components/select/airline-multiselect';
import { AirportSelect } from '../../components/select/airport-select';
import { AircraftSelect } from '../../components/select/aircraft-select';
import { aircraftConfigurationVersionToName } from '../../lib/consts';
import { UseQueryResult } from '@tanstack/react-query';
import { ErrorNotificationContent, useAppControls } from '../../components/util/context/app-controls';
import { DateTime } from 'luxon';
import { SchedulesTable, ScheduleTableItem } from '../../components/schedules/schedules-table';
import {
  withAircraftConfigurationVersionFilter,
  withAircraftIdFilter,
  withDepartureAirportIdFilter,
  withDepartureDateFilter,
} from '../flight';

export function FlightSearch() {
  const [request, setRequest] = useState<QuerySchedulesRequest>({});
  const [activeRequest, setActiveRequest] = useState<QuerySchedulesRequest>({});
  const schedules = useQueryFlightSchedules(activeRequest);

  return (
    <ContentLayout header={<Header>Flight Search</Header>}>
      <ColumnLayout columns={1}>
        <Alert type={'warning'} header={'Work In Progress'}>
          This page is still work in progress. Please be aware that this might impact your experience with this tool.
        </Alert>

        <SearchForm
          actions={<Button loading={schedules.isLoading} formAction={'none'} onClick={() => setActiveRequest(request)}>Search</Button>}
          disabled={schedules.isLoading}
          request={request}
          onUpdate={setRequest}
        />

        <ResultTable title={'Result'} query={schedules} />
      </ColumnLayout>
    </ContentLayout>
  );
}

type Empty = [null, null];

function SearchForm({ actions, disabled, request, onUpdate }: { actions: React.ReactNode, disabled: boolean, request: QuerySchedulesRequest, onUpdate: React.Dispatch<React.SetStateAction<QuerySchedulesRequest>> }) {
  const departureRangeValue = useMemo<DateRangePickerProps.AbsoluteValue | null>(() => {
    if (!request.minDepartureTime || !request.maxDepartureTime) {
      return null;
    }

    return { type: 'absolute', startDate: request.minDepartureTime.toISO(), endDate: request.maxDepartureTime.toISO() };
  }, [request.minDepartureTime, request.maxDepartureTime]);

  return (
    <Container>
      <form onSubmit={(e) => e.preventDefault()}>
        <Form actions={actions}>
          <ColumnLayout columns={1}>
            <FormField label={'Airlines'}>
              <AirlineMultiselect
                selectedAirlineIds={request.airlineId ?? []}
                disabled={disabled}
                onChange={(v) => onUpdate((prev) => ({ ...prev, airlineId: v }))}
                placeholder={'Leave empty to search all airlines'}
              />
            </FormField>

            <FormField label={'Departure'}>
              <DateRangePicker
                value={departureRangeValue}
                onChange={(e) => {
                  const value = e.detail.value;
                  if (value === null || value.type !== 'absolute') {
                    onUpdate((prev) => ({
                      ...prev,
                      minDepartureTime: undefined,
                      maxDepartureTime: undefined,
                    }));
                    return;
                  }

                  const start = DateTime.fromISO(value.startDate, { setZone: true });
                  const end = DateTime.fromISO(value.endDate, { setZone: true });
                  if (!start.isValid || !end.isValid) {
                    return;
                  }

                  onUpdate((prev) => ({
                    ...prev,
                    minDepartureTime: start,
                    maxDepartureTime: end,
                  }))
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

                  return { valid: true };
                }}
                rangeSelectorMode={'absolute-only'}
                disabled={disabled}
                placeholder={'Filter flights by their departure time'}
              />
            </FormField>

            <FormField label={'Aircraft'}>
              <AircraftSelection
                selectedAirlineIds={request.airlineId ?? []}
                aircraftIds={request.aircraftId ?? []}
                aircraftConfigurationVersions={request.aircraftConfigurationVersion ?? []}
                aircraft={request.aircraft ?? []}
                onAircraftIdsChange={(v) => onUpdate((prev) => ({ ...prev, aircraftId: v }))}
                onAircraftConfigurationVersionChange={(v) => onUpdate((prev) => ({ ...prev, aircraftConfigurationVersion: v }))}
                onAircraftChange={(v) => onUpdate((prev) => ({ ...prev, aircraft: v }))}
                disabled={disabled}
              />
            </FormField>

            <FormField label={'Route'}>
              <RouteSelection
                departureAirports={request.departureAirportId ?? []}
                arrivalAirports={request.arrivalAirportId ?? []}
                routes={request.route ?? []}
                onDepartureAirportsChange={(v) => onUpdate((prev) => ({ ...prev, departureAirportId: v }))}
                onArrivalAirportsChange={(v) => onUpdate((prev) => ({ ...prev, arrivalAirportId: v }))}
                onRoutesChange={(v) => onUpdate((prev) => ({ ...prev, route: v }))}
                disabled={disabled}
              />
            </FormField>
          </ColumnLayout>
        </Form>
      </form>
    </Container>
  );
}

interface AircraftSelectionProps {
  selectedAirlineIds: ReadonlyArray<AirlineId>;
  aircraftIds: ReadonlyArray<AircraftId>;
  aircraftConfigurationVersions: ReadonlyArray<string>;
  aircraft: ReadonlyArray<[AircraftId, string]>;
  onAircraftIdsChange: (v: ReadonlyArray<AircraftId>) => void;
  onAircraftConfigurationVersionChange: (v: ReadonlyArray<string>) => void;
  onAircraftChange: (v: ReadonlyArray<[AircraftId, string]>) => void;
  disabled: boolean;
}

type AircraftType = [AircraftId, null];
type XAircraftConfigurationVersion = [null, string];
type AircraftAndConfiguration = [AircraftId, string];
type AircraftItem = Empty | AircraftType | XAircraftConfigurationVersion | AircraftAndConfiguration;

function AircraftSelection({ selectedAirlineIds, aircraftIds, aircraftConfigurationVersions, aircraft, onAircraftIdsChange, onAircraftConfigurationVersionChange, onAircraftChange, disabled }: AircraftSelectionProps) {
  const [aircraftItems, setAircraftItems] = useState<ReadonlyArray<AircraftItem>>((() => {
    const result: Array<AircraftItem> = [];

    for (const aircraftType of aircraftIds) {
      result.push([aircraftType, null]);
    }

    for (const aircraftConfigurationVersion of aircraftConfigurationVersions) {
      result.push([null, aircraftConfigurationVersion]);
    }

    for (const v of aircraft) {
      result.push(v);
    }

    if (result.length < 1) {
      result.push([null, null]);
    }

    return result;
  })());

  useEffect(() => {
    const aircraftIds: Array<AircraftId> = [];
    const aircraftConfigurationVersions: Array<string> = [];
    const aircraft: Array<[AircraftId, string]> = [];

    for (const item of aircraftItems) {
      if (item[0] && item[1]) {
        aircraft.push(item);
      } else if (item[0]) {
        aircraftIds.push(item[0]);
      } else if (item[1]) {
        aircraftConfigurationVersions.push(item[1]);
      }
    }

    onAircraftIdsChange(aircraftIds);
    onAircraftConfigurationVersionChange(aircraftConfigurationVersions);
    onAircraftChange(aircraft);
  }, [aircraftItems]);

  const updateAircraftItem = useCallback((itemIndex: number, updateIndex: number, value: string | null) => {
    setAircraftItems((prev) => {
      const updated = [...prev];
      updated[itemIndex][updateIndex] = value;
      return updated;
    });
  }, []);

  return (
    <AttributeEditor
      addButtonText={'Add'}
      onAddButtonClick={() => setAircraftItems((prev) => [...prev, [null, null]])}
      onRemoveButtonClick={(e) => setAircraftItems((prev) => prev.toSpliced(e.detail.itemIndex, 1))}
      items={aircraftItems}
      definition={[
        {
          label: 'Aircraft',
          control: (item, index) => (
            <Grid gridDefinition={[{ colspan: 10 }, { colspan: 2 }]}>
              <AircraftSelect
                selectedAircraftId={item[0]}
                disabled={disabled}
                onChange={(v) => updateAircraftItem(index, 0, v)}
                placeholder={'Any'}
              />
              <Button variant={'icon'} iconName={'remove'} disabled={item[0] === null} onClick={() => updateAircraftItem(index, 0, null)} />
            </Grid>
          ),
        },
        {
          label: 'Configuration',
          control: (item, index) => (
            <Grid gridDefinition={[{ colspan: 10 }, { colspan: 2 }]}>
              <AircraftConfigurationSelect
                selectedAirlineIds={selectedAirlineIds}
                selectedAircraftId={item[0]}
                selectedAircraftConfiguration={item[1]}
                onChange={(v) => updateAircraftItem(index, 1, v)}
                disabled={disabled}
              />
              <Button variant={'icon'} iconName={'remove'} disabled={item[1] === null} onClick={() => updateAircraftItem(index, 1, null)} />
            </Grid>
          ),
        },
      ]}
      disableAddButton={disabled}
      isItemRemovable={() => !disabled}
    />
  );
}

interface RouteSelectionProps {
  departureAirports: ReadonlyArray<AirportId>;
  arrivalAirports: ReadonlyArray<AirportId>;
  routes: ReadonlyArray<[AirportId, AirportId]>;
  onDepartureAirportsChange: (v: ReadonlyArray<AirportId>) => void;
  onArrivalAirportsChange: (v: ReadonlyArray<AirportId>) => void;
  onRoutesChange: (v: ReadonlyArray<[AirportId, AirportId]>) => void;
  disabled: boolean;
}

type DepartureAirport = [AirportId, null];
type ArrivalAirport = [null, AirportId];
type Route = [AirportId, AirportId];
type RouteItem = Empty | DepartureAirport | ArrivalAirport | Route;

function RouteSelection({ departureAirports, arrivalAirports, routes, onDepartureAirportsChange, onArrivalAirportsChange, onRoutesChange, disabled }: RouteSelectionProps) {
  const [routeItems, setRouteItems] = useState<ReadonlyArray<RouteItem>>((() => {
    const result: Array<RouteItem> = [];

    for (const airport of departureAirports) {
      result.push([airport, null]);
    }

    for (const airport of arrivalAirports) {
      result.push([null, airport]);
    }

    for (const route of routes) {
      result.push(route);
    }

    if (result.length < 1) {
      result.push([null, null]);
    }

    return result;
  })());

  useEffect(() => {
    const departureAirports: Array<AirportId> = [];
    const arrivalAirports: Array<AirportId> = [];
    const routes: Array<[AirportId, AirportId]> = [];

    for (const item of routeItems) {
      if (item[0] && item[1]) {
        routes.push(item);
      } else if (item[0]) {
        departureAirports.push(item[0]);
      } else if (item[1]) {
        arrivalAirports.push(item[1]);
      }
    }

    onDepartureAirportsChange(departureAirports);
    onArrivalAirportsChange(arrivalAirports);
    onRoutesChange(routes);
  }, [routeItems]);

  const updateRouteItem = useCallback((itemIndex: number, updateIndex: number, value: AirportId | null) => {
    setRouteItems((prev) => {
      const updated = [...prev];
      updated[itemIndex][updateIndex] = value;
      return updated;
    });
  }, []);

  return (
    <AttributeEditor
      addButtonText={'Add'}
      onAddButtonClick={() => setRouteItems((prev) => [...prev, [null, null]])}
      onRemoveButtonClick={(e) => setRouteItems((prev) => prev.toSpliced(e.detail.itemIndex, 1))}
      items={routeItems}
      definition={[
        {
          label: 'Departure Airport',
          control: (item, index) => (
            <Grid gridDefinition={[{ colspan: 10 }, { colspan: 2 }]}>
              <AirportSelect
                selectedAirportId={item[0]}
                disabled={disabled}
                onChange={(v) => updateRouteItem(index, 0, v)}
                placeholder={'Any'}
              />
              <Button variant={'icon'} iconName={'remove'} disabled={item[0] === null} onClick={() => updateRouteItem(index, 0, null)} />
            </Grid>
          ),
        },
        {
          label: 'Arrival Airport',
          control: (item, index) => (
            <Grid gridDefinition={[{ colspan: 10 }, { colspan: 2 }]}>
              <AirportSelect
                selectedAirportId={item[1]}
                disabled={disabled}
                onChange={(v) => updateRouteItem(index, 1, v)}
                placeholder={'Any'}
              />
              <Button variant={'icon'} iconName={'remove'} disabled={item[1] === null} onClick={() => updateRouteItem(index, 1, null)} />
            </Grid>
          ),
        },
      ]}
      disableAddButton={disabled}
      isItemRemovable={() => !disabled}
    />
  );
}

interface AircraftConfigurationSelectProps {
  selectedAirlineIds: ReadonlyArray<AirlineId>;
  selectedAircraftId: AircraftId | null;
  selectedAircraftConfiguration: string | null;
  onChange: (v: string | null) => void;
  disabled: boolean;
}

function AircraftConfigurationSelect({ selectedAirlineIds, selectedAircraftId, selectedAircraftConfiguration, onChange, disabled }: AircraftConfigurationSelectProps) {
  const { data, isLoading: loading } = useAircrafts();
  const [options, optionByConfiguration, validAircraftIdsByConfiguration] = useMemo(() => {
    const options: Array<SelectProps.Option> = [];
    const optionByConfiguration: Record<string, SelectProps.Option> = {};
    const validAircraftIdsByConfiguration: Record<string, Array<AircraftId>> = {};

    for (const ac of data.aircraft) {
      for (const [airlineId, configurations] of Object.entries(ac.configurations)) {
        if (selectedAirlineIds.length < 1 || selectedAirlineIds.includes(airlineId as AirlineId)) {
          for (const configuration of configurations) {
            if ((!selectedAircraftId || selectedAircraftId === ac.id) && !optionByConfiguration[configuration]) {
              const configName = aircraftConfigurationVersionToName(configuration) ?? configuration;

              const option = {
                label: configName,
                value: configuration,
              } satisfies SelectProps.Option;

              options.push(option);
              optionByConfiguration[configuration] = option;
            }

            let validAircraft = validAircraftIdsByConfiguration[configuration];
            if (!validAircraft) {
              validAircraft = [];
              validAircraftIdsByConfiguration[configuration] = validAircraft;
            }

            if (!validAircraft.includes(ac.id)) {
              validAircraft.push(ac.id);
            }
          }
        }
      }
    }

    return [options, optionByConfiguration, validAircraftIdsByConfiguration];
  }, [data.aircraft, selectedAirlineIds, selectedAircraftId]);

  const selectedOption = useMemo(() => {
    if (!selectedAircraftConfiguration) {
      return null;
    }

    return optionByConfiguration[selectedAircraftConfiguration];
  }, [optionByConfiguration, selectedAircraftConfiguration]);

  useEffect(() => {
    if (!selectedAircraftId || !selectedAircraftConfiguration) {
      return;
    }

    const validAircraft = validAircraftIdsByConfiguration[selectedAircraftConfiguration];
    if (!(validAircraft ?? []).includes(selectedAircraftId)) {
      onChange(null);
    }
  }, [selectedAircraftId, selectedAircraftConfiguration, validAircraftIdsByConfiguration]);

  return (
    <Select
      options={options}
      selectedOption={selectedOption}
      onChange={(e) => onChange(e.detail.selectedOption?.value ?? null)}
      virtualScroll={true}
      disabled={disabled}
      statusType={loading ? 'loading' : 'finished'}
      filteringType={'auto'}
      placeholder={'Any'}
    />
  );
}

function ResultTable({ title, query }: { title: string, query: UseQueryResult<QuerySchedulesResponseV2, Error> }) {
  const { notification } = useAppControls();

  useEffect(() => {
    if (query.status === 'error') {
      notification.addOnce({
        type: 'error',
        header: `Failed to load '${title}' Routes`,
        content: <ErrorNotificationContent error={query.error} />,
        dismissible: true,
      });
    }
  }, [query.status, title]);

  return (
    <SchedulesTable
      title={title}
      result={query.data}
      loading={query.isLoading}
      flightLinkQuery={useCallback((v: ScheduleTableItem) => {
        let query = new URLSearchParams();

        const minDepartureDate = DateTime.fromISO(v.operatingRange[0]);
        const maxDepartureDate = DateTime.fromISO(v.operatingRange[1]);

        if (minDepartureDate.isValid) {
          query = withDepartureDateFilter(query, minDepartureDate, '>=');
        }

        if (maxDepartureDate.isValid) {
          query = withDepartureDateFilter(query, maxDepartureDate, '<=');
        }

        query = withDepartureAirportIdFilter(query, v.departureAirport.id);

        if (v.type === 'child') {
          query = withAircraftIdFilter(query, v.aircraft.id);
          query = withAircraftConfigurationVersionFilter(query, v.aircraftConfigurationVersion);
        }

        return query;
      }, [])}
    />
  );
}
