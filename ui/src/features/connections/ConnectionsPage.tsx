import { useMutation, useQuery } from '@tanstack/react-query';
import {
  ArrowRight,
  CalendarDays,
  Copy,
  GitBranch,
  List,
  Map as MapIcon,
  Network,
  Search,
  Share2,
  SlidersHorizontal,
} from 'lucide-react';
import { FormEvent, useId, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '@/api/client';
import type {
  ConnectionBranch,
  ConnectionsData,
  ConnectionsSearchRequest,
  SharedConnectionsResponse,
} from '@/api/types';
import { FlightMap } from '@/components/FlightMap';
import { JourneyLegSequence, JourneyRouteSnapshot } from '@/components/JourneySnapshot';
import { MultiCombobox, type SelectOption } from '@/components/MultiCombobox';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  Loading,
  PageHeader,
} from '@/components/primitives';
import { aircraftSelectOptions, airportSelectOptions } from '@/components/selectOptions';
import { SimpleSelect } from '@/components/SimpleSelect';
import { TagInput } from '@/components/TagInput';
import { TemporalInput } from '@/components/TemporalInput';
import { classNames, dateLabel, duration, flightName, timeLabel } from '@/lib/format';
import { ConnectionGraph } from './ConnectionGraph';
import { connectionSearchDefaults } from './defaults';

type View = 'journeys' | 'graph' | 'map';
const today = new Date();
const isoLocal = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}T${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
const initialStart = isoLocal(
  new Date(today.getFullYear(), today.getMonth(), today.getDate(), 0, 0),
);
const initialEnd = isoLocal(
  new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59),
);

export function ConnectionsPage() {
  const [searchParams] = useSearchParams();
  const shared = searchParams.get('search');
  const sharedQuery = useQuery({
    queryKey: ['shared-connections', shared],
    queryFn: () => api.sharedConnections(shared ?? ''),
    enabled: !!shared,
  });

  if (shared && sharedQuery.isLoading) {
    return (
      <div className='page connections-page'>
        <Loading label='Loading shared connection search…' />
      </div>
    );
  }

  return (
    <ConnectionsWorkspace
      key={shared ?? 'new-search'}
      sharedResponse={sharedQuery.data}
      sharedError={sharedQuery.error}
    />
  );
}

function ConnectionsWorkspace({
  sharedResponse,
  sharedError,
}: {
  sharedResponse: SharedConnectionsResponse | undefined;
  sharedError: Error | null;
}) {
  const airportsQuery = useQuery({ queryKey: ['airports'], queryFn: api.airports });
  const aircraftQuery = useQuery({ queryKey: ['aircraft'], queryFn: api.aircraft });
  const initialRequest = sharedResponse?.search;
  const [origins, setOrigins] = useState<string[]>(() => [...(initialRequest?.origins ?? [])]);
  const [destinations, setDestinations] = useState<string[]>(() => [
    ...(initialRequest?.destinations ?? []),
  ]);
  const [start, setStart] = useState(() =>
    initialRequest ? toLocalInput(initialRequest.minDeparture) : initialStart,
  );
  const [end, setEnd] = useState(() =>
    initialRequest ? toLocalInput(initialRequest.maxDeparture) : initialEnd,
  );
  const [maxFlights, setMaxFlights] = useState(
    initialRequest?.maxFlights ?? connectionSearchDefaults.maxFlights,
  );
  const [minLayover, setMinLayover] = useState(
    (initialRequest?.minLayoverMS ?? connectionSearchDefaults.minLayoverMS) / 60_000,
  );
  const [maxLayover, setMaxLayover] = useState(
    (initialRequest?.maxLayoverMS ?? connectionSearchDefaults.maxLayoverMS) / 60_000,
  );
  const [maxDuration, setMaxDuration] = useState(
    (initialRequest?.maxDurationMS ?? connectionSearchDefaults.maxDurationMS) / 3_600_000,
  );
  const [countMultiLeg, setCountMultiLeg] = useState(
    initialRequest?.countMultiLeg ?? connectionSearchDefaults.countMultiLeg,
  );
  const [advanced, setAdvanced] = useState(() => hasAdvancedFilters(initialRequest));
  const [includeAirports, setIncludeAirports] = useState<string[]>(() => [
    ...(initialRequest?.includeAirport ?? []),
  ]);
  const [excludeAirports, setExcludeAirports] = useState<string[]>(() => [
    ...(initialRequest?.excludeAirport ?? []),
  ]);
  const [includeFlights, setIncludeFlights] = useState<string[]>(() => [
    ...(initialRequest?.includeFlightNumber ?? []),
  ]);
  const [excludeFlights, setExcludeFlights] = useState<string[]>(() => [
    ...(initialRequest?.excludeFlightNumber ?? []),
  ]);
  const [includeAircraft, setIncludeAircraft] = useState<string[]>(() => [
    ...(initialRequest?.includeAircraft ?? []),
  ]);
  const [excludeAircraft, setExcludeAircraft] = useState<string[]>(() => [
    ...(initialRequest?.excludeAircraft ?? []),
  ]);
  const [view, setView] = useState<View>('journeys');
  const [results, setResults] = useState<ConnectionsData | undefined>(() => sharedResponse?.data);
  const searchMutation = useMutation({
    mutationFn: api.connections,
    onSuccess: (response) => setResults(response.data),
  });
  const shareMutation = useMutation({ mutationFn: api.shareConnections });
  const airportOptions = useMemo<SelectOption[]>(
    () => airportSelectOptions(airportsQuery.data ?? []),
    [airportsQuery.data],
  );
  const aircraftOptions = useMemo<SelectOption[]>(
    () => aircraftSelectOptions(aircraftQuery.data ?? []),
    [aircraftQuery.data],
  );
  const shareResult = shareMutation.data;
  const queryError = searchMutation.error ?? sharedError;
  function buildRequest(): ConnectionsSearchRequest {
    return {
      origins,
      destinations,
      minDeparture: new Date(start).toISOString(),
      maxDeparture: new Date(end).toISOString(),
      maxFlights,
      minLayoverMS: minLayover * 60_000,
      maxLayoverMS: maxLayover * 60_000,
      maxDurationMS: maxDuration * 3_600_000,
      countMultiLeg,
      includeAirport: optional(includeAirports),
      excludeAirport: optional(excludeAirports),
      includeFlightNumber: optional(includeFlights),
      excludeFlightNumber: optional(excludeFlights),
      includeAircraft: optional(includeAircraft),
      excludeAircraft: optional(excludeAircraft),
    };
  }
  function submit(event: FormEvent) {
    event.preventDefault();
    if (origins.length && destinations.length) {
      searchMutation.mutate(buildRequest());
    }
  }
  const journeys = useMemo(() => (results ? flattenJourneys(results.connections) : []), [results]);

  return (
    <div className='page connections-page'>
      <PageHeader
        eyebrow='Connection finder'
        title='Build a journey'
        description='Search one or many origins and destinations, then shape the result with connection and equipment rules.'
        actions={
          <Badge tone='blue'>
            <Network size={13} />
            Network search
          </Badge>
        }
      />
      <Card className='search-card'>
        <form onSubmit={submit}>
          <div className='route-fields'>
            <AirportField
              label='From'
              values={origins}
              onChange={setOrigins}
              options={airportOptions}
              icon={<span className='route-dot origin' />}
            />
            <div className='route-arrow'>
              <ArrowRight size={18} />
            </div>
            <AirportField
              label='To'
              values={destinations}
              onChange={setDestinations}
              options={airportOptions}
              icon={<span className='route-dot destination' />}
            />
          </div>
          <div className='search-grid'>
            <label>
              <span>
                <CalendarDays size={15} />
                Depart after
              </span>
              <TemporalInput
                type='datetime-local'
                value={start}
                onChange={(event) => setStart(event.target.value)}
              />
            </label>
            <label>
              <span>
                <CalendarDays size={15} />
                Depart before
              </span>
              <TemporalInput
                type='datetime-local'
                value={end}
                onChange={(event) => setEnd(event.target.value)}
              />
            </label>
            <label>
              <span>
                <GitBranch size={15} />
                Maximum flights
              </span>
              <SimpleSelect
                value={maxFlights}
                onChange={(event) => setMaxFlights(Number(event.target.value))}
              >
                {[1, 2, 3, 4].map((value) => (
                  <option key={value} value={value}>
                    {value} flight{value > 1 ? 's' : ''}
                  </option>
                ))}
              </SimpleSelect>
            </label>
            <Button
              type='submit'
              disabled={!origins.length || !destinations.length || searchMutation.isPending}
            >
              <Search size={17} />
              {searchMutation.isPending ? 'Searching…' : 'Search connections'}
            </Button>
          </div>
          <label className='connection-toggle'>
            <input
              type='checkbox'
              checked={countMultiLeg}
              onChange={(event) => setCountMultiLeg(event.target.checked)}
            />
            <span>
              <strong>Count multi-leg flights separately</strong>
              <small>Each leg of a multi-leg service counts toward the maximum.</small>
            </span>
          </label>
          <button type='button' className='advanced-toggle' onClick={() => setAdvanced(!advanced)}>
            <SlidersHorizontal size={16} />
            Advanced rules <span>{advanced ? '−' : '+'}</span>
          </button>
          {advanced && (
            <div className='connection-advanced'>
              <div className='advanced-grid'>
                <Range
                  label='Minimum layover'
                  value={`${minLayover} min`}
                  min={0}
                  max={1440}
                  step={5}
                  number={minLayover}
                  onChange={setMinLayover}
                />
                <Range
                  label='Maximum layover'
                  value={`${Math.round(maxLayover / 6) / 10} h`}
                  min={30}
                  max={1440}
                  step={15}
                  number={maxLayover}
                  onChange={setMaxLayover}
                />
                <Range
                  label='Maximum journey'
                  value={`${maxDuration} h`}
                  min={1}
                  max={72}
                  step={1}
                  number={maxDuration}
                  onChange={setMaxDuration}
                />
              </div>
              <div className='include-exclude-grid'>
                <RuleGroup
                  title='Include'
                  description='Every selected inclusion must occur in the complete journey.'
                  airports={includeAirports}
                  setAirports={setIncludeAirports}
                  flights={includeFlights}
                  setFlights={setIncludeFlights}
                  aircraft={includeAircraft}
                  setAircraft={setIncludeAircraft}
                  airportOptions={airportOptions}
                  aircraftOptions={aircraftOptions}
                />
                <RuleGroup
                  title='Exclude'
                  description='No flight in a result may match an exclusion.'
                  airports={excludeAirports}
                  setAirports={setExcludeAirports}
                  flights={excludeFlights}
                  setFlights={setExcludeFlights}
                  aircraft={excludeAircraft}
                  setAircraft={setExcludeAircraft}
                  airportOptions={airportOptions}
                  aircraftOptions={aircraftOptions}
                />
              </div>
            </div>
          )}
        </form>
      </Card>
      {queryError && <ErrorState error={queryError} />}{' '}
      {results && (
        <section className='results-section'>
          <div className='results-toolbar'>
            <div>
              <span className='eyebrow'>Results</span>
              <h2>
                {journeys.length} {journeys.length === 1 ? 'journey' : 'journeys'} found
              </h2>
            </div>
            <div className='toolbar-actions'>
              <div className='view-tabs'>
                {(
                  [
                    ['journeys', List],
                    ['graph', GitBranch],
                    ['map', MapIcon],
                  ] as const
                ).map(([key, Icon]) => (
                  <button
                    key={key}
                    className={view === key ? 'active' : ''}
                    aria-label={key}
                    aria-pressed={view === key}
                    onClick={() => setView(key)}
                  >
                    <Icon size={16} />
                    <span>{key}</span>
                  </button>
                ))}
              </div>
              <Button variant='secondary' onClick={() => shareMutation.mutate(buildRequest())}>
                <Share2 size={16} />
                Share
              </Button>
            </div>
          </div>
          {shareResult && (
            <Card className='share-result'>
              <strong>Share links ready</strong>
              <ShareLinkField label='Interactive page' url={shareResult.htmlUrl} />
              <ShareLinkField label='Image' url={shareResult.imageUrl} />
            </Card>
          )}
          {view === 'journeys' &&
            (journeys.length ? (
              <div className='journey-list'>
                {journeys.map((journey, index) => (
                  <JourneyCard
                    key={journey.map((branch) => branch.flightId).join(':')}
                    journey={journey}
                    data={results}
                    index={index}
                  />
                ))}
              </div>
            ) : (
              <EmptyState
                title='No connections found'
                description='Try a broader time range, another airport, or allow one more flight.'
              />
            ))}
          {view === 'graph' && <ConnectionGraph data={results} />}{' '}
          {view === 'map' && (
            <FlightMap
              routes={Object.values(results.flights)
                .map((flight) => ({
                  from: results.airports[flight.departureAirportId],
                  to: results.airports[flight.arrivalAirportId],
                  label: flightName(flight.flightNumber, results.airlines),
                }))
                .filter((route) => route.from && route.to)}
            />
          )}
        </section>
      )}
    </div>
  );
}

function AirportField({
  label,
  values,
  onChange,
  options,
  icon,
}: {
  label: string;
  values: string[];
  onChange: (values: string[]) => void;
  options: SelectOption[];
  icon: React.ReactNode;
}) {
  return (
    <div className='airport-field'>
      <span>
        {icon}
        {label}
      </span>
      <MultiCombobox
        label={label}
        values={values}
        options={options}
        onChange={onChange}
        placeholder='Select one or more airports'
        uppercase
      />
    </div>
  );
}
function Range({
  label,
  value,
  min,
  max,
  step,
  number,
  onChange,
}: {
  label: string;
  value: string;
  min: number;
  max: number;
  step: number;
  number: number;
  onChange: (value: number) => void;
}) {
  return (
    <label>
      {label}
      <div className='range-value'>{value}</div>
      <input
        type='range'
        min={min}
        max={max}
        step={step}
        value={number}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  );
}
function RuleGroup({
  title,
  description,
  airports,
  setAirports,
  flights,
  setFlights,
  aircraft,
  setAircraft,
  airportOptions,
  aircraftOptions,
}: {
  title: string;
  description: string;
  airports: string[];
  setAirports: (values: string[]) => void;
  flights: string[];
  setFlights: (values: string[]) => void;
  aircraft: string[];
  setAircraft: (values: string[]) => void;
  airportOptions: SelectOption[];
  aircraftOptions: SelectOption[];
}) {
  return (
    <section className='rule-group'>
      <header>
        <h3>{title}</h3>
        <p>{description}</p>
      </header>
      <div className='rule-field'>
        <span>Airports</span>
        <MultiCombobox
          label={`${title} airports`}
          values={airports}
          options={airportOptions}
          onChange={setAirports}
          placeholder='No airport rules'
          uppercase
        />
      </div>
      <div className='rule-field'>
        <span>Flight numbers</span>
        <TagInput
          label={`${title} flight numbers`}
          values={flights}
          onChange={setFlights}
          placeholder='LH4*, LX??? — press Enter'
        />
      </div>
      <div className='rule-field'>
        <span>Aircraft</span>
        <MultiCombobox
          label={`${title} aircraft`}
          values={aircraft}
          options={aircraftOptions}
          onChange={setAircraft}
          placeholder='No aircraft rules'
          uppercase
        />
      </div>
    </section>
  );
}
function optional(values: string[]) {
  return values.length ? values : undefined;
}

function ShareLinkField({ label, url }: { label: string; url: string }) {
  const inputId = useId();
  const actionLabel = `Copy ${label.toLowerCase()} link`;

  function copyUrl() {
    void navigator.clipboard.writeText(url);
  }

  return (
    <div className='share-link-field'>
      <label htmlFor={inputId}>{label}</label>
      <div className='input-action share-link-control'>
        <input
          id={inputId}
          readOnly
          value={url}
          onClick={(event) => {
            event.currentTarget.select();
            copyUrl();
          }}
          onFocus={(event) => event.currentTarget.select()}
        />
        <button type='button' aria-label={actionLabel} title={actionLabel} onClick={copyUrl}>
          <Copy size={17} aria-hidden='true' />
        </button>
      </div>
    </div>
  );
}

function hasAdvancedFilters(request: ConnectionsSearchRequest | undefined): boolean {
  return Boolean(
    request?.includeAirport ||
    request?.excludeAirport ||
    request?.includeFlightNumber ||
    request?.excludeFlightNumber ||
    request?.includeAircraft ||
    request?.excludeAircraft,
  );
}

function toLocalInput(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value.slice(0, 16);
  }
  return isoLocal(date);
}
function flattenJourneys(roots: readonly ConnectionBranch[]) {
  const result: ConnectionBranch[][] = [];
  function walk(node: ConnectionBranch, path: ConnectionBranch[]) {
    const next = [...path, node];
    if (!node.outgoing.length) {
      result.push(next);
    } else {
      node.outgoing.forEach((child) => walk(child, next));
    }
  }
  roots.forEach((root) => walk(root, []));
  return result;
}
function JourneyCard({
  journey,
  data,
  index,
}: {
  journey: ConnectionBranch[];
  data: ConnectionsData;
  index: number;
}) {
  const flights = journey.map((branch) => data.flights[branch.flightId]).filter(Boolean);
  const first = flights[0],
    last = flights.at(-1);
  if (!first || !last) {
    return null;
  }
  const total =
    (new Date(last.arrivalTime).getTime() - new Date(first.departureTime).getTime()) / 1000;
  const legs = flights.map((flight, legIndex) => {
    const next = flights[legIndex + 1];
    const number = flightName(flight.flightNumber, data.airlines);
    const connectionAirport = data.airports[flight.arrivalAirportId]?.iataCode;
    const layoverSeconds = next
      ? (new Date(next.departureTime).getTime() - new Date(flight.arrivalTime).getTime()) / 1000
      : undefined;
    return {
      key: `${flight.departureTime}:${flight.departureAirportId}:${flight.arrivalAirportId}:${number}`,
      content: (
        <div className='journey-leg-panel'>
          <div className='journey-leg-card'>
            <span className='journey-leg-heading'>
              {flights.length > 1 && <span>Leg {legIndex + 1}</span>}
              <Link to={`/flight/${number}`}>{number}</Link>
            </span>
            <JourneyRouteSnapshot
              departureAirport={
                data.airports[flight.departureAirportId]?.iataCode ?? flight.departureAirportId
              }
              departureTime={timeLabel(flight.departureTime)}
              duration={duration(
                (new Date(flight.arrivalTime).getTime() -
                  new Date(flight.departureTime).getTime()) /
                  1000,
              )}
              arrivalAirport={
                data.airports[flight.arrivalAirportId]?.iataCode ?? flight.arrivalAirportId
              }
              arrivalTime={timeLabel(flight.arrivalTime)}
              operation={{
                primary: data.aircraft[flight.aircraftId]?.name ?? flight.aircraftId,
                secondary: flight.aircraftConfiguration || 'No configuration',
              }}
            />
            {flight.codeShares.length > 0 && (
              <div className='leg-codeshares'>
                Also sold as{' '}
                {flight.codeShares.map((value) => {
                  const codeshare = flightName(value, data.airlines);
                  return (
                    <Link key={codeshare} to={`/flight/${codeshare}`}>
                      {codeshare}
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      ),
      connection: next
        ? {
            label: `${duration(Math.max(layoverSeconds ?? 0, 0))} stopover in ${connectionAirport ?? flight.arrivalAirportId}`,
          }
        : undefined,
    };
  });

  return (
    <Card className='journey-card'>
      <div className='journey-summary'>
        <span className='journey-number'>{String(index + 1).padStart(2, '0')}</span>
        <div>
          <strong>
            {data.airports[first.departureAirportId]?.iataCode}
            <ArrowRight size={15} />
            {data.airports[last.arrivalAirportId]?.iataCode}
          </strong>
          <span>
            {dateLabel(first.departureTime, { weekday: 'short', month: 'short', day: 'numeric' })} ·{' '}
            {duration(total)} ·{' '}
            {flights.length - 1
              ? `${flights.length - 1} stop${flights.length > 2 ? 's' : ''}`
              : 'Direct'}
          </span>
        </div>
      </div>
      <JourneyLegSequence
        className={classNames(
          'connection-journey-snapshot',
          flights.length === 1 && 'single-leg',
          flights.length > 2 && 'many-legs',
        )}
        legs={legs}
      />
    </Card>
  );
}
