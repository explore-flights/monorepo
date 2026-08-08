import {
  ArrowRight,
  CalendarDays,
  ChevronRight,
  List,
  Plane,
  RotateCcw,
  Search,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import type {
  FlightNumber,
  FlightScheduleVariant,
  OperatingFlightScheduleItem,
  QuerySchedulesResponse,
} from '@/api/types';
import { Badge, Button, Card, EmptyState } from '@/components/primitives';
import { ActiveFilterRow, type ActiveFilter } from '@/components/ScheduleControls';
import { ScheduleScopeTabs } from '@/components/ScheduleScopeTabs';
import { ShowMore } from '@/components/ShowMore';
import { SimpleSelect } from '@/components/SimpleSelect';
import { TemporalInput } from '@/components/TemporalInput';
import { ScheduleDatesTable } from '@/features/schedules/ScheduleDatesTable';
import {
  CalendarDateButton,
  calendarColorCount,
  type CalendarFillSegment,
  YearCalendar,
} from '@/components/YearCalendar';
import { isDefined, isOneOf } from '@/lib/collections';
import {
  dateBases,
  daysBetween,
  localDate,
  matchingScheduleScope as matchingScope,
  rangeForYearScope as rangeForScope,
  type DateBasis,
  type ScheduleScope,
} from '@/lib/date';
import { classNames, dateLabel, dateRangeLabel as formatRange, flightName } from '@/lib/format';
import { departureScheduleTime, scheduleInstant } from '@/lib/time';
import { isOperatingScheduleItem } from '@/lib/schedules';
import {
  FleetHighlightControls,
  fleetHighlightValue,
  type FleetHighlight,
} from './fleetHighlights';

type ScheduleView = 'routes' | 'calendar' | 'dates';

export interface FleetSchedulePreset {
  routePair?: string;
  from?: string;
  to?: string;
}

interface FleetRecord {
  flightNumber: FlightNumber;
  item: OperatingFlightScheduleItem;
  variant: FlightScheduleVariant;
}

interface FleetPeriod {
  start: string;
  end: string;
  records: FleetRecord[];
  sample: FleetRecord;
}

interface FleetRouteDirection {
  key: string;
  records: FleetRecord[];
  periods: FleetPeriod[];
  sample: FleetRecord;
  flightNumbers: string[];
}

interface FleetRoutePair {
  key: string;
  records: FleetRecord[];
  periods: FleetPeriod[];
  directions: FleetRouteDirection[];
  start: string;
  end: string;
}

const weekdayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function FleetScheduleWorkspace({
  data,
  year,
  preset = {},
  title = 'Fleet deployment',
}: {
  data: QuerySchedulesResponse;
  year: number;
  preset?: FleetSchedulePreset;
  title?: string;
}) {
  const records = useMemo(() => operatingRecords(data), [data]);
  const localToday = localDate(new Date());
  const utcToday = new Date().toISOString().slice(0, 10);
  const initialUpcoming = rangeForScope('upcoming', year, localToday);
  const hasUpcoming = countInRange(records, initialUpcoming, 'local') > 0;
  const initialScope: ScheduleScope = hasUpcoming ? 'upcoming' : 'historical';
  const initialRange = rangeForScope(initialScope, year, localToday) ?? {
    from: `${year}-01-01`,
    to: `${year}-12-31`,
  };

  const [view, setView] = useState<ScheduleView>('routes');
  const [dateBasis, setDateBasis] = useState<DateBasis>('local');
  const [dateFrom, setDateFrom] = useState(preset.from ?? initialRange.from);
  const [dateTo, setDateTo] = useState(preset.to ?? initialRange.to);
  const [query, setQuery] = useState('');
  const [routePair, setRoutePair] = useState(preset.routePair ?? '');
  const [aircraft, setAircraft] = useState('');
  const [configuration, setConfiguration] = useState('');
  const [weekday, setWeekday] = useState('');

  const basisToday = dateBasis === 'local' ? localToday : utcToday;
  const upcomingRange = rangeForScope('upcoming', year, basisToday);
  const historicalRange = rangeForScope('historical', year, basisToday);
  const upcomingCount = countInRange(records, upcomingRange, dateBasis);
  const historicalCount = countInRange(records, historicalRange, dateBasis);
  const activeScope = matchingScope(dateFrom, dateTo, upcomingRange, historicalRange);

  const pairOptions = useMemo(() => countBy(records, (record) => routePairKey(record)), [records]);
  const aircraftOptions = useMemo(
    () => countBy(records, (record) => record.variant.aircraftId),
    [records],
  );
  const configurationOptions = useMemo(
    () => countBy(records, (record) => record.variant.aircraftConfigurationVersion || '—'),
    [records],
  );

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return records.filter((record) => {
      const date = dateForBasis(record, dateBasis);
      if (dateFrom && date < dateFrom) {
        return false;
      }
      if (dateTo && date > dateTo) {
        return false;
      }
      if (routePair && routePairKey(record) !== routePair) {
        return false;
      }
      if (aircraft && record.variant.aircraftId !== aircraft) {
        return false;
      }
      if (configuration && (record.variant.aircraftConfigurationVersion || '—') !== configuration) {
        return false;
      }
      if (weekday && String(weekdayForDate(date)) !== weekday) {
        return false;
      }
      if (!normalized) {
        return true;
      }
      const from = data.airports[record.item.departureAirportId];
      const to = data.airports[record.variant.arrivalAirportId];
      return [
        flightName(record.flightNumber, data.airlines),
        from?.iataCode,
        from?.name,
        to?.iataCode,
        to?.name,
        data.aircraft[record.variant.aircraftId]?.name,
        record.variant.aircraftConfigurationVersion,
        record.variant.aircraftOwner,
      ]
        .join(' ')
        .toLowerCase()
        .includes(normalized);
    });
  }, [
    records,
    data,
    query,
    routePair,
    aircraft,
    configuration,
    weekday,
    dateFrom,
    dateTo,
    dateBasis,
  ]);

  const periods = useMemo(
    () => buildFleetPeriods(filtered, data, dateBasis),
    [filtered, data, dateBasis],
  );
  const routePairs = useMemo(() => buildFleetRoutePairs(periods, data), [periods, data]);
  const activeChips: ActiveFilter[] = [
    query ? { key: 'query', label: `Search: ${query}`, clear: () => setQuery('') } : undefined,
    routePair
      ? { key: 'route', label: routePairLabel(routePair, data), clear: () => setRoutePair('') }
      : undefined,
    aircraft
      ? {
          key: 'aircraft',
          label: data.aircraft[aircraft]?.name ?? aircraft,
          clear: () => setAircraft(''),
        }
      : undefined,
    configuration
      ? { key: 'configuration', label: configuration, clear: () => setConfiguration('') }
      : undefined,
    weekday
      ? { key: 'weekday', label: weekdayLabels[Number(weekday)], clear: () => setWeekday('') }
      : undefined,
    dateFrom
      ? {
          key: 'date-from',
          label: `From ${dateLabel(dateFrom, { month: 'short', day: 'numeric', year: 'numeric' })}`,
          clear: () => setDateFrom(''),
        }
      : undefined,
    dateTo
      ? {
          key: 'date-to',
          label: `To ${dateLabel(dateTo, { month: 'short', day: 'numeric', year: 'numeric' })}`,
          clear: () => setDateTo(''),
        }
      : undefined,
    dateBasis === 'utc'
      ? { key: 'date-basis', label: 'UTC dates', clear: () => changeDateBasis('local') }
      : undefined,
  ].filter(isDefined);

  function applyScope(scope: ScheduleScope, basis = dateBasis) {
    const range = rangeForScope(scope, year, basis === 'local' ? localToday : utcToday);
    if (!range) {
      return;
    }
    const toggleOff = basis === dateBasis && activeScope === scope;
    setDateFrom(toggleOff ? '' : range.from);
    setDateTo(toggleOff ? '' : range.to);
  }

  function changeDateBasis(next: DateBasis) {
    const currentScope = matchingScope(dateFrom, dateTo, upcomingRange, historicalRange);
    setDateBasis(next);
    if (currentScope) {
      applyScope(currentScope, next);
    }
  }

  function resetFilters() {
    setQuery('');
    setRoutePair('');
    setAircraft('');
    setConfiguration('');
    setWeekday('');
    setDateFrom('');
    setDateTo('');
    setDateBasis('local');
  }

  function inspectRange(from: string, to: string) {
    setDateFrom(from);
    setDateTo(to);
    setView('dates');
  }

  function inspectRouteRange(pair: string, from: string, to: string) {
    setRoutePair(pair);
    inspectRange(from, to);
  }

  let workspaceContent: React.ReactNode;
  if (filtered.length === 0) {
    workspaceContent = (
      <EmptyState
        title='No matching departures'
        description='Change or clear one of the schedule filters.'
        action={
          <Button variant='secondary' onClick={resetFilters}>
            Clear filters
          </Button>
        }
      />
    );
  } else if (view === 'routes') {
    workspaceContent = (
      <RoutePairsView
        routePairs={routePairs}
        data={data}
        dateBasis={dateBasis}
        onInspect={inspectRouteRange}
      />
    );
  } else if (view === 'calendar') {
    workspaceContent = (
      <CalendarView
        records={filtered}
        data={data}
        year={year}
        dateBasis={dateBasis}
        onInspect={(date) => inspectRange(date, date)}
      />
    );
  } else {
    workspaceContent = <ScheduleDatesTable records={filtered} data={data} dateBasis={dateBasis} />;
  }

  return (
    <section className='schedule-workspace fleet-schedule-workspace'>
      <div className='workspace-heading'>
        <div>
          <span className='eyebrow'>Schedule workspace</span>
          <h2>{title}</h2>
          <p>
            <strong>{filtered.length}</strong> of {records.length} matching departures shown
          </p>
        </div>
        <ScheduleScopeTabs
          active={activeScope}
          upcomingCount={upcomingCount}
          historicalCount={historicalCount}
          upcomingEnabled={Boolean(upcomingRange)}
          historicalEnabled={Boolean(historicalRange)}
          onSelect={applyScope}
        />
      </div>

      <Card className='workspace-controls'>
        <div className='workspace-filter-grid fleet-filter-grid'>
          <label className='workspace-search'>
            <span>Search details</span>
            <div>
              <Search size={16} />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder='Flight, airport, aircraft…'
              />
            </div>
          </label>
          <label>
            <span>Route pair</span>
            <SimpleSelect value={routePair} onChange={(event) => setRoutePair(event.target.value)}>
              <option value=''>All route pairs</option>
              {pairOptions.map(([value, count]) => (
                <option key={value} value={value}>
                  {routePairLabel(value, data)} ({count})
                </option>
              ))}
            </SimpleSelect>
          </label>
          <label>
            <span>Aircraft</span>
            <SimpleSelect value={aircraft} onChange={(event) => setAircraft(event.target.value)}>
              <option value=''>All aircraft</option>
              {aircraftOptions.map(([value, count]) => (
                <option key={value} value={value}>
                  {data.aircraft[value]?.name ?? value} ({count})
                </option>
              ))}
            </SimpleSelect>
          </label>
          <label>
            <span>Configuration</span>
            <SimpleSelect
              value={configuration}
              onChange={(event) => setConfiguration(event.target.value)}
            >
              <option value=''>All configurations</option>
              {configurationOptions.map(([value, count]) => (
                <option key={value} value={value}>
                  {value} ({count})
                </option>
              ))}
            </SimpleSelect>
          </label>
          <label>
            <span>Weekday</span>
            <SimpleSelect value={weekday} onChange={(event) => setWeekday(event.target.value)}>
              <option value=''>All weekdays</option>
              {weekdayLabels.map((label, index) => (
                <option key={label} value={index}>
                  {label}
                </option>
              ))}
            </SimpleSelect>
          </label>
          <label>
            <span>From date</span>
            <TemporalInput
              type='date'
              value={dateFrom}
              onChange={(event) => setDateFrom(event.target.value)}
            />
          </label>
          <label>
            <span>To date</span>
            <TemporalInput
              type='date'
              value={dateTo}
              onChange={(event) => setDateTo(event.target.value)}
            />
          </label>
          <label>
            <span>Date basis</span>
            <SimpleSelect
              value={dateBasis}
              onChange={(event) => {
                if (isOneOf(event.target.value, dateBases)) {
                  changeDateBasis(event.target.value);
                }
              }}
            >
              <option value='local'>Departure local time</option>
              <option value='utc'>UTC</option>
            </SimpleSelect>
          </label>
          <Button variant='ghost' onClick={resetFilters}>
            <RotateCcw size={14} /> Clear all
          </Button>
        </div>
        <ActiveFilterRow filters={activeChips} />
      </Card>

      <div className='workspace-viewbar'>
        <div className='workspace-view-tabs' aria-label='Schedule view'>
          <button
            className={view === 'routes' ? 'active' : ''}
            aria-pressed={view === 'routes'}
            onClick={() => setView('routes')}
          >
            <Plane size={16} /> Routes
          </button>
          <button
            className={view === 'calendar' ? 'active' : ''}
            aria-pressed={view === 'calendar'}
            onClick={() => setView('calendar')}
          >
            <CalendarDays size={16} /> Calendar
          </button>
          <button
            className={view === 'dates' ? 'active' : ''}
            aria-pressed={view === 'dates'}
            onClick={() => setView('dates')}
          >
            <List size={16} /> Dates
          </button>
        </div>
        <p>{viewSummary(view, filtered, routePairs, dateBasis)}</p>
      </div>

      {workspaceContent}
    </section>
  );
}

function RoutePairsView({
  routePairs,
  data,
  dateBasis,
  onInspect,
}: {
  routePairs: FleetRoutePair[];
  data: QuerySchedulesResponse;
  dateBasis: DateBasis;
  onInspect: (pair: string, from: string, to: string) => void;
}) {
  const pageSize = 20;
  const [visible, setVisible] = useState(pageSize);
  return (
    <div className='fleet-route-pair-list'>
      {routePairs.slice(0, visible).map((pair) => (
        <details className='card fleet-route-pair-card' key={pair.key}>
          <summary>
            <span className='period-range fleet-route-pair-range'>
              <span>{formatRange(pair.start, pair.end)}</span>
              <strong>{pair.records.length} departures</strong>
            </span>
            <span className='fleet-route-pair-title'>
              <strong>{routePairLabel(pair.key, data)}</strong>
              <small>
                {pair.directions.length} {pair.directions.length === 1 ? 'direction' : 'directions'}{' '}
                · {routePairFlightNumberCount(pair)}{' '}
                {routePairFlightNumberCount(pair) === 1 ? 'flight number' : 'flight numbers'}
              </small>
            </span>
            <span className='fleet-route-pair-meta'>
              <span>Schedule details</span>
              <ChevronRight className='fleet-route-pair-chevron' />
            </span>
          </summary>
          <div className='fleet-route-pair-body'>
            {pair.directions.map((direction) => (
              <section className='fleet-route-direction' key={direction.key}>
                <header>
                  <div>
                    <strong>{routeDirectionLabel(direction.sample, data)}</strong>
                    <span className='fleet-route-flight-numbers'>
                      {direction.flightNumbers.map((number) => (
                        <Link key={number} to={`/flight/${number}`}>
                          {number}
                        </Link>
                      ))}
                    </span>
                  </div>
                  <span>{direction.records.length} departures</span>
                </header>
                <div className='fleet-period-list'>
                  {direction.periods.map((period) => {
                    const record = period.sample;
                    const departure = departureForBasis(record, dateBasis);
                    return (
                      <Card
                        className='fleet-period-card'
                        key={`${serviceSignature(record, data)}-${period.start}`}
                      >
                        <div className='fleet-period-range'>
                          <span>{formatRange(period.start, period.end)}</span>
                          <strong>{period.records.length} departures</strong>
                          <small>{periodWeekdays(period, dateBasis)}</small>
                        </div>
                        <div className='fleet-period-service'>
                          <span>Departure</span>
                          <strong>{departure.time}</strong>
                          <span>{departure.offset}</span>
                        </div>
                        <div className='fleet-period-equipment'>
                          <strong>
                            {data.aircraft[record.variant.aircraftId]?.name ??
                              record.variant.aircraftId}
                          </strong>
                          <Badge tone='neutral'>
                            {record.variant.aircraftConfigurationVersion || '—'}
                          </Badge>
                        </div>
                        <button onClick={() => onInspect(pair.key, period.start, period.end)}>
                          View dates <ArrowRight size={14} />
                        </button>
                      </Card>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        </details>
      ))}
      <ShowMore
        visible={visible}
        total={routePairs.length}
        batchSize={pageSize}
        itemLabel='route pairs'
        onShowMore={() => setVisible(visible + pageSize)}
      />
    </div>
  );
}

function CalendarView({
  records,
  data,
  year,
  dateBasis,
  onInspect,
}: {
  records: FleetRecord[];
  data: QuerySchedulesResponse;
  year: number;
  dateBasis: DateBasis;
  onInspect: (date: string) => void;
}) {
  const [grouping, setGrouping] = useState<FleetHighlight>('none');
  const recordsByDate = new Map<string, FleetRecord[]>();
  const counts = new Map<string, number>();
  for (const record of records) {
    const date = dateForBasis(record, dateBasis);
    counts.set(date, (counts.get(date) ?? 0) + 1);
    recordsByDate.set(date, [...(recordsByDate.get(date) ?? []), record]);
  }
  const countValues = [...counts.values()];
  const min = Math.min(...countValues);
  const max = Math.max(...countValues);
  const groupingValues =
    grouping === 'none'
      ? []
      : [
          ...new Map(
            records.map((record) => {
              const value = fleetHighlightValue(record.variant, grouping, data);
              return [value.key, value.label] as const;
            }),
          ).entries(),
        ];
  const groupingLabels = new Map(groupingValues);
  const groupingIndex = new Map(
    groupingValues.map(([key], index) => [key, index % calendarColorCount]),
  );
  return (
    <Card className='schedule-calendar-card'>
      <div className='calendar-legend fleet-calendar-legend'>
        <FleetHighlightControls
          value={grouping}
          onChange={setGrouping}
          ariaLabel='Calendar highlight'
        />
        <div className='calendar-legend-values'>
          <span>
            <i /> No matching departures
          </span>
          {grouping === 'none' ? (
            <div
              className='calendar-density-scale'
              aria-label={`Departure scale from ${min} to ${max}`}
            >
              <span>{min}</span>
              <b aria-hidden='true' />
              <span>{max} departures</span>
            </div>
          ) : (
            groupingValues.map(([key, label]) => (
              <span key={key}>
                <i className={`highlight-${groupingIndex.get(key)}`} />
                {label}
              </span>
            ))
          )}
        </div>
      </div>
      <YearCalendar
        year={year}
        renderDay={({ date, day }) => {
          const count = counts.get(date) ?? 0;
          const dateRecords = recordsByDate.get(date) ?? [];
          const groupedCounts =
            grouping === 'none'
              ? []
              : countBy(
                  dateRecords,
                  (record) => fleetHighlightValue(record.variant, grouping, data).key,
                );
          const segments: CalendarFillSegment[] = groupedCounts.map(([key, weight]) => ({
            key,
            weight,
            colorIndex: groupingIndex.get(key) ?? 0,
          }));
          let density: number | undefined;
          if (count) {
            density = max === min ? 1 : (count - min) / (max - min);
          }
          const breakdown = groupedCounts
            .map(([key, value]) => `${groupingLabels.get(key) ?? key}: ${value}`)
            .join(' · ');
          const departureLabel = `${count} departure${count === 1 ? '' : 's'}`;
          return (
            <CalendarDateButton
              key={date}
              day={day}
              className={classNames(count > 0 && 'operating')}
              disabled={count === 0}
              density={grouping === 'none' ? density : undefined}
              segments={grouping === 'none' ? undefined : segments}
              title={
                count
                  ? `${date} · ${departureLabel}${breakdown ? ` · ${breakdown}` : ''}`
                  : `${date} · No matching departures`
              }
              aria-label={
                count
                  ? `${date}, ${departureLabel}${breakdown ? `, ${breakdown}` : ''}`
                  : `${date}, no matching departures`
              }
              onClick={() => onInspect(date)}
            />
          );
        }}
      />
    </Card>
  );
}

function operatingRecords(data: QuerySchedulesResponse): FleetRecord[] {
  return data.schedules.flatMap((schedule) =>
    schedule.items.flatMap((item) => {
      if (!isOperatingScheduleItem(item)) {
        return [];
      }
      const variant = data.variants[item.flightVariantId];
      return variant
        ? [
            {
              flightNumber: schedule.flightNumber,
              item,
              variant,
            },
          ]
        : [];
    }),
  );
}

function buildFleetPeriods(records: FleetRecord[], data: QuerySchedulesResponse, basis: DateBasis) {
  const groups = new Map<string, FleetRecord[]>();
  for (const record of records) {
    const key = serviceSignature(record, data);
    groups.set(key, [...(groups.get(key) ?? []), record]);
  }
  const periods: FleetPeriod[] = [];
  for (const group of groups.values()) {
    group.sort((a, b) => dateForBasis(a, basis).localeCompare(dateForBasis(b, basis)));
    let current: FleetRecord[] = [];
    for (const record of group) {
      const previous = current.at(-1);
      if (previous && daysBetween(dateForBasis(previous, basis), dateForBasis(record, basis)) > 7) {
        periods.push(periodFor(current, basis));
        current = [];
      }
      current.push(record);
    }
    if (current.length) {
      periods.push(periodFor(current, basis));
    }
  }
  return periods.sort((a, b) => a.start.localeCompare(b.start));
}

function periodFor(records: FleetRecord[], basis: DateBasis): FleetPeriod {
  return {
    start: dateForBasis(records[0], basis),
    end: dateForBasis(records[records.length - 1], basis),
    records,
    sample: records[0],
  };
}

function buildFleetRoutePairs(
  periods: FleetPeriod[],
  data: QuerySchedulesResponse,
): FleetRoutePair[] {
  const groups = new Map<string, FleetPeriod[]>();
  for (const period of periods) {
    const key = routePairKey(period.sample);
    groups.set(key, [...(groups.get(key) ?? []), period]);
  }

  return [...groups.entries()]
    .map(([key, pairPeriods]) => {
      const directionGroups = new Map<string, FleetPeriod[]>();
      for (const period of pairPeriods) {
        const directionKey = `${period.sample.item.departureAirportId}>${period.sample.variant.arrivalAirportId}`;
        directionGroups.set(directionKey, [...(directionGroups.get(directionKey) ?? []), period]);
      }
      const directions = [...directionGroups.entries()]
        .map(([directionKey, directionPeriods]) => {
          const records = directionPeriods.flatMap((period) => period.records);
          return {
            key: directionKey,
            records,
            periods: directionPeriods.sort((a, b) => a.start.localeCompare(b.start)),
            sample: directionPeriods[0].sample,
            flightNumbers: [
              ...new Set(records.map((record) => flightName(record.flightNumber, data.airlines))),
            ].sort(),
          };
        })
        .sort((a, b) =>
          routeDirectionLabel(a.sample, data).localeCompare(routeDirectionLabel(b.sample, data)),
        );
      const records = pairPeriods.flatMap((period) => period.records);
      return {
        key,
        records,
        periods: pairPeriods,
        directions,
        start: pairPeriods.reduce(
          (earliest, period) => (period.start < earliest ? period.start : earliest),
          pairPeriods[0].start,
        ),
        end: pairPeriods.reduce(
          (latest, period) => (period.end > latest ? period.end : latest),
          pairPeriods[0].end,
        ),
      };
    })
    .sort((a, b) => b.records.length - a.records.length || a.key.localeCompare(b.key));
}

function routePairFlightNumberCount(pair: FleetRoutePair) {
  return new Set(pair.directions.flatMap((direction) => direction.flightNumbers)).size;
}

function serviceSignature(record: FleetRecord, data: QuerySchedulesResponse) {
  return [
    flightName(record.flightNumber, data.airlines),
    record.item.departureAirportId,
    record.variant.arrivalAirportId,
    record.variant.departureTimeLocal,
    record.variant.aircraftId,
    record.variant.aircraftConfigurationVersion,
  ].join('|');
}

function routePairKey(record: FleetRecord) {
  return [record.item.departureAirportId, record.variant.arrivalAirportId].sort().join('<>');
}

function routePairLabel(value: string, data: QuerySchedulesResponse) {
  const [left, right] = value.split('<>');
  return `${data.airports[left]?.iataCode ?? left} ↔ ${data.airports[right]?.iataCode ?? right}`;
}

function routeDirectionLabel(record: FleetRecord, data: QuerySchedulesResponse) {
  const from = data.airports[record.item.departureAirportId];
  const to = data.airports[record.variant.arrivalAirportId];
  return `${from?.iataCode ?? record.item.departureAirportId} → ${to?.iataCode ?? record.variant.arrivalAirportId}`;
}

function departureForBasis(record: FleetRecord, basis: DateBasis) {
  if (basis === 'local') {
    return departureScheduleTime(record.item.departureDateLocal, record.variant);
  }
  const instant = new Date(scheduleInstant(record.item.departureDateLocal, record.variant));
  return {
    date: instant.toISOString().slice(0, 10),
    time: instant.toISOString().slice(11, 16),
    offset: 'UTC+00:00',
    dayDelta: 0,
  };
}

function dateForBasis(record: FleetRecord, basis: DateBasis) {
  return departureForBasis(record, basis).date;
}

function countInRange(
  records: FleetRecord[],
  range: { from: string; to: string } | undefined,
  basis: DateBasis,
) {
  if (!range) {
    return 0;
  }
  return records.filter((record) => {
    const date = dateForBasis(record, basis);
    return date >= range.from && date <= range.to;
  }).length;
}

function countBy<T>(values: T[], key: (value: T) => string) {
  const counts = new Map<string, number>();
  for (const value of values) {
    const result = key(value);
    if (result) {
      counts.set(result, (counts.get(result) ?? 0) + 1);
    }
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

function periodWeekdays(period: FleetPeriod, basis: DateBasis) {
  const labels = [
    ...new Set(
      period.records.map((record) => weekdayLabels[weekdayForDate(dateForBasis(record, basis))]),
    ),
  ];
  return labels.length === 7 ? 'Daily' : labels.join(' · ');
}

function weekdayForDate(date: string) {
  return new Date(`${date}T00:00:00Z`).getUTCDay();
}

function viewSummary(
  view: ScheduleView,
  records: FleetRecord[],
  routePairs: FleetRoutePair[],
  dateBasis: DateBasis,
) {
  if (view === 'routes') {
    return `${routePairs.length} route pairs`;
  }
  if (view === 'calendar') {
    return `${new Set(records.map((record) => dateForBasis(record, dateBasis))).size} active dates`;
  }
  return `${records.length} exact departures`;
}
