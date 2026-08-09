import { useMutation, useQuery } from '@tanstack/react-query';
import { CalendarRange, Filter, Plus, Search, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { api } from '@/api/client';
import type { QuerySchedulesRequest } from '@/api/types';
import { MultiCombobox, type SelectOption } from '@/components/MultiCombobox';
import { Badge, Button, Card, ErrorState, Loading, PageHeader } from '@/components/primitives';
import {
  aircraftSelectOptions,
  airlineSelectOptions,
  airportSelectOptions,
} from '@/components/selectOptions';
import { SimpleSelect } from '@/components/SimpleSelect';
import { TagInput } from '@/components/TagInput';
import { TemporalInput } from '@/components/TemporalInput';
import { ScheduleResults } from '@/features/schedules/ScheduleResults';

interface AircraftRule {
  id: string;
  aircraftId: string;
  configuration: string;
}
interface RouteRule {
  id: string;
  from: string;
  to: string;
}

export function FlightSearchPage() {
  const airportsQuery = useQuery({ queryKey: ['airports'], queryFn: api.airports });
  const airlinesQuery = useQuery({ queryKey: ['airlines'], queryFn: api.airlines });
  const aircraftQuery = useQuery({ queryKey: ['aircraft'], queryFn: api.aircraft });
  const [airlines, setAirlines] = useState<string[]>([]);
  const [departures, setDepartures] = useState<string[]>([]);
  const [arrivals, setArrivals] = useState<string[]>([]);
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [aircraftRules, setAircraftRules] = useState<AircraftRule[]>(() => [createAircraftRule()]);
  const [configurationVersions, setConfigurationVersions] = useState<string[]>([]);
  const [routes, setRoutes] = useState<RouteRule[]>(() => [createRouteRule()]);
  const search = useMutation({ mutationFn: api.querySchedules });
  const airportOptions = useMemo<SelectOption[]>(
    () => airportSelectOptions(airportsQuery.data ?? []),
    [airportsQuery.data],
  );
  const airlineOptions = useMemo<SelectOption[]>(
    () => airlineSelectOptions(airlinesQuery.data ?? []),
    [airlinesQuery.data],
  );
  const aircraftOptions = useMemo<SelectOption[]>(
    () => aircraftSelectOptions(aircraftQuery.data ?? []),
    [aircraftQuery.data],
  );

  const request = buildRequest({
    airlines,
    departures,
    arrivals,
    start,
    end,
    aircraftRules,
    configurationVersions,
    routes,
  });
  const filterCount = Object.values(request).filter((value) =>
    Array.isArray(value) ? value.length > 0 : Boolean(value),
  ).length;
  const loading = airportsQuery.isLoading || airlinesQuery.isLoading || aircraftQuery.isLoading;
  const queryError = airportsQuery.error ?? airlinesQuery.error ?? aircraftQuery.error;
  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (filterCount >= 2) {
      search.mutate(request);
    }
  }

  return (
    <div className='page flight-search-page'>
      <PageHeader
        eyebrow='Tools'
        title='Flight search'
        description='Search the complete published schedule using airlines, time, equipment and route rules.'
        actions={
          <Badge tone='blue'>
            <Filter size={13} />
            Advanced schedule query
          </Badge>
        }
      />
      {loading && <Loading label='Loading search filters…' />}
      {queryError && <ErrorState error={queryError} />}{' '}
      {!loading && (
        <Card className='query-search-card'>
          <form onSubmit={submit}>
            <section>
              <div className='query-section-heading'>
                <div>
                  <span className='eyebrow'>Who and when</span>
                  <h2>Airlines & departure window</h2>
                </div>
                <CalendarRange size={20} />
              </div>
              <div className='query-grid'>
                <div className='query-field'>
                  <span>Airlines</span>
                  <MultiCombobox
                    label='Airlines'
                    values={airlines}
                    options={airlineOptions}
                    onChange={setAirlines}
                    placeholder='All airlines'
                    uppercase
                  />
                </div>
                <label>
                  <span>Depart after</span>
                  <TemporalInput
                    type='datetime-local'
                    value={start}
                    onChange={(event) => setStart(event.target.value)}
                  />
                </label>
                <label>
                  <span>Depart before</span>
                  <TemporalInput
                    type='datetime-local'
                    value={end}
                    onChange={(event) => setEnd(event.target.value)}
                  />
                </label>
              </div>
            </section>
            <section>
              <div className='query-section-heading'>
                <div>
                  <span className='eyebrow'>Network</span>
                  <h2>Airport & route filters</h2>
                </div>
              </div>
              <div className='query-grid two'>
                <div className='query-field'>
                  <span>Departure airports</span>
                  <MultiCombobox
                    label='Departure airports'
                    values={departures}
                    options={airportOptions}
                    onChange={setDepartures}
                    placeholder='Any departure'
                    uppercase
                  />
                </div>
                <div className='query-field'>
                  <span>Arrival airports</span>
                  <MultiCombobox
                    label='Arrival airports'
                    values={arrivals}
                    options={airportOptions}
                    onChange={setArrivals}
                    placeholder='Any arrival'
                    uppercase
                  />
                </div>
              </div>
              <div className='rule-list'>
                <div className='rule-list-heading'>
                  <strong>Exact routes</strong>
                  <Button
                    variant='ghost'
                    type='button'
                    onClick={() => setRoutes([...routes, createRouteRule()])}
                  >
                    <Plus size={14} />
                    Add route
                  </Button>
                </div>
                {routes.map((route, index) => (
                  <div className='rule-row route-rule' key={route.id}>
                    <SimpleSelect
                      aria-label={`Route ${index + 1} departure`}
                      value={route.from}
                      onChange={(event) =>
                        setRoutes(replaceAt(routes, index, { ...route, from: event.target.value }))
                      }
                    >
                      <option value=''>Any departure</option>
                      {airportOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label} — {option.description}
                        </option>
                      ))}
                    </SimpleSelect>
                    <span>→</span>
                    <SimpleSelect
                      aria-label={`Route ${index + 1} arrival`}
                      value={route.to}
                      onChange={(event) =>
                        setRoutes(replaceAt(routes, index, { ...route, to: event.target.value }))
                      }
                    >
                      <option value=''>Any arrival</option>
                      {airportOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label} — {option.description}
                        </option>
                      ))}
                    </SimpleSelect>
                    <Button
                      aria-label={`Remove route ${index + 1}`}
                      variant='ghost'
                      type='button'
                      disabled={routes.length === 1}
                      onClick={() =>
                        setRoutes(routes.filter((_, itemIndex) => itemIndex !== index))
                      }
                    >
                      <Trash2 size={15} />
                    </Button>
                  </div>
                ))}
              </div>
            </section>
            <section>
              <div className='query-section-heading'>
                <div>
                  <span className='eyebrow'>Equipment</span>
                  <h2>Aircraft & configurations</h2>
                </div>
              </div>
              <div className='rule-list'>
                <div className='rule-list-heading'>
                  <strong>Aircraft rules</strong>
                  <Button
                    variant='ghost'
                    type='button'
                    onClick={() => setAircraftRules([...aircraftRules, createAircraftRule()])}
                  >
                    <Plus size={14} />
                    Add aircraft
                  </Button>
                </div>
                {aircraftRules.map((rule, index) => (
                  <div className='rule-row' key={rule.id}>
                    <SimpleSelect
                      aria-label={`Aircraft rule ${index + 1}`}
                      value={rule.aircraftId}
                      onChange={(event) =>
                        setAircraftRules(
                          replaceAt(aircraftRules, index, {
                            ...rule,
                            aircraftId: event.target.value,
                          }),
                        )
                      }
                    >
                      <option value=''>Any aircraft</option>
                      {aircraftOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label} — {option.description}
                        </option>
                      ))}
                    </SimpleSelect>
                    <input
                      aria-label={`Configuration for aircraft rule ${index + 1}`}
                      value={rule.configuration}
                      onChange={(event) =>
                        setAircraftRules(
                          replaceAt(aircraftRules, index, {
                            ...rule,
                            configuration: event.target.value.toUpperCase(),
                          }),
                        )
                      }
                      placeholder='Any configuration'
                    />
                    <Button
                      aria-label={`Remove aircraft rule ${index + 1}`}
                      variant='ghost'
                      type='button'
                      disabled={aircraftRules.length === 1}
                      onClick={() =>
                        setAircraftRules(
                          aircraftRules.filter((_, itemIndex) => itemIndex !== index),
                        )
                      }
                    >
                      <Trash2 size={15} />
                    </Button>
                  </div>
                ))}
              </div>
              <label className='standalone-config'>
                <span>Configuration versions, regardless of aircraft</span>
                <TagInput
                  label='Configuration versions'
                  values={configurationVersions}
                  onChange={setConfigurationVersions}
                  placeholder='Type a version and press Enter'
                />
              </label>
            </section>
            <footer>
              <div>
                <strong>{filterCount} active filter groups</strong>
                <small>The backend requires at least two groups.</small>
              </div>
              <Button type='submit' disabled={filterCount < 2 || search.isPending}>
                <Search size={16} />
                {search.isPending ? 'Searching…' : 'Search schedules'}
              </Button>
            </footer>
          </form>
        </Card>
      )}
      {search.error && <ErrorState error={search.error} title='Schedule search failed' />}
      {search.data && (
        <ScheduleResults
          key={search.submittedAt}
          data={search.data}
          scheduleTitle='Search results'
        />
      )}
    </div>
  );
}

function replaceAt<T>(values: T[], index: number, value: T) {
  return values.map((item, itemIndex) => (itemIndex === index ? value : item));
}

function createAircraftRule(): AircraftRule {
  return { id: crypto.randomUUID(), aircraftId: '', configuration: '' };
}

function createRouteRule(): RouteRule {
  return { id: crypto.randomUUID(), from: '', to: '' };
}

function buildRequest(value: {
  airlines: string[];
  departures: string[];
  arrivals: string[];
  start: string;
  end: string;
  aircraftRules: AircraftRule[];
  configurationVersions: string[];
  routes: RouteRule[];
}): QuerySchedulesRequest {
  const aircraftId = value.aircraftRules
    .filter((rule) => rule.aircraftId && !rule.configuration)
    .map((rule) => rule.aircraftId);
  const aircraft = value.aircraftRules
    .filter((rule) => rule.aircraftId && rule.configuration)
    .map((rule) => [rule.aircraftId, rule.configuration] as const);
  const configurations = [
    ...value.configurationVersions,
    ...value.aircraftRules
      .filter((rule) => !rule.aircraftId && rule.configuration)
      .map((rule) => rule.configuration),
  ];
  return {
    airlineId: value.airlines.length ? value.airlines : undefined,
    departureAirportId: value.departures.length ? value.departures : undefined,
    arrivalAirportId: value.arrivals.length ? value.arrivals : undefined,
    minDepartureTime: value.start ? new Date(value.start).toISOString() : undefined,
    maxDepartureTime: value.end ? new Date(value.end).toISOString() : undefined,
    aircraftId: aircraftId.length ? aircraftId : undefined,
    aircraft: aircraft.length ? aircraft : undefined,
    aircraftConfigurationVersion: configurations.length ? configurations : undefined,
    route: value.routes.some((route) => route.from && route.to)
      ? value.routes
          .filter((route) => route.from && route.to)
          .map((route) => [route.from, route.to] as const)
      : undefined,
  };
}
