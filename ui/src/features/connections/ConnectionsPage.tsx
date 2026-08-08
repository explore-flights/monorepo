import { useMutation, useQuery } from '@tanstack/react-query';
import {
  ArrowRight,
  CalendarDays,
  GitBranch,
  List,
  Map as MapIcon,
  Network,
  Plane,
  Search,
  Share2,
  SlidersHorizontal,
  TableProperties,
} from 'lucide-react';
import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '@/api/client';
import type { ConnectionBranch, ConnectionsData, ConnectionsSearchRequest } from '@/api/types';
import { FlightMap } from '@/components/FlightMap';
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
import { dateLabel, duration, flightName, timeLabel } from '@/lib/format';
import { ConnectionGraph } from './ConnectionGraph';

type View = 'journeys' | 'table' | 'graph' | 'map';
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
  const airportsQuery = useQuery({ queryKey: ['airports'], queryFn: api.airports });
  const aircraftQuery = useQuery({ queryKey: ['aircraft'], queryFn: api.aircraft });
  const [origins, setOrigins] = useState<string[]>([]);
  const [destinations, setDestinations] = useState<string[]>([]);
  const [start, setStart] = useState(initialStart);
  const [end, setEnd] = useState(initialEnd);
  const [maxFlights, setMaxFlights] = useState(2);
  const [minLayover, setMinLayover] = useState(60);
  const [maxLayover, setMaxLayover] = useState(360);
  const [maxDuration, setMaxDuration] = useState(26);
  const [countMultiLeg, setCountMultiLeg] = useState(true);
  const [advanced, setAdvanced] = useState(false);
  const [includeAirports, setIncludeAirports] = useState<string[]>([]);
  const [excludeAirports, setExcludeAirports] = useState<string[]>([]);
  const [includeFlights, setIncludeFlights] = useState<string[]>([]);
  const [excludeFlights, setExcludeFlights] = useState<string[]>([]);
  const [includeAircraft, setIncludeAircraft] = useState<string[]>([]);
  const [excludeAircraft, setExcludeAircraft] = useState<string[]>([]);
  const [view, setView] = useState<View>('journeys');
  const [results, setResults] = useState<ConnectionsData>();
  const searchMutation = useMutation({
    mutationFn: api.connections,
    onSuccess: (response) => setResults(response.data),
  });
  const shareMutation = useMutation({ mutationFn: api.shareConnections });
  const shared = searchParams.get('search');
  const sharedQuery = useQuery({
    queryKey: ['shared-connections', shared],
    queryFn: () => api.sharedConnections(shared ?? ''),
    enabled: !!shared,
  });
  const airportOptions = useMemo<SelectOption[]>(
    () => airportSelectOptions(airportsQuery.data ?? []),
    [airportsQuery.data],
  );
  const aircraftOptions = useMemo<SelectOption[]>(
    () => aircraftSelectOptions(aircraftQuery.data ?? []),
    [aircraftQuery.data],
  );
  const shareResult = shareMutation.data;
  const queryError = searchMutation.error ?? sharedQuery.error;

  useEffect(() => {
    if (!sharedQuery.data) {
      return;
    }
    const request = sharedQuery.data.search;
    setOrigins([...request.origins]);
    setDestinations([...request.destinations]);
    setStart(toLocalInput(request.minDeparture));
    setEnd(toLocalInput(request.maxDeparture));
    setMaxFlights(request.maxFlights);
    setMinLayover(request.minLayoverMS / 60_000);
    setMaxLayover(request.maxLayoverMS / 60_000);
    setMaxDuration(request.maxDurationMS / 3_600_000);
    setCountMultiLeg(request.countMultiLeg);
    setIncludeAirports([...(request.includeAirport ?? [])]);
    setExcludeAirports([...(request.excludeAirport ?? [])]);
    setIncludeFlights([...(request.includeFlightNumber ?? [])]);
    setExcludeFlights([...(request.excludeFlightNumber ?? [])]);
    setIncludeAircraft([...(request.includeAircraft ?? [])]);
    setExcludeAircraft([...(request.excludeAircraft ?? [])]);
    setAdvanced(
      Boolean(
        request.includeAirport ||
        request.excludeAirport ||
        request.includeFlightNumber ||
        request.excludeFlightNumber ||
        request.includeAircraft ||
        request.excludeAircraft,
      ),
    );
    setResults(sharedQuery.data.data);
  }, [sharedQuery.data]);
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
                  min={5}
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
      {sharedQuery.isLoading && <Loading label='Loading shared search…' />}
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
                    ['table', TableProperties],
                    ['graph', GitBranch],
                    ['map', MapIcon],
                  ] as const
                ).map(([key, Icon]) => (
                  <button
                    key={key}
                    className={view === key ? 'active' : ''}
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
              <label>
                <span>Interactive page</span>
                <input
                  readOnly
                  value={shareResult.htmlUrl}
                  onFocus={(event) => event.target.select()}
                />
              </label>
              <Button
                variant='secondary'
                onClick={() => navigator.clipboard.writeText(shareResult.htmlUrl)}
              >
                Copy
              </Button>
              <label>
                <span>Image</span>
                <input
                  readOnly
                  value={shareResult.imageUrl}
                  onFocus={(event) => event.target.select()}
                />
              </label>
              <Button
                variant='secondary'
                onClick={() => navigator.clipboard.writeText(shareResult.imageUrl)}
              >
                Copy
              </Button>
            </Card>
          )}
          {view === 'journeys' &&
            (journeys.length ? (
              <div className='journey-list'>
                {journeys.map((journey, index) => (
                  <JourneyCard key={index} journey={journey} data={results} index={index} />
                ))}
              </div>
            ) : (
              <EmptyState
                title='No connections found'
                description='Try a broader time range, another airport, or allow one more flight.'
              />
            ))}
          {view === 'table' && <ConnectionTable data={results} />}{' '}
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
        />
      </div>
    </section>
  );
}
function optional(values: string[]) {
  return values.length ? values : undefined;
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
      <div className='journey-legs'>
        {flights.map((flight, itemIndex) => (
          <div className='journey-leg' key={`${flight.departureTime}-${itemIndex}`}>
            <div className='leg-times'>
              <strong>{timeLabel(flight.departureTime)}</strong>
              <span>
                <Plane size={14} />
                {duration(
                  (new Date(flight.arrivalTime).getTime() -
                    new Date(flight.departureTime).getTime()) /
                    1000,
                )}
              </span>
              <strong>{timeLabel(flight.arrivalTime)}</strong>
            </div>
            <div className='leg-route'>
              <span>
                <b>{data.airports[flight.departureAirportId]?.iataCode}</b>
                <small>{data.airports[flight.departureAirportId]?.name}</small>
              </span>
              <i />
              <span>
                <b>{data.airports[flight.arrivalAirportId]?.iataCode}</b>
                <small>{data.airports[flight.arrivalAirportId]?.name}</small>
              </span>
            </div>
            <div className='leg-meta'>
              <Link to={`/flight/${flightName(flight.flightNumber, data.airlines)}`}>
                {flightName(flight.flightNumber, data.airlines)}
              </Link>
              <span>
                {data.aircraft[flight.aircraftId]?.name ?? flight.aircraftId} ·{' '}
                {flight.aircraftConfiguration}
              </span>
            </div>
            {flight.codeShares.length > 0 && (
              <div className='leg-codeshares'>
                Also sold as{' '}
                {flight.codeShares.map((value) => (
                  <Link
                    key={flightName(value, data.airlines)}
                    to={`/flight/${flightName(value, data.airlines)}`}
                  >
                    {flightName(value, data.airlines)}
                  </Link>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </Card>
  );
}
function ConnectionTable({ data }: { data: ConnectionsData }) {
  const flights = Object.values(data.flights).sort((left, right) =>
    left.departureTime.localeCompare(right.departureTime),
  );
  return (
    <Card className='table-card'>
      <div className='table-scroll'>
        <table className='data-table'>
          <thead>
            <tr>
              <th>Flight</th>
              <th>Departure</th>
              <th>Route</th>
              <th>Arrival</th>
              <th>Aircraft</th>
              <th>Configuration</th>
              <th>Codeshares</th>
            </tr>
          </thead>
          <tbody>
            {flights.map((flight) => (
              <tr
                key={`${flightName(flight.flightNumber, data.airlines)}-${flight.departureTime}-${flight.departureAirportId}`}
              >
                <td>
                  <Link to={`/flight/${flightName(flight.flightNumber, data.airlines)}`}>
                    <strong>{flightName(flight.flightNumber, data.airlines)}</strong>
                  </Link>
                </td>
                <td>
                  <strong>{dateLabel(flight.departureTime, { dateStyle: 'medium' })}</strong>
                  <small>{timeLabel(flight.departureTime)}</small>
                </td>
                <td>
                  <strong>
                    {data.airports[flight.departureAirportId]?.iataCode}
                    <ArrowRight size={13} />
                    {data.airports[flight.arrivalAirportId]?.iataCode}
                  </strong>
                </td>
                <td>
                  <strong>{dateLabel(flight.arrivalTime, { dateStyle: 'medium' })}</strong>
                  <small>{timeLabel(flight.arrivalTime)}</small>
                </td>
                <td>
                  <strong>{data.aircraft[flight.aircraftId]?.name ?? flight.aircraftId}</strong>
                  <small>{flight.aircraftOwner}</small>
                </td>
                <td>{flight.aircraftConfiguration || '—'}</td>
                <td>
                  {flight.codeShares.length
                    ? flight.codeShares.map((value) => (
                        <Link
                          key={flightName(value, data.airlines)}
                          to={`/flight/${flightName(value, data.airlines)}`}
                        >
                          {flightName(value, data.airlines)}{' '}
                        </Link>
                      ))
                    : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
