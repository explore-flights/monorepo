import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  AttributeEditor, Box,
  Button,
  ColumnLayout,
  Container,
  ContentLayout, DateRangePicker, DateRangePickerProps,
  Form,
  FormField, Grid,
  Header, Pagination, Select, SelectProps, Table
} from '@cloudscape-design/components';
import { Aircraft, QueryScheduleResponse, QuerySchedulesRequest } from '../../lib/api/api.model';
import { useAircraft, useAirlines, useAirports, useQueryFlightSchedules } from '../../components/util/state/data';
import { AirlineMultiselect } from '../../components/select/airline-multiselect';
import { AirportSelect } from '../../components/select/airport-select';
import { AircraftSelect } from '../../components/select/aircraft-select';
import { AircraftConfigurationVersion } from '../../lib/consts';
import { UseQueryResult } from '@tanstack/react-query';
import { ErrorNotificationContent, useAppControls } from '../../components/util/context/app-controls';
import { DateTime } from 'luxon';
import { useCollection } from '@cloudscape-design/collection-hooks';
import { FlightLink } from '../../components/common/flight-link';

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
  const airlines = useAirlines();

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
                airlines={airlines.data}
                selectedAirlines={request.airline ?? []}
                loading={airlines.isLoading}
                disabled={disabled}
                onChange={(v) => onUpdate((prev) => ({ ...prev, airline: v }))}
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
                aircraftTypes={request.aircraftType ?? []}
                aircraftConfigurationVersions={request.aircraftConfigurationVersion ?? []}
                aircraft={request.aircraft ?? []}
                onAircraftTypesChange={(v) => onUpdate((prev) => ({ ...prev, aircraftType: v }))}
                onAircraftConfigurationVersionChange={(v) => onUpdate((prev) => ({ ...prev, aircraftConfigurationVersion: v }))}
                onAircraftChange={(v) => onUpdate((prev) => ({ ...prev, aircraft: v }))}
                disabled={disabled}
              />
            </FormField>

            <FormField label={'Route'}>
              <RouteSelection
                departureAirports={request.departureAirport ?? []}
                arrivalAirports={request.arrivalAirport ?? []}
                routes={request.route ?? []}
                onDepartureAirportsChange={(v) => onUpdate((prev) => ({ ...prev, departureAirport: v }))}
                onArrivalAirportsChange={(v) => onUpdate((prev) => ({ ...prev, arrivalAirport: v }))}
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
  aircraftTypes: ReadonlyArray<string>;
  aircraftConfigurationVersions: ReadonlyArray<string>;
  aircraft: ReadonlyArray<[string, string]>;
  onAircraftTypesChange: (v: ReadonlyArray<string>) => void;
  onAircraftConfigurationVersionChange: (v: ReadonlyArray<string>) => void;
  onAircraftChange: (v: ReadonlyArray<[string, string]>) => void;
  disabled: boolean;
}

type AircraftType = [string, null];
type XAircraftConfigurationVersion = [null, string];
type AircraftAndConfiguration = [string, string];
type AircraftItem = Empty | AircraftType | XAircraftConfigurationVersion | AircraftAndConfiguration;

function AircraftSelection({ aircraftTypes, aircraftConfigurationVersions, aircraft, onAircraftTypesChange, onAircraftConfigurationVersionChange, onAircraftChange, disabled }: AircraftSelectionProps) {
  const aircraftQuery = useAircraft();

  const [aircraftItems, setAircraftItems] = useState<ReadonlyArray<AircraftItem>>((() => {
    const result: Array<AircraftItem> = [];

    for (const aircraftType of aircraftTypes) {
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
    const aircraftTypes: Array<string> = [];
    const aircraftConfigurationVersions: Array<string> = [];
    const aircraft: Array<[string, string]> = [];

    for (const item of aircraftItems) {
      if (item[0] && item[1]) {
        aircraft.push(item);
      } else if (item[0]) {
        aircraftTypes.push(item[0]);
      } else if (item[1]) {
        aircraftConfigurationVersions.push(item[1]);
      }
    }

    onAircraftTypesChange(aircraftTypes);
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
                aircraft={aircraftQuery.data}
                selectedAircraftCode={item[0]}
                loading={aircraftQuery.isLoading}
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
                aircraft={aircraftQuery.data}
                selectedAircraftCode={item[0]}
                selectedAircraftConfiguration={item[1]}
                onChange={(v) => updateAircraftItem(index, 1, v)}
                loading={aircraftQuery.isLoading}
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
  departureAirports: ReadonlyArray<string>;
  arrivalAirports: ReadonlyArray<string>;
  routes: ReadonlyArray<[string, string]>;
  onDepartureAirportsChange: (v: ReadonlyArray<string>) => void;
  onArrivalAirportsChange: (v: ReadonlyArray<string>) => void;
  onRoutesChange: (v: ReadonlyArray<[string, string]>) => void;
  disabled: boolean;
}

type DepartureAirport = [string, null];
type ArrivalAirport = [null, string];
type Route = [string, string];
type RouteItem = Empty | DepartureAirport | ArrivalAirport | Route;

function RouteSelection({ departureAirports, arrivalAirports, routes, onDepartureAirportsChange, onArrivalAirportsChange, onRoutesChange, disabled }: RouteSelectionProps) {
  const airports = useAirports();

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
    const departureAirports: Array<string> = [];
    const arrivalAirports: Array<string> = [];
    const routes: Array<[string, string]> = [];

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

  const updateRouteItem = useCallback((itemIndex: number, updateIndex: number, value: string | null) => {
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
                airports={airports.data}
                selectedAirportCode={item[0]}
                loading={airports.isLoading}
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
                airports={airports.data}
                selectedAirportCode={item[1]}
                loading={airports.isLoading}
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
  aircraft: ReadonlyArray<Aircraft>;
  selectedAircraftCode: string | null;
  selectedAircraftConfiguration: string | null;
  onChange: (v: string | null) => void;
  loading: boolean;
  disabled: boolean;
}

function AircraftConfigurationSelect({ aircraft, selectedAircraftCode, selectedAircraftConfiguration, onChange, loading, disabled }: AircraftConfigurationSelectProps) {
  const [options, optionByConfiguration, validAircraftByConfiguration] = useMemo(() => {
    const options: Array<SelectProps.Option> = [];
    const optionByConfiguration: Record<string, SelectProps.Option> = {};
    const validAircraftByConfiguration: Record<string, Array<string>> = {};

    for (const a of aircraft) {
      for (const configuration of a.configurations) {
        if ((!selectedAircraftCode || selectedAircraftCode === a.code) && !optionByConfiguration[configuration]) {
          const configName = aircraftConfigurationVersionToName(configuration) ?? configuration;

          const option = {
            label: configName,
            value: configuration,
          } satisfies SelectProps.Option;

          options.push(option);
          optionByConfiguration[configuration] = option;
        }

        let validAircraft = validAircraftByConfiguration[configuration];
        if (!validAircraft) {
          validAircraft = [];
          validAircraftByConfiguration[configuration] = validAircraft;
        }

        if (!validAircraft.includes(a.code)) {
          validAircraft.push(a.code);
        }
      }
    }

    return [options, optionByConfiguration, validAircraftByConfiguration];
  }, [aircraft, selectedAircraftCode]);

  const selectedOption = useMemo(() => {
    if (!selectedAircraftConfiguration) {
      return null;
    }

    return optionByConfiguration[selectedAircraftConfiguration];
  }, [optionByConfiguration, selectedAircraftConfiguration]);

  useEffect(() => {
    if (!selectedAircraftCode || !selectedAircraftConfiguration) {
      return;
    }

    const validAircraft = validAircraftByConfiguration[selectedAircraftConfiguration];
    if (!(validAircraft ?? []).includes(selectedAircraftCode)) {
      onChange(null);
    }
  }, [selectedAircraftCode, selectedAircraftConfiguration, validAircraftByConfiguration]);

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

interface TableItem {
  flightNumber: string;
  departureAirport: string;
  arrivalAirport: string;
  rangeStart: DateTime<true>;
  rangeEnd: DateTime<true>;
}

function ResultTable({ title, query }: { title: string, query: UseQueryResult<QueryScheduleResponse, Error> }) {
  const { notification } = useAppControls();
  const rawItems = useMemo(() => {
    const result: Array<TableItem> = [];
    if (query.data) {
      for (const [flightNumber, routeAndRanges] of Object.entries(query.data)) {
        for (const routeAndRange of routeAndRanges) {
          const rangeStart = DateTime.fromISO(routeAndRange.range[0]);
          const rangeEnd = DateTime.fromISO(routeAndRange.range[1]);

          if (rangeStart.isValid && rangeEnd.isValid) {
            result.push({
              flightNumber: flightNumber,
              departureAirport: routeAndRange.departureAirport,
              arrivalAirport: routeAndRange.arrivalAirport,
              rangeStart: rangeStart,
              rangeEnd: rangeEnd,
            });
          }
        }
      }
    }

    return result;
  }, [query.data]);

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

  const { items, collectionProps, paginationProps } = useCollection(rawItems, {
    sorting: {
      defaultState: {
        isDescending: false,
        sortingColumn: {
          sortingField: 'rangeStart',
        },
      },
    },
    pagination: { pageSize: 25 },
  });

  return (
    <Table
      {...collectionProps}
      items={items}
      filter={<Header counter={`(${rawItems.length})`}>{title}</Header>}
      pagination={<Pagination {...paginationProps}  />}
      variant={'container'}
      loading={query.isLoading}
      empty={<Box>No flights found</Box>}
      columnDefinitions={[
        {
          id: 'flight_number',
          header: 'Flight Number',
          cell: (v) => <FlightLink flightNumber={v.flightNumber} target={'_blank'} />,
          sortingField: 'flightNumber',
        },
        {
          id: 'departure_airport',
          header: 'Departure Airport',
          cell: (v) => v.departureAirport,
          sortingField: 'departureAirport',
        },
        {
          id: 'arrival_airport',
          header: 'Arrival Airport',
          cell: (v) => v.arrivalAirport,
          sortingField: 'arrivalAirport',
        },
        {
          id: 'range_start',
          header: 'First Operating Day',
          cell: (v) => v.rangeStart?.toISODate() ?? '',
          sortingField: 'rangeStart',
        },
        {
          id: 'range_end',
          header: 'Last Operating Day',
          cell: (v) => v.rangeEnd?.toISODate() ?? '',
          sortingField: 'rangeEnd',
        },
      ]}
    />
  );
}

function aircraftConfigurationVersionToName(v: string): string | undefined {
  return ({
    [AircraftConfigurationVersion.LH_A350_900_ALLEGRIS]: 'Allegris',
    [AircraftConfigurationVersion.LH_A350_900_ALLEGRIS_FIRST]: 'Allegris with First',
    [AircraftConfigurationVersion.LH_A350_900_LH_CONFIG]: 'A350-900 LH Config',
    [AircraftConfigurationVersion.LH_A350_900_PHILIPINE_1]: 'LH/Philippines Config 1',
    [AircraftConfigurationVersion.LH_A350_900_PHILIPINE_2]: 'LH/Philippines Config 2',
  })[v] ?? undefined;
}