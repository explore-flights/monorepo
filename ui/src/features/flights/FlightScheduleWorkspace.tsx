import {
  ArrowRight,
  CalendarDays,
  ChevronDown,
  ChevronRight,
  GitCompareArrows,
  History,
  List,
  Plane,
  RotateCcw,
  Search,
  Sparkles,
  Table2,
  X,
} from 'lucide-react';
import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import type {
  FlightReferenceData,
  FlightScheduleItem,
  FlightScheduleVariant,
  FlightSchedules,
} from '@/api/types';
import { Badge, Button, Card, EmptyState } from '@/components/primitives';
import { ActiveFilterRow, ScheduleInsight } from '@/components/ScheduleControls';
import { ScheduleScopeTabs } from '@/components/ScheduleScopeTabs';
import { ShowMore } from '@/components/ShowMore';
import { SimpleSelect } from '@/components/SimpleSelect';
import {
  CalendarDateButton,
  calendarColorCount,
  type CalendarFillSegment,
  YearCalendar,
} from '@/components/YearCalendar';
import { aircraftConfigurationNames } from '@/lib/aircraftConfigurations';
import { isOneOf } from '@/lib/collections';
import {
  dateBases,
  daysBetween,
  localDate,
  matchingScheduleScope,
  rangeForYearScope as rangeForPreset,
  type DateBasis,
} from '@/lib/date';
import {
  classNames,
  dateLabel,
  dateRangeLabel as formatRange,
  duration,
  flightName,
} from '@/lib/format';
import {
  arrivalScheduleTime,
  dayDeltaLabel,
  departureScheduleTime,
  formatUtcOffset,
} from '@/lib/time';
import { isOperatingScheduleItem } from '@/lib/schedules';
import {
  compareFlightVariants,
  displayVariantFor,
  type FieldChange,
  previousVariantFor,
  variantFor,
} from './flightChanges';

type ScheduleStatus = 'scheduled' | 'cancelled' | 'all';
const scheduleStatuses = [
  'scheduled',
  'cancelled',
  'all',
] as const satisfies readonly ScheduleStatus[];
type ScheduleView = 'periods' | 'calendar' | 'dates' | 'changes';
type CalendarHighlight = 'aircraft' | 'configuration' | 'both';

interface FacetFilters {
  route?: string;
  aircraftId?: string;
  weekday?: number;
  text: string;
}

interface SchedulePeriod {
  start: string;
  end: string;
  days: JourneyDay[];
  signature: string;
}

interface JourneyDay {
  date: string;
  legs: FlightScheduleItem[];
}

type PeriodBlock =
  { type: 'period'; period: SchedulePeriod } | { type: 'variation'; periods: SchedulePeriod[] };

const weekdayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function FlightScheduleWorkspace({
  data,
  flightNumber,
  year,
  changesRequest = 0,
}: {
  data: FlightSchedules;
  flightNumber: string;
  year: number;
  changesRequest?: number;
}) {
  const today = localDate(new Date());
  const utcToday = new Date().toISOString().slice(0, 10);
  const yearStart = `${year}-01-01`;
  const yearEnd = `${year}-12-31`;
  const defaultRange = rangeForPreset('upcoming', year, today) ?? { from: yearStart, to: yearEnd };
  const [dateFrom, setDateFrom] = useState(defaultRange.from);
  const [dateTo, setDateTo] = useState(defaultRange.to);
  const [dateBasis, setDateBasis] = useState<DateBasis>('local');
  const [status, setStatus] = useState<ScheduleStatus>('scheduled');
  const [view, setView] = useState<ScheduleView>('periods');
  const [filters, setFilters] = useState<FacetFilters>({ text: '' });
  const [visible, setVisible] = useState(100);
  const [highlightedBlock, setHighlightedBlock] = useState<string>();
  const highlightTimer = useRef<number | undefined>(undefined);
  const workspaceViewbar = useRef<HTMLDivElement>(null);
  const handledChangesRequest = useRef(changesRequest);
  const presetToday = dateBasis === 'utc' ? utcToday : today;
  const upcomingRange = rangeForPreset('upcoming', year, presetToday);
  const historicalRange = rangeForPreset('historical', year, presetToday);
  const allDays = useMemo(() => groupJourneyDays(data.items, data), [data]);
  const departureDateByDay = useMemo(
    () =>
      new Map(
        allDays.map((day) => [day.date, departureDateForBasis(day.legs[0], data, dateBasis)]),
      ),
    [allDays, data, dateBasis],
  );

  const scopeItems = useMemo(
    () =>
      data.items.filter((item) => {
        const departureDate =
          departureDateByDay.get(item.departureDateLocal) ?? item.departureDateLocal;
        return (!dateFrom || departureDate >= dateFrom) && (!dateTo || departureDate <= dateTo);
      }),
    [data.items, dateFrom, dateTo, departureDateByDay],
  );

  const facetItems = useMemo(
    () => scopeItems.filter((item) => matchesFacets(item, data, filters)),
    [scopeItems, data, filters],
  );
  const statusItems = useMemo(
    () =>
      facetItems.filter((item) => {
        if (status === 'scheduled') {
          return !isCancelled(item);
        }
        if (status === 'cancelled') {
          return isCancelled(item);
        }
        return true;
      }),
    [facetItems, status],
  );
  const filteredItems = statusItems;
  const filteredItemSet = useMemo(() => new Set(filteredItems), [filteredItems]);
  const filteredOutItems = useMemo(
    () => scopeItems.filter((item) => !filteredItemSet.has(item)),
    [scopeItems, filteredItemSet],
  );

  const scheduleCountItems = facetItems;
  const operatingCount = uniqueDateCount(scheduleCountItems.filter((item) => !isCancelled(item)));
  const cancelledDateCount = uniqueDateCount(scheduleCountItems.filter(isCancelled));
  const cancelledRecordCount = statusItems.filter(isCancelled).length;
  const changedCount = uniqueDateCount(statusItems.filter((item) => item.versionCount > 1));
  const changedItems = statusItems.filter((item) => item.versionCount > 1);
  const upcomingCount = upcomingRange
    ? allDays.filter((day) =>
        matchesDateRange(
          departureDateByDay.get(day.date) ?? day.date,
          upcomingRange.from,
          upcomingRange.to,
        ),
      ).length
    : 0;
  const historicalCount = historicalRange
    ? allDays.filter((day) =>
        matchesDateRange(
          departureDateByDay.get(day.date) ?? day.date,
          historicalRange.from,
          historicalRange.to,
        ),
      ).length
    : 0;
  const filteredDays = useMemo(() => groupJourneyDays(filteredItems, data), [filteredItems, data]);
  const filteredOutDays = useMemo(
    () => groupJourneyDays(filteredOutItems, data),
    [filteredOutItems, data],
  );
  const changedDays = useMemo(() => groupJourneyDays(changedItems, data), [changedItems, data]);
  const periods = useMemo(() => groupSchedulePeriods(filteredDays, data), [filteredDays, data]);
  const changePeriods = useMemo(() => groupChangePeriods(changedDays, data), [changedDays, data]);
  const multiLeg = allDays.some((day) => day.legs.length > 1);
  const routeOptions = useMemo(
    () => countBy(scopeItems, (item) => routeKey(item, data)),
    [scopeItems, data],
  );
  const aircraftOptions = useMemo(
    () => countBy(scopeItems, (item) => displayVariantFor(data, item)?.aircraftId ?? ''),
    [scopeItems, data],
  );
  const insights = useMemo(
    () => scheduleInsights(filteredDays, periods, data, today),
    [filteredDays, periods, data, today],
  );
  const activeChips = activeFilterChips(status, filters, dateFrom, dateTo, dateBasis, data);
  const activePreset = matchingScheduleScope(dateFrom, dateTo, upcomingRange, historicalRange);

  useEffect(() => {
    if (changesRequest === handledChangesRequest.current) {
      return;
    }
    handledChangesRequest.current = changesRequest;
    setView('changes');
    setVisible(100);
    window.requestAnimationFrame(() =>
      workspaceViewbar.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }),
    );
  }, [changesRequest]);

  function resetPagination() {
    setVisible(100);
  }
  function updateFilters(next: FacetFilters) {
    setFilters(next);
    resetPagination();
  }
  function applyDateRange(from: string, to: string) {
    setDateFrom(from);
    setDateTo(to);
    resetPagination();
  }
  function applyPreset(preset: 'upcoming' | 'historical') {
    const range = preset === 'upcoming' ? upcomingRange : historicalRange;
    if (!range) {
      return;
    }
    applyDateRange(
      activePreset === preset ? '' : range.from,
      activePreset === preset ? '' : range.to,
    );
  }
  function selectView(next: ScheduleView) {
    setView(next);
    resetPagination();
  }
  function inspectRange(from: string, to: string, nextView: ScheduleView = 'dates') {
    applyDateRange(from, to);
    setView(nextView);
  }
  function clearAll() {
    applyDateRange('', '');
    setDateBasis('local');
    setStatus('scheduled');
    setFilters({ text: '' });
    if (view === 'changes') {
      setView('periods');
    }
  }
  function removeChip(key: string) {
    if (key === 'status') {
      setStatus('scheduled');
      resetPagination();
    }
    if (key === 'route') {
      updateFilters({ ...filters, route: undefined });
    }
    if (key === 'aircraft') {
      updateFilters({ ...filters, aircraftId: undefined });
    }
    if (key === 'weekday') {
      updateFilters({ ...filters, weekday: undefined });
    }
    if (key === 'text') {
      updateFilters({ ...filters, text: '' });
    }
    if (key === 'date-from') {
      setDateFrom('');
      resetPagination();
    }
    if (key === 'date-to') {
      setDateTo('');
      resetPagination();
    }
    if (key === 'date-basis') {
      setDateBasis('local');
      resetPagination();
    }
  }
  function revealPeriod(period: SchedulePeriod | undefined) {
    if (!period) {
      return;
    }
    const block = buildPeriodBlocks(periods).find((candidate) =>
      candidate.type === 'period'
        ? candidate.period === period
        : candidate.periods.includes(period),
    );
    const blockStart = block?.type === 'period' ? block.period.start : block?.periods[0].start;
    if (!blockStart) {
      return;
    }
    setView('periods');
    setHighlightedBlock(blockStart);
    window.clearTimeout(highlightTimer.current);
    window.requestAnimationFrame(() =>
      window.requestAnimationFrame(() =>
        document
          .getElementById(`schedule-period-${blockStart}`)
          ?.scrollIntoView({ behavior: 'smooth', block: 'center' }),
      ),
    );
    highlightTimer.current = window.setTimeout(() => setHighlightedBlock(undefined), 2400);
  }

  return (
    <section className='schedule-workspace'>
      <header className='workspace-heading'>
        <div>
          <span className='eyebrow'>Schedule workspace</span>
          <h2>Published schedule</h2>
          <p>
            <strong>{filteredDays.length}</strong> of {allDays.length} departure dates shown
            {multiLeg ? ` · ${filteredItems.length} legs` : ''}
            {cancelledRecordCount ? ` · ${cancelledRecordCount} cancelled` : ''} ·{' '}
            {changedDays.length} with revision history
          </p>
        </div>
        <ScheduleScopeTabs
          active={activePreset}
          upcomingCount={upcomingCount}
          historicalCount={historicalCount}
          upcomingEnabled={Boolean(upcomingRange)}
          historicalEnabled={Boolean(historicalRange)}
          onSelect={applyPreset}
        />
      </header>

      <Card className='workspace-controls'>
        <div className='workspace-filter-grid'>
          <label className='workspace-search'>
            <span>Search details</span>
            <div>
              <Search size={15} />
              <input
                value={filters.text}
                onChange={(event) => updateFilters({ ...filters, text: event.target.value })}
                placeholder='Airport, aircraft, configuration…'
              />
            </div>
          </label>
          <label>
            <span>Route</span>
            <SimpleSelect
              value={filters.route ?? ''}
              onChange={(event) =>
                updateFilters({ ...filters, route: event.target.value || undefined })
              }
            >
              <option value=''>All routes</option>
              {routeOptions.map(({ key, count }) => (
                <option key={key} value={key}>
                  {routeLabel(key, data)} ({count})
                </option>
              ))}
            </SimpleSelect>
          </label>
          <label>
            <span>Aircraft</span>
            <SimpleSelect
              value={filters.aircraftId ?? ''}
              onChange={(event) =>
                updateFilters({ ...filters, aircraftId: event.target.value || undefined })
              }
            >
              <option value=''>All aircraft</option>
              {aircraftOptions.map(({ key, count }) => (
                <option key={key} value={key}>
                  {data.aircraft[key]?.name ?? key} ({count})
                </option>
              ))}
            </SimpleSelect>
          </label>
          <label>
            <span>Weekday</span>
            <SimpleSelect
              value={filters.weekday ?? ''}
              onChange={(event) =>
                updateFilters({
                  ...filters,
                  weekday: event.target.value === '' ? undefined : Number(event.target.value),
                })
              }
            >
              <option value=''>All weekdays</option>
              {weekdayLabels.map((label, index) => (
                <option key={label} value={index}>
                  {label}
                </option>
              ))}
            </SimpleSelect>
          </label>
          <label>
            <span>Status</span>
            <SimpleSelect
              value={status}
              onChange={(event) => {
                if (isOneOf(event.target.value, scheduleStatuses)) {
                  setStatus(event.target.value);
                }
                resetPagination();
              }}
            >
              <option value='scheduled'>Scheduled ({operatingCount})</option>
              <option value='cancelled'>Cancelled ({cancelledDateCount})</option>
              <option value='all'>All statuses ({uniqueDateCount(scheduleCountItems)})</option>
            </SimpleSelect>
          </label>
          <label>
            <span>From date</span>
            <input
              type='date'
              min={yearStart}
              max={dateTo || yearEnd}
              value={dateFrom}
              onChange={(event) => {
                setDateFrom(event.target.value);
                resetPagination();
              }}
            />
          </label>
          <label>
            <span>To date</span>
            <input
              type='date'
              min={dateFrom || yearStart}
              max={yearEnd}
              value={dateTo}
              onChange={(event) => {
                setDateTo(event.target.value);
                resetPagination();
              }}
            />
          </label>
          <label>
            <span>Date basis</span>
            <SimpleSelect
              value={dateBasis}
              onChange={(event) => {
                if (isOneOf(event.target.value, dateBases)) {
                  setDateBasis(event.target.value);
                }
                resetPagination();
              }}
            >
              <option value='local'>Departure local time</option>
              <option value='utc'>UTC</option>
            </SimpleSelect>
          </label>
          <Button variant='ghost' onClick={clearAll}>
            <RotateCcw size={14} />
            Clear all
          </Button>
        </div>
        <ActiveFilterRow
          filters={activeChips.map((chip) => ({
            ...chip,
            clear: () => removeChip(chip.key),
          }))}
        />
      </Card>

      {filteredItems.length > 0 && (
        <div className='schedule-insights' aria-label='Schedule insights'>
          <ScheduleInsight
            icon={<CalendarDays />}
            label='Cadence'
            value={insights.cadence}
            hint={`${insights.operatingDates} operating dates`}
            onClick={() => {
              updateFilters({ ...filters, weekday: undefined });
              setView('periods');
            }}
          />
          <ScheduleInsight
            icon={<Plane />}
            label={multiLeg ? 'Primary itinerary' : 'Primary route'}
            value={insights.primaryJourneyLabel}
            hint={`${insights.primaryJourneyCount} dates · ${insights.journeyExceptions} ${insights.journeyExceptions === 1 ? 'alternative' : 'alternatives'}`}
            onClick={() =>
              multiLeg
                ? revealPeriod(
                    periods.find(
                      (period) =>
                        journeyLabel(period.days[0], data) === insights.primaryJourneyLabel,
                    ),
                  )
                : insights.primaryRoute &&
                  updateFilters({ ...filters, route: insights.primaryRoute })
            }
          />
          <ScheduleInsight
            icon={<List />}
            label='Equipment'
            value={`${insights.aircraftCount} type${insights.aircraftCount === 1 ? '' : 's'}`}
            hint='See schedule periods'
            onClick={() => setView('periods')}
          />
          <ScheduleInsight
            icon={<GitCompareArrows />}
            label='Revision history'
            value={`${changedDays.length} dates`}
            hint='See what changed'
            onClick={() => selectView('changes')}
          />
          {insights.nextTransition && (
            <ScheduleInsight
              icon={<Sparkles />}
              label='Next transition'
              value={formatRange(insights.nextTransition.start, insights.nextTransition.end)}
              hint={periodSummary(insights.nextTransition, data)}
              onClick={() => revealPeriod(insights.nextTransition)}
            />
          )}
        </div>
      )}

      <div className='workspace-viewbar' ref={workspaceViewbar}>
        <div className='workspace-view-tabs' aria-label='Schedule view'>
          {(
            [
              ['periods', 'Periods', List],
              ['calendar', 'Calendar', CalendarDays],
              ['dates', 'Dates', Table2],
              ['changes', 'Changes', GitCompareArrows],
            ] as const
          ).map(([key, label, Icon]) => (
            <button
              key={key}
              aria-pressed={view === key}
              className={view === key ? 'active' : ''}
              onClick={() => selectView(key)}
            >
              <Icon size={15} />
              <span>{label}</span>
              {key === 'changes' && <b>{changedCount}</b>}
            </button>
          ))}
        </div>
        <p>{scheduleViewDescription(view, periods, changePeriods.length)}</p>
      </div>

      {view === 'dates' && (filteredItems.length > 0 || filteredOutItems.length > 0) && (
        <DatesView
          items={filteredItems}
          days={filteredDays}
          filteredOutItems={filteredOutItems}
          filteredOutDays={filteredOutDays}
          data={data}
          flightNumber={flightNumber}
          visible={visible}
          onMore={() => setVisible(visible + 100)}
        />
      )}
      {view === 'calendar' && (
        <CalendarView
          data={data}
          filteredItems={filteredItems}
          year={year}
          onInspect={(date) => inspectRange(date, date)}
        />
      )}
      {filteredItems.length === 0 &&
        view !== 'calendar' &&
        (view !== 'dates' || filteredOutItems.length === 0) && (
          <EmptyState
            title='No matching departures'
            description='No dates match the selected schedule and detail filters.'
          />
        )}
      {view !== 'dates' && view !== 'calendar' && filteredItems.length > 0 && (
        <>
          {view === 'periods' && (
            <PeriodsView
              periods={periods}
              data={data}
              highlightedBlock={highlightedBlock}
              onInspect={inspectRange}
            />
          )}
          {view === 'changes' && (
            <ChangesView periods={changePeriods} data={data} flightNumber={flightNumber} />
          )}
        </>
      )}
    </section>
  );
}

function PeriodsView({
  periods,
  data,
  highlightedBlock,
  onInspect,
}: {
  periods: SchedulePeriod[];
  data: FlightSchedules;
  highlightedBlock?: string;
  onInspect: (from: string, to: string, view?: ScheduleView) => void;
}) {
  return (
    <div className='period-list'>
      {buildPeriodBlocks(periods).map((block) =>
        block.type === 'period' ? (
          <SchedulePeriodCard
            key={`${block.period.start}-${block.period.signature}`}
            period={block.period}
            data={data}
            highlighted={highlightedBlock === block.period.start}
            onInspect={onInspect}
          />
        ) : (
          <ScheduleVariationCard
            key={`${block.periods[0].start}-variations`}
            periods={block.periods}
            data={data}
            highlighted={highlightedBlock === block.periods[0].start}
            onInspect={onInspect}
          />
        ),
      )}
    </div>
  );
}

function SchedulePeriodCard({
  period,
  data,
  highlighted,
  onInspect,
}: {
  period: SchedulePeriod;
  data: FlightSchedules;
  highlighted: boolean;
  onInspect: (from: string, to: string, view?: ScheduleView) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const day = period.days[0];
  const changed = period.days.filter((entry) =>
    entry.legs.some((leg) => leg.versionCount > 1),
  ).length;
  const cancelled = period.days.flatMap((entry) => entry.legs).filter(isCancelled).length;
  const operating = day.legs.some((leg) => !isCancelled(leg));
  return (
    <Card
      id={`schedule-period-${period.start}`}
      className={classNames(
        'schedule-period',
        cancelled > 0 && 'has-cancelled',
        !operating && 'cancelled-only',
        day.legs.length > 1 && 'multi-leg',
        expanded && 'expanded',
        highlighted && 'highlighted',
      )}
    >
      <div className='period-range'>
        <span>{formatRange(period.start, period.end)}</span>
        <strong>
          {period.days.length} date{period.days.length === 1 ? '' : 's'}
        </strong>
        <i />
      </div>
      <div className='period-main'>
        <JourneySnapshot
          day={day}
          data={data}
          expandable
          expanded={expanded}
          onToggle={() => setExpanded(!expanded)}
        />
      </div>
      <div className='period-meta'>
        <span>
          <CalendarDays size={14} />
          {periodFrequencyLabel(day, period.days.length)}
        </span>
        {cancelled > 0 && (
          <Badge tone='red'>
            <X size={13} />
            {cancelled} cancelled leg{cancelled === 1 ? '' : 's'}
          </Badge>
        )}
        {changed > 0 && (
          <Badge tone='amber'>
            <History size={13} />
            {changed} revised date{changed === 1 ? '' : 's'}
          </Badge>
        )}
        <button onClick={() => onInspect(period.start, period.end)}>
          View dates <ArrowRight size={13} />
        </button>
      </div>
    </Card>
  );
}

function ScheduleVariationCard({
  periods,
  data,
  highlighted,
  onInspect,
}: {
  periods: SchedulePeriod[];
  data: FlightSchedules;
  highlighted: boolean;
  onInspect: (from: string, to: string, view?: ScheduleView) => void;
}) {
  const start = periods[0].start;
  const end = periods[periods.length - 1].end;
  const days = periods.flatMap((period) => period.days);
  const changed = days.filter((day) => day.legs.some((leg) => leg.versionCount > 1)).length;
  const samples = periods.slice(0, 3);
  const patternCount = new Set(periods.map((period) => period.signature)).size;
  return (
    <Card
      id={`schedule-period-${start}`}
      className={classNames('schedule-variation', highlighted && 'highlighted')}
    >
      <div className='period-range'>
        <span>{formatRange(start, end)}</span>
        <strong>{days.length} dates</strong>
        <i />
      </div>
      <div className='variation-main'>
        <div>
          <Badge tone='blue'>Variable schedule</Badge>
          <strong>
            {patternCount} published itinerary pattern{patternCount === 1 ? '' : 's'}
          </strong>
          <span>
            {periods.length > patternCount ? `${periods.length} separate date runs. ` : ''}
            Short timing or equipment runs are consolidated here. Use Dates for the exact daily
            schedule.
          </span>
        </div>
        <div className='variation-samples'>
          {samples.map((period) => (
            <span key={`${period.start}-${period.signature}`}>
              <b>{formatRange(period.start, period.end)}</b>
              {journeyVariationSummary(period, periods, data)}
            </span>
          ))}
          {periods.length > samples.length && (
            <em>+{periods.length - samples.length} more date runs</em>
          )}
        </div>
      </div>
      <div className='period-meta'>
        <span>
          <Sparkles size={14} />
          Variation window
        </span>
        {changed > 0 && (
          <Badge tone='amber'>
            <History size={13} />
            {changed} revised dates
          </Badge>
        )}
        <button onClick={() => onInspect(start, end)}>
          View exact dates <ArrowRight size={13} />
        </button>
      </div>
    </Card>
  );
}

function JourneySnapshot({
  day,
  data,
  compact = false,
  expandable = false,
  expanded = false,
  onToggle,
}: {
  day: JourneyDay;
  data: FlightReferenceData;
  compact?: boolean;
  expandable?: boolean;
  expanded?: boolean;
  onToggle?: () => void;
}) {
  return (
    <div
      className={classNames(
        'journey-snapshot',
        compact && 'compact',
        day.legs.length === 1 && 'single-leg',
        day.legs.length > 2 && 'many-legs',
        day.legs.some(isCancelled) && 'has-cancelled',
      )}
    >
      {day.legs.map((item, index) => {
        const next = day.legs[index + 1];
        const connection = next ? connectionLabel(item, next, data) : undefined;
        return (
          <div
            className='journey-leg-wrap'
            key={`${item.departureAirportId}-${item.flightVariantId ?? item.previousFlightVariantId ?? index}`}
          >
            <JourneyLegCard
              item={item}
              index={index}
              data={data}
              compact={compact}
              expandable={expandable}
              expanded={expanded}
              onToggle={onToggle}
            />
            {next && (
              <div className={classNames('journey-connection', !connection && 'routing-unknown')}>
                <i />
                <span>{connection ?? 'Routing not published'}</span>
                <i />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function JourneyLegCard({
  item,
  index,
  data,
  compact,
  expandable,
  expanded,
  onToggle,
}: {
  item: FlightScheduleItem;
  index: number;
  data: FlightReferenceData;
  compact: boolean;
  expandable: boolean;
  expanded: boolean;
  onToggle?: () => void;
}) {
  const variant = variantFor(data, item.flightVariantId);
  const previousVariant = previousVariantFor(data, item);
  const from = data.airports[item.departureAirportId]?.iataCode ?? item.departureAirportId;
  const toggleLabel = `${expanded ? 'Collapse' : 'Expand'} all leg details for journey on ${item.departureDateLocal} from leg ${index + 1} at ${from}`;
  return (
    <div
      className={classNames(
        'journey-leg-panel',
        isCancelled(item) && 'cancelled',
        expandable && 'expandable',
        expanded && 'expanded',
      )}
    >
      <div className='journey-leg-card'>
        {expandable && (
          <button
            type='button'
            className='journey-leg-toggle'
            aria-label={toggleLabel}
            aria-expanded={expanded}
            onClick={onToggle}
          />
        )}
        <span className='journey-leg-heading'>
          <span>Leg {index + 1}</span>
          {item.versionCount > 1 && (
            <span className='journey-leg-revision'>
              <History size={11} />
              {ordinal(item.versionCount)} Revision
            </span>
          )}
          {isCancelled(item) && (
            <span className='journey-leg-cancelled'>
              <X size={10} />
              Cancelled
            </span>
          )}
          {expandable && (expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />)}
        </span>
        {variant ? (
          <VariantSnapshot item={item} variant={variant} data={data} compact={compact} />
        ) : (
          <CancelledSnapshot
            item={item}
            previousVariant={previousVariant}
            data={data}
            compact={compact}
          />
        )}
      </div>
      {expanded && (
        <JourneyLegDetails
          item={item}
          variant={variant}
          previousVariant={previousVariant}
          data={data}
        />
      )}
    </div>
  );
}

function CancelledSnapshot({
  item,
  previousVariant,
  data,
  compact,
}: {
  item: FlightScheduleItem;
  previousVariant: FlightScheduleVariant | undefined;
  data: FlightReferenceData;
  compact: boolean;
}) {
  const airport = data.airports[item.departureAirportId];
  return (
    <div className='cancelled-snapshot'>
      {previousVariant ? (
        <VariantSnapshot item={item} variant={previousVariant} data={data} compact={compact} />
      ) : (
        <div className='cancelled-snapshot-unknown'>
          <strong>{airport?.iataCode ?? item.departureAirportId}</strong>
          <span>
            {dateLabel(item.departureDateLocal, {
              weekday: 'short',
              year: 'numeric',
              month: 'short',
              day: 'numeric',
            })}{' '}
            · Previous schedule unavailable
          </span>
        </div>
      )}
    </div>
  );
}

function JourneyLegDetails({
  item,
  variant,
  previousVariant,
  data,
}: {
  item: FlightScheduleItem;
  variant: FlightScheduleVariant | undefined;
  previousVariant: FlightScheduleVariant | undefined;
  data: FlightReferenceData;
}) {
  if (!variant) {
    const from = data.airports[item.departureAirportId];
    if (!previousVariant) {
      return (
        <div className='journey-leg-details cancelled-details'>
          <p className='muted-copy'>
            This leg was cancelled in this published version. Its previous schedule is unavailable.
          </p>
          <dl>
            <div>
              <dt>Status</dt>
              <dd>Cancelled</dd>
            </div>
            <div>
              <dt>Departure airport</dt>
              <dd>{from ? `${from.iataCode} · ${from.name}` : item.departureAirportId}</dd>
            </div>
            <div>
              <dt>Departure local date</dt>
              <dd>{dateLabel(item.departureDateLocal, { dateStyle: 'long' })}</dd>
            </div>
            <div>
              <dt>Record version</dt>
              <dd>{item.version || '—'}</dd>
            </div>
            <div>
              <dt>Observed versions</dt>
              <dd>{item.versionCount}</dd>
            </div>
          </dl>
        </div>
      );
    }
    const to = data.airports[previousVariant.arrivalAirportId];
    const departure = departureScheduleTime(item.departureDateLocal, previousVariant);
    const arrival = arrivalScheduleTime(item.departureDateLocal, previousVariant);
    return (
      <div className='journey-leg-details cancelled-details'>
        <p className='muted-copy'>
          This leg is cancelled. The route, times, and equipment below describe its last scheduled
          variant.
        </p>
        <dl>
          <div>
            <dt>Status</dt>
            <dd>Cancelled</dd>
          </div>
          <div>
            <dt>Departure airport</dt>
            <dd>{from ? `${from.iataCode} · ${from.name}` : item.departureAirportId}</dd>
          </div>
          <div>
            <dt>Scheduled departure</dt>
            <dd>
              {departure.date} {departure.time} · {departure.offset} · {from?.timezone ?? '—'}
            </dd>
          </div>
          <div>
            <dt>Arrival airport</dt>
            <dd>{to ? `${to.iataCode} · ${to.name}` : previousVariant.arrivalAirportId}</dd>
          </div>
          <div>
            <dt>Scheduled arrival</dt>
            <dd>
              {arrival.date} {arrival.time} · {arrival.offset} · {to?.timezone ?? '—'}
            </dd>
          </div>
          <div>
            <dt>Operated as</dt>
            <dd>{flightName(previousVariant.operatedAs, data.airlines)}</dd>
          </div>
          <div>
            <dt>Duration</dt>
            <dd>{duration(previousVariant.durationSeconds)}</dd>
          </div>
          <div>
            <dt>Service type</dt>
            <dd>{previousVariant.serviceType || '—'}</dd>
          </div>
          <div>
            <dt>Aircraft owner</dt>
            <dd>{previousVariant.aircraftOwner || '—'}</dd>
          </div>
          <div>
            <dt>Aircraft</dt>
            <dd>{data.aircraft[previousVariant.aircraftId]?.name ?? previousVariant.aircraftId}</dd>
          </div>
          <div>
            <dt>Aircraft ID</dt>
            <dd>{previousVariant.aircraftId}</dd>
          </div>
          <div>
            <dt>Configuration</dt>
            <dd>{configurationLabel(previousVariant, data, true)}</dd>
          </div>
          <div>
            <dt>Record version</dt>
            <dd>{item.version || '—'}</dd>
          </div>
          <div>
            <dt>Observed versions</dt>
            <dd>{item.versionCount}</dd>
          </div>
        </dl>
      </div>
    );
  }
  const from = data.airports[item.departureAirportId];
  const to = data.airports[variant.arrivalAirportId];
  const departure = departureScheduleTime(item.departureDateLocal, variant);
  const arrival = arrivalScheduleTime(item.departureDateLocal, variant);
  return (
    <div className='journey-leg-details'>
      <dl>
        <div>
          <dt>Departure airport</dt>
          <dd>{from ? `${from.iataCode} · ${from.name}` : item.departureAirportId}</dd>
        </div>
        <div>
          <dt>Departure schedule</dt>
          <dd>
            {departure.date} {departure.time} · {departure.offset} · {from?.timezone ?? '—'}
          </dd>
        </div>
        <div>
          <dt>Arrival airport</dt>
          <dd>{to ? `${to.iataCode} · ${to.name}` : variant.arrivalAirportId}</dd>
        </div>
        <div>
          <dt>Arrival schedule</dt>
          <dd>
            {arrival.date} {arrival.time} · {arrival.offset} · {to?.timezone ?? '—'}
          </dd>
        </div>
        <div>
          <dt>Operated as</dt>
          <dd>{flightName(variant.operatedAs, data.airlines)}</dd>
        </div>
        <div>
          <dt>Duration</dt>
          <dd>{duration(variant.durationSeconds)}</dd>
        </div>
        <div>
          <dt>Service type</dt>
          <dd>{variant.serviceType || '—'}</dd>
        </div>
        <div>
          <dt>Aircraft owner</dt>
          <dd>{variant.aircraftOwner || '—'}</dd>
        </div>
        <div>
          <dt>Aircraft</dt>
          <dd>{data.aircraft[variant.aircraftId]?.name ?? variant.aircraftId}</dd>
        </div>
        <div>
          <dt>Aircraft ID</dt>
          <dd>{variant.aircraftId}</dd>
        </div>
        <div>
          <dt>Configuration</dt>
          <dd>{configurationLabel(variant, data, true)}</dd>
        </div>
        <div>
          <dt>Record version</dt>
          <dd>{item.version || '—'}</dd>
        </div>
        <div>
          <dt>Observed versions</dt>
          <dd>{item.versionCount}</dd>
        </div>
      </dl>
      <div className='journey-leg-detail-group'>
        <span>Codeshares</span>
        <div className='detail-links'>
          {variant.codeShares.length
            ? variant.codeShares.map((value) => (
                <Link
                  key={flightName(value, data.airlines)}
                  to={`/flight/${flightName(value, data.airlines)}?departure_airport_id=${encodeURIComponent(item.departureAirportId)}&departure_time=${encodeURIComponent(item.departureDateLocal)}`}
                >
                  {flightName(value, data.airlines)}
                </Link>
              ))
            : 'None'}
        </div>
      </div>
      {Object.keys(variant.dataElements).length > 0 && (
        <div className='journey-leg-detail-group'>
          <span>Data elements</span>
          <div className='data-elements'>
            {Object.entries(variant.dataElements).map(([key, value]) => (
              <code key={key}>
                {key}: {value}
              </code>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function VariantSnapshot({
  item,
  variant,
  data,
  compact = false,
}: {
  item: FlightScheduleItem;
  variant: FlightScheduleVariant;
  data: FlightReferenceData;
  compact?: boolean;
}) {
  const from = data.airports[item.departureAirportId];
  const to = data.airports[variant.arrivalAirportId];
  const departure = departureScheduleTime(item.departureDateLocal, variant);
  const arrival = arrivalScheduleTime(item.departureDateLocal, variant);
  const configuration = configurationLabel(variant, data);
  return (
    <div className={classNames('variant-snapshot', compact && 'compact')}>
      <div className='snapshot-route'>
        <strong>{from?.iataCode ?? item.departureAirportId}</strong>
        <span>{departure.time}</span>
        <ArrowRight size={16} />
        <strong>{to?.iataCode ?? variant.arrivalAirportId}</strong>
        <span>
          {arrival.time}
          <sup>{dayDeltaLabel(arrival.dayDelta)}</sup>
        </span>
      </div>
      <div className='snapshot-operation'>
        <strong>{data.aircraft[variant.aircraftId]?.name ?? variant.aircraftId}</strong>
        <span>
          {configuration} · {duration(variant.durationSeconds)}
        </span>
      </div>
    </div>
  );
}

function CalendarView({
  data,
  filteredItems,
  year,
  onInspect,
}: {
  data: FlightSchedules;
  filteredItems: readonly FlightScheduleItem[];
  year: number;
  onInspect: (date: string) => void;
}) {
  const [highlight, setHighlight] = useState<CalendarHighlight>('aircraft');
  const filteredDates = new Set(filteredItems.map((item) => item.departureDateLocal));
  const itemsByDate = groupByDate(data.items);
  const highlightValues = [
    ...new Map(
      data.items.flatMap((item) => {
        const variant = displayVariantFor(data, item);
        return variant
          ? [
              [
                calendarHighlightKey(variant, highlight),
                calendarHighlightLabel(variant, highlight, data),
              ] as const,
            ]
          : [];
      }),
    ).entries(),
  ];
  const highlightLabels = new Map(highlightValues);
  const highlightIndex = new Map(
    highlightValues.map(([key], index) => [key, index % calendarColorCount]),
  );
  return (
    <Card className='schedule-calendar-card'>
      <div className='calendar-legend'>
        <div className='calendar-highlight-controls' role='group' aria-label='Calendar highlight'>
          <strong>Highlight</strong>
          <div className='facet-buttons'>
            {(
              [
                ['aircraft', 'Aircraft'],
                ['configuration', 'Configuration'],
                ['both', 'Aircraft + Configuration'],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                className={highlight === key ? 'active' : ''}
                aria-pressed={highlight === key}
                onClick={() => setHighlight(key)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <div className='calendar-legend-values'>
          <span>
            <i className='cancelled' />
            Cancelled leg
          </span>
          <span>
            <i className='changed' />
            Revised
          </span>
          <span>
            <i className='filtered-out' />
            Filtered out
          </span>
          {highlightValues.map(([key, label]) => (
            <span key={key}>
              <i className={`highlight-${highlightIndex.get(key)}`} />
              {label}
            </span>
          ))}
        </div>
      </div>
      <YearCalendar
        year={year}
        renderDay={({ date, day }) => {
          const items = itemsByDate.get(date) ?? [];
          if (!items.length) {
            return (
              <CalendarDateButton
                key={date}
                day={day}
                disabled
                title={`${date} · No published departures`}
                aria-label={`${date}, no published departures`}
              />
            );
          }
          const operatingCount = items.filter((item) => !isCancelled(item)).length;
          const cancelledCount = items.filter(isCancelled).length;
          const operating = operatingCount > 0;
          const changed = items.some((item) => item.versionCount > 1);
          const filteredOut = !filteredDates.has(date);
          const groupedCounts = new Map<string, number>();
          for (const item of items) {
            const variant = displayVariantFor(data, item);
            if (!variant) {
              continue;
            }
            const key = calendarHighlightKey(variant, highlight);
            groupedCounts.set(key, (groupedCounts.get(key) ?? 0) + 1);
          }
          const segments: CalendarFillSegment[] = [...groupedCounts.entries()].map(
            ([key, weight]) => ({
              key,
              weight,
              colorIndex: highlightIndex.get(key) ?? 0,
            }),
          );
          const breakdown = [...groupedCounts.entries()]
            .map(([key, count]) => `${highlightLabels.get(key) ?? key}: ${count}`)
            .join(' · ');
          const states = [
            operating ? 'operating' : 'cancelled-only',
            cancelledCount > 0 && 'cancelled',
            changed && 'changed',
            filteredOut && 'filtered-out',
          ];
          const statusLabel = [
            operatingCount
              ? `${operatingCount} operating leg${operatingCount === 1 ? '' : 's'}`
              : '',
            cancelledCount
              ? `${cancelledCount} cancelled leg${cancelledCount === 1 ? '' : 's'}`
              : '',
          ]
            .filter(Boolean)
            .join(' · ');
          const filterLabel = filteredOut ? ' · Filtered out' : '';
          return (
            <CalendarDateButton
              key={date}
              day={day}
              segments={segments}
              className={classNames(...states)}
              title={`${date} · ${statusLabel}${breakdown ? ` · ${breakdown}` : ''}${changed ? ' · Revised' : ''}${filterLabel}`}
              aria-label={`${date}, ${statusLabel.replace(' · ', ', ')}${breakdown ? `, ${breakdown}` : ''}${changed ? ', revised' : ''}${filteredOut ? ', filtered out' : ''}`}
              onClick={() => onInspect(date)}
            />
          );
        }}
      />
    </Card>
  );
}

function DatesView({
  items,
  days,
  filteredOutItems,
  filteredOutDays,
  data,
  flightNumber,
  visible,
  onMore,
}: {
  items: readonly FlightScheduleItem[];
  days: readonly JourneyDay[];
  filteredOutItems: readonly FlightScheduleItem[];
  filteredOutDays: readonly JourneyDay[];
  data: FlightSchedules;
  flightNumber: string;
  visible: number;
  onMore: () => void;
}) {
  const [filteredOutExpanded, setFilteredOutExpanded] = useState(
    days.length === 0 && filteredOutDays.length > 0,
  );

  useEffect(() => {
    if (days.length === 0 && filteredOutDays.length > 0) {
      setFilteredOutExpanded(true);
    }
  }, [days.length, filteredOutDays.length]);

  return (
    <Card className='journey-date-card'>
      <div className='journey-date-heading'>
        <div>
          <strong>Dated journeys</strong>
          <span>Each date keeps every published leg together.</span>
        </div>
        <Badge>
          {days.length} dates · {items.length} leg{items.length === 1 ? '' : 's'}
        </Badge>
      </div>
      <div className='journey-date-list'>
        {days.slice(0, visible).map((day) => (
          <JourneyDateRow key={day.date} day={day} data={data} flightNumber={flightNumber} />
        ))}
      </div>
      <ShowMore
        visible={visible}
        total={days.length}
        batchSize={100}
        itemLabel='dates'
        onShowMore={onMore}
      />
      {filteredOutDays.length > 0 && (
        <details
          className='filtered-dates-disclosure'
          open={filteredOutExpanded}
          onToggle={(event) => setFilteredOutExpanded(event.currentTarget.open)}
        >
          <summary>
            <span className='filtered-dates-summary-icon'>
              <ChevronRight size={16} />
            </span>
            <span>
              <strong>Filtered out dates</strong>
              <small>Hidden by the current detail or status filters.</small>
            </span>
            <Badge>
              {filteredOutDays.length} date{filteredOutDays.length === 1 ? '' : 's'} ·{' '}
              {filteredOutItems.length} leg{filteredOutItems.length === 1 ? '' : 's'}
            </Badge>
          </summary>
          <div className='journey-date-list filtered-date-list'>
            {filteredOutDays.map((day) => (
              <JourneyDateRow key={day.date} day={day} data={data} flightNumber={flightNumber} />
            ))}
          </div>
        </details>
      )}
    </Card>
  );
}

function JourneyDateRow({
  day,
  data,
  flightNumber,
}: {
  day: JourneyDay;
  data: FlightSchedules;
  flightNumber: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const cancelled = day.legs.filter(isCancelled).length;
  return (
    <article
      className={classNames(
        'journey-date-row',
        cancelled > 0 && 'has-cancelled',
        expanded && 'expanded',
      )}
    >
      <div className='journey-date-label'>
        <strong>{dateLabel(day.date, { weekday: 'short', month: 'short', day: '2-digit' })}</strong>
        <span>{new Date(day.date).getFullYear()}</span>
        {cancelled > 0 && (
          <Badge tone='red'>
            <X size={12} />
            {cancelled} cancelled
          </Badge>
        )}
      </div>
      <JourneySnapshot
        day={day}
        data={data}
        compact
        expandable
        expanded={expanded}
        onToggle={() => setExpanded(!expanded)}
      />
      <div className='journey-date-history'>
        {day.legs.map((leg, index) => (
          <LegHistoryLink
            key={`${leg.departureAirportId}-${index}`}
            flightNumber={flightNumber}
            item={leg}
            label={`Leg ${index + 1} history`}
          />
        ))}
      </div>
    </article>
  );
}

function LegHistoryLink({
  flightNumber,
  item,
  label,
}: {
  flightNumber: string;
  item: FlightScheduleItem;
  label: string;
}) {
  return (
    <Link
      className='history-link leg-history-link'
      to={`/flight/${flightNumber}/versions/${item.departureAirportId}/${item.departureDateLocal}`}
    >
      <History size={13} />
      <span>{label}</span>
    </Link>
  );
}

function ChangesView({
  periods,
  data,
  flightNumber,
}: {
  periods: SchedulePeriod[];
  data: FlightSchedules;
  flightNumber: string;
}) {
  if (!periods.length) {
    return (
      <EmptyState
        title='No revised dates'
        description='No dates in this selection have more than one observed schedule version.'
      />
    );
  }
  return (
    <section className='changes-view'>
      <div className='changes-intro'>
        <GitCompareArrows size={18} />
        <div>
          <strong>Published journey revisions</strong>
          <p>
            Matching before-and-after journeys are grouped across all selected dates. Each leg is
            compared with its immediately previous variant.
          </p>
        </div>
      </div>
      <div className='journey-change-events'>
        {periods.map((period) => (
          <JourneyChangeEvent
            key={`${period.start}-${period.end}-${period.signature}`}
            period={period}
            data={data}
            flightNumber={flightNumber}
          />
        ))}
      </div>
    </section>
  );
}

function JourneyChangeEvent({
  period,
  data,
  flightNumber,
}: {
  period: SchedulePeriod;
  data: FlightSchedules;
  flightNumber: string;
}) {
  const day = period.days[0];
  const observed = [
    ...new Set(period.days.flatMap((entry) => entry.legs.map((leg) => leg.version))),
  ]
    .sort()
    .at(-1);
  const dateSummary = changePeriodDateSummary(period);
  return (
    <article className='journey-change-event'>
      <header>
        <div>
          <strong title={dateSummary.fullLabel}>{dateSummary.label}</strong>
          <span>
            {dateSummary.detail} · {journeyLabel(day, data)}
          </span>
        </div>
        <Badge tone='amber'>
          <History size={13} />
          Latest {dateLabel(observed ?? '', { month: 'short', day: 'numeric' })}
        </Badge>
      </header>
      <div>
        {day.legs.map((leg, index) => (
          <LegChangePreview
            key={`${leg.departureAirportId}-${index}`}
            item={leg}
            index={index}
            data={data}
            flightNumber={flightNumber}
          />
        ))}
      </div>
    </article>
  );
}

function LegChangePreview({
  item,
  index,
  data,
  flightNumber,
}: {
  item: FlightScheduleItem;
  index: number;
  data: FlightSchedules;
  flightNumber: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const current = variantFor(data, item.flightVariantId);
  const previous = previousVariantFor(data, item);
  const changes = compareFlightVariants(previous, current, data, item.departureDateLocal);
  const changedKeys = new Set(changes.map((change) => change.key));
  const dataElementKeys = [
    ...new Set([
      ...Object.keys(previous?.dataElements ?? {}),
      ...Object.keys(current?.dataElements ?? {}),
    ]),
  ].sort((left, right) => Number(left) - Number(right));
  const departure = data.airports[item.departureAirportId]?.iataCode ?? item.departureAirportId;
  const route = changeRouteLabel(departure, current, previous, data);
  const toggleLabel = `${expanded ? 'Collapse' : 'Expand'} full before-and-after details for leg ${index + 1} ${route}`;
  return (
    <section className='journey-change-leg'>
      <header>
        <div>
          <span>Leg {index + 1}</span>
          <strong>{route}</strong>
        </div>
        <div>
          <ChangeBadges changes={changes} />
        </div>
      </header>
      <div className={classNames('journey-change-comparison', expanded && 'expanded')}>
        <div className='journey-change-summary'>
          <button
            type='button'
            className='journey-change-toggle'
            aria-label={toggleLabel}
            aria-expanded={expanded}
            onClick={() => setExpanded(!expanded)}
          />
          <div>
            <small>Previous</small>
            <VariantComparison item={item} variant={previous} data={data} />
          </div>
          <ArrowRight size={17} />
          <div>
            <small>Published now</small>
            <VariantComparison item={item} variant={current} data={data} />
          </div>
          <span className='journey-change-chevron' aria-hidden='true'>
            {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
          </span>
        </div>
        {expanded && (
          <div className='journey-change-details'>
            <section>
              <small>Previous details</small>
              <ChangeVariantDetails
                item={item}
                variant={previous}
                data={data}
                changedKeys={changedKeys}
                dataElementKeys={dataElementKeys}
              />
            </section>
            <ArrowRight size={17} />
            <section>
              <small>Published details</small>
              <ChangeVariantDetails
                item={item}
                variant={current}
                data={data}
                changedKeys={changedKeys}
                dataElementKeys={dataElementKeys}
              />
            </section>
          </div>
        )}
      </div>
      <div className='journey-change-history'>
        <LegHistoryLink
          flightNumber={flightNumber}
          item={item}
          label={`Leg ${index + 1} history`}
        />
      </div>
    </section>
  );
}

function ChangeVariantDetails({
  item,
  variant,
  data,
  changedKeys,
  dataElementKeys,
}: {
  item: FlightScheduleItem;
  variant: FlightScheduleVariant | undefined;
  data: FlightReferenceData;
  changedKeys: ReadonlySet<string>;
  dataElementKeys: readonly string[];
}) {
  const from = data.airports[item.departureAirportId];
  if (!variant) {
    return (
      <div className='journey-leg-details change-variant-details cancelled-details'>
        <dl>
          <ChangeDetailItem label='Status' changed={changedKeys.has('status')}>
            Cancelled
          </ChangeDetailItem>
          <ChangeDetailItem label='Departure airport'>
            {from ? `${from.iataCode} · ${from.name}` : item.departureAirportId}
          </ChangeDetailItem>
          <ChangeDetailItem label='Departure local date'>
            {dateLabel(item.departureDateLocal, { dateStyle: 'long' })}
          </ChangeDetailItem>
        </dl>
      </div>
    );
  }

  const to = data.airports[variant.arrivalAirportId];
  const departure = departureScheduleTime(item.departureDateLocal, variant);
  const arrival = arrivalScheduleTime(item.departureDateLocal, variant);
  return (
    <div className='journey-leg-details change-variant-details'>
      <dl>
        <ChangeDetailItem label='Status' changed={changedKeys.has('status')}>
          Scheduled
        </ChangeDetailItem>
        <ChangeDetailItem label='Departure airport'>
          {from ? `${from.iataCode} · ${from.name}` : item.departureAirportId}
        </ChangeDetailItem>
        <ChangeDetailItem
          label='Departure schedule'
          changed={changedKeys.has('departure-time') || changedKeys.has('departure-offset')}
        >
          {departure.date} {departure.time} · {departure.offset} · {from?.timezone ?? '—'}
        </ChangeDetailItem>
        <ChangeDetailItem label='Arrival airport' changed={changedKeys.has('arrival-airport')}>
          {to ? `${to.iataCode} · ${to.name}` : variant.arrivalAirportId}
        </ChangeDetailItem>
        <ChangeDetailItem
          label='Arrival schedule'
          changed={changedKeys.has('arrival-time') || changedKeys.has('arrival-offset')}
        >
          {arrival.date} {arrival.time} · {arrival.offset} · {to?.timezone ?? '—'}
        </ChangeDetailItem>
        <ChangeDetailItem label='Operated as' changed={changedKeys.has('operated-as')}>
          {flightName(variant.operatedAs, data.airlines)}
        </ChangeDetailItem>
        <ChangeDetailItem label='Duration' changed={changedKeys.has('duration')}>
          {duration(variant.durationSeconds)}
        </ChangeDetailItem>
        <ChangeDetailItem label='Service type' changed={changedKeys.has('service-type')}>
          {variant.serviceType || '—'}
        </ChangeDetailItem>
        <ChangeDetailItem label='Aircraft owner' changed={changedKeys.has('aircraft-owner')}>
          {variant.aircraftOwner || '—'}
        </ChangeDetailItem>
        <ChangeDetailItem label='Aircraft' changed={changedKeys.has('aircraft')}>
          {data.aircraft[variant.aircraftId]?.name ?? variant.aircraftId}
        </ChangeDetailItem>
        <ChangeDetailItem label='Aircraft ID' changed={changedKeys.has('aircraft')}>
          {variant.aircraftId}
        </ChangeDetailItem>
        <ChangeDetailItem label='Configuration' changed={changedKeys.has('configuration')}>
          {configurationLabel(variant, data, true)}
        </ChangeDetailItem>
      </dl>
      <div
        className={classNames(
          'journey-leg-detail-group',
          changedKeys.has('codeshares') && 'changed',
        )}
      >
        <span>Codeshares</span>
        <div className='detail-links'>
          {variant.codeShares.length
            ? variant.codeShares.map((value) => (
                <Link
                  key={flightName(value, data.airlines)}
                  to={`/flight/${flightName(value, data.airlines)}?departure_airport_id=${encodeURIComponent(item.departureAirportId)}&departure_time=${encodeURIComponent(item.departureDateLocal)}`}
                >
                  {flightName(value, data.airlines)}
                </Link>
              ))
            : 'None'}
        </div>
      </div>
      {dataElementKeys.length > 0 && (
        <div className='journey-leg-detail-group'>
          <span>Data elements</span>
          <div className='data-elements'>
            {dataElementKeys.map((key) => (
              <code
                key={key}
                className={changedKeys.has(`data-element-${key}`) ? 'changed' : undefined}
              >
                {key}: {variant.dataElements[Number(key)] ?? '—'}
              </code>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ChangeDetailItem({
  label,
  changed = false,
  children,
}: {
  label: string;
  changed?: boolean;
  children: ReactNode;
}) {
  return (
    <div className={changed ? 'changed' : undefined}>
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

function matchesFacets(item: FlightScheduleItem, data: FlightSchedules, filters: FacetFilters) {
  if (filters.weekday !== undefined && weekdayOf(item) !== filters.weekday) {
    return false;
  }
  const variant = displayVariantFor(data, item);
  if (filters.route && (!variant || routeKey(item, data) !== filters.route)) {
    return false;
  }
  if (filters.aircraftId && variant?.aircraftId !== filters.aircraftId) {
    return false;
  }
  const needle = filters.text.trim().toLowerCase();
  if (!needle) {
    return true;
  }
  const from = data.airports[item.departureAirportId];
  const to = variant ? data.airports[variant.arrivalAirportId] : undefined;
  return [
    item.departureDateLocal,
    from?.iataCode,
    from?.name,
    to?.iataCode,
    to?.name,
    variant && data.aircraft[variant.aircraftId]?.name,
    variant?.aircraftConfigurationVersion,
    variant && configurationLabel(variant, data),
    variant?.aircraftOwner,
    variant?.serviceType,
  ]
    .join(' ')
    .toLowerCase()
    .includes(needle);
}

function groupSchedulePeriods(days: readonly JourneyDay[], data: FlightSchedules) {
  return groupPeriods(days, (day) => journeySignature(day, data));
}

function groupChangePeriods(days: readonly JourneyDay[], data: FlightSchedules) {
  const sorted = [...days].sort((left, right) => left.date.localeCompare(right.date));
  const periodsBySignature = new Map<string, SchedulePeriod>();
  for (const day of sorted) {
    const signature = day.legs
      .map((item) => {
        const previous = previousVariantFor(data, item);
        const current = variantFor(data, item.flightVariantId);
        return `${item.departureAirportId}|before:${variantSignature(previous)}|after:${variantSignature(current)}`;
      })
      .join('>>');
    const period = periodsBySignature.get(signature);
    if (period) {
      period.end = day.date;
      period.days.push(day);
    } else {
      periodsBySignature.set(signature, {
        start: day.date,
        end: day.date,
        days: [day],
        signature,
      });
    }
  }
  return [...periodsBySignature.values()];
}

function groupPeriods(
  days: readonly JourneyDay[],
  signatureFor: (day: JourneyDay) => string,
): SchedulePeriod[] {
  const sorted = [...days].sort((left, right) => left.date.localeCompare(right.date));
  const periods: SchedulePeriod[] = [];
  for (const day of sorted) {
    const signature = signatureFor(day);
    const current = periods.at(-1);
    if (current && current.signature === signature && isNextDay(current.end, day.date)) {
      current.end = day.date;
      current.days.push(day);
    } else {
      periods.push({ start: day.date, end: day.date, days: [day], signature });
    }
  }
  return periods;
}

function buildPeriodBlocks(periods: readonly SchedulePeriod[]): PeriodBlock[] {
  const stablePeriodMinimum = 7;
  const maximumVariationGap = 3;
  const blocks: PeriodBlock[] = [];
  for (let index = 0; index < periods.length;) {
    const period = periods[index];
    if (
      period.days.some((day) => day.legs.some(isCancelled)) ||
      period.days.length >= stablePeriodMinimum
    ) {
      blocks.push({ type: 'period', period });
      index += 1;
      continue;
    }
    const variations = [period];
    index += 1;
    while (
      index < periods.length &&
      !periods[index].days.some((day) => day.legs.some(isCancelled)) &&
      periods[index].days.length < stablePeriodMinimum &&
      daysBetween(variations[variations.length - 1].end, periods[index].start) <=
        maximumVariationGap
    ) {
      variations.push(periods[index]);
      index += 1;
    }
    blocks.push(
      variations.length === 1
        ? { type: 'period', period: variations[0] }
        : { type: 'variation', periods: variations },
    );
  }
  return blocks;
}

function periodViewLabel(periods: readonly SchedulePeriod[]) {
  const blocks = buildPeriodBlocks(periods);
  const stable = blocks.filter(
    (block) => block.type === 'period' && block.period.days.length >= 7,
  ).length;
  const direct = blocks.filter(
    (block) => block.type === 'period' && block.period.days.length < 7,
  ).length;
  const variations = blocks.filter((block) => block.type === 'variation').length;
  return [
    `${stable} stable period${stable === 1 ? '' : 's'}`,
    direct ? `${direct} direct period${direct === 1 ? '' : 's'}` : '',
    variations ? `${variations} variation window${variations === 1 ? '' : 's'}` : '',
  ]
    .filter(Boolean)
    .join(' · ');
}

function scheduleInsights(
  days: readonly JourneyDay[],
  periods: readonly SchedulePeriod[],
  data: FlightSchedules,
  today: string,
) {
  const operatingDays = days.filter((day) => day.legs.some((item) => item.flightVariantId));
  const operating = operatingDays.flatMap((day) => day.legs.filter(isOperatingScheduleItem));
  const routes = countBy(operating, (item) => routeKey(item, data));
  const primaryRoute = routes[0];
  const journeys = countJourneyPatterns(operatingDays, data);
  const primaryJourney = journeys[0];
  const aircraft = new Set(
    operating.map((item) => data.variants[item.flightVariantId]?.aircraftId).filter(Boolean),
  );
  const weekdays = new Set(operatingDays.map((day) => weekdayOf(day.legs[0])));
  const uniqueDates = operatingDays.map((day) => day.date);
  const lastDate = uniqueDates.at(-1) ?? uniqueDates[0];
  const span =
    uniqueDates.length > 1 ? daysBetween(uniqueDates[0], lastDate) + 1 : uniqueDates.length;
  const coverage = span > 0 ? uniqueDates.length / span : 0;
  const cadence = cadenceLabel(coverage, weekdays.size);
  const nextTransition = periods.find(
    (period, index) =>
      index > 0 && period.start >= today && period.signature !== periods[index - 1].signature,
  );
  return {
    cadence,
    operatingDates: operatingDays.length,
    primaryRoute: primaryRoute?.key,
    primaryJourneyLabel: primaryJourney?.label ?? 'No operating route',
    primaryJourneyCount: primaryJourney?.count ?? 0,
    journeyExceptions: Math.max(0, operatingDays.length - (primaryJourney?.count ?? 0)),
    aircraftCount: aircraft.size,
    nextTransition,
  };
}

function activeFilterChips(
  status: ScheduleStatus,
  filters: FacetFilters,
  dateFrom: string,
  dateTo: string,
  dateBasis: DateBasis,
  data: FlightSchedules,
) {
  const chips: Array<{ key: string; label: string }> = [];
  if (status === 'cancelled') {
    chips.push({ key: 'status', label: 'Cancelled' });
  }
  if (filters.route) {
    chips.push({ key: 'route', label: routeLabel(filters.route, data) });
  }
  if (filters.aircraftId) {
    chips.push({
      key: 'aircraft',
      label: data.aircraft[filters.aircraftId]?.name ?? filters.aircraftId,
    });
  }
  if (filters.weekday !== undefined) {
    chips.push({ key: 'weekday', label: weekdayLabels[filters.weekday] });
  }
  if (filters.text.trim()) {
    chips.push({ key: 'text', label: `“${filters.text.trim()}”` });
  }
  if (dateFrom) {
    chips.push({ key: 'date-from', label: `From ${formatFilterDate(dateFrom)}` });
  }
  if (dateTo) {
    chips.push({ key: 'date-to', label: `To ${formatFilterDate(dateTo)}` });
  }
  if (dateBasis === 'utc') {
    chips.push({ key: 'date-basis', label: 'Departure dates in UTC' });
  }
  return chips;
}

function periodSummary(period: SchedulePeriod, data: FlightSchedules) {
  const day = period.days[0];
  const aircraft = [
    ...new Set(
      day.legs.flatMap((item) => {
        const variant = displayVariantFor(data, item);
        return variant ? [data.aircraft[variant.aircraftId]?.name ?? variant.aircraftId] : [];
      }),
    ),
  ];
  return `${journeyLabel(day, data)}${aircraft.length ? ` · ${aircraft.join(' / ')}` : ''}`;
}

function calendarHighlightKey(variant: FlightScheduleVariant, highlight: CalendarHighlight) {
  const configuration = variant.aircraftConfigurationVersion || 'No configuration';
  if (highlight === 'aircraft') {
    return variant.aircraftId;
  }
  if (highlight === 'configuration') {
    return configuration;
  }
  return `${variant.aircraftId}|${configuration}`;
}

function calendarHighlightLabel(
  variant: FlightScheduleVariant,
  highlight: CalendarHighlight,
  data: FlightReferenceData,
) {
  const aircraft = data.aircraft[variant.aircraftId]?.name ?? variant.aircraftId;
  const configuration = configurationLabel(variant, data);
  if (highlight === 'aircraft') {
    return aircraft;
  }
  if (highlight === 'configuration') {
    return configuration;
  }
  return `${aircraft} · ${configuration}`;
}

function journeyVariationSummary(
  period: SchedulePeriod,
  periods: readonly SchedulePeriod[],
  data: FlightReferenceData,
) {
  const details = periods.map((entry) => journeyVariationDetails(entry.days[0], data));
  const index = periods.indexOf(period);
  const current = details[index] ?? journeyVariationDetails(period.days[0], data);
  const comparison = details[index > 0 ? index - 1 : Math.min(1, details.length - 1)];
  const changedFields = variationFields.filter(
    ({ key }) => comparison && current[key] !== comparison[key],
  );
  const relevantFields = changedFields.slice(0, 2);
  if (!relevantFields.length) {
    const previous = periods[index - 1];
    if (previous?.signature === period.signature) {
      const gap = Math.max(1, daysBetween(previous.end, period.start) - 1);
      return `Same itinerary · resumes after ${gap} day${gap === 1 ? '' : 's'} without service`;
    }
    return current.schedule;
  }
  return relevantFields.map(({ key, label }) => `${label}: ${current[key]}`).join(' · ');
}

type VariationDetailKey =
  | 'status'
  | 'route'
  | 'aircraft'
  | 'configuration'
  | 'operatedAs'
  | 'schedule'
  | 'utcOffsets'
  | 'duration'
  | 'serviceType'
  | 'owner';

const variationFields: ReadonlyArray<{ key: VariationDetailKey; label: string }> = [
  { key: 'status', label: 'Status' },
  { key: 'route', label: 'Route' },
  { key: 'aircraft', label: 'Aircraft' },
  { key: 'configuration', label: 'Configuration' },
  { key: 'operatedAs', label: 'Operated as' },
  { key: 'schedule', label: 'Schedule' },
  { key: 'utcOffsets', label: 'UTC offsets' },
  { key: 'duration', label: 'Duration' },
  { key: 'serviceType', label: 'Service' },
  { key: 'owner', label: 'Owner' },
];

function journeyVariationDetails(
  day: JourneyDay,
  data: FlightReferenceData,
): Record<VariationDetailKey, string> {
  return {
    status: summarizeLegValues(day, (item) => (isCancelled(item) ? 'Cancelled' : 'Scheduled')),
    route: journeyLabel(day, data),
    aircraft: summarizeLegValues(day, (item) => {
      const variant = displayVariantFor(data, item);
      return variant ? (data.aircraft[variant.aircraftId]?.name ?? variant.aircraftId) : 'Unknown';
    }),
    configuration: summarizeLegValues(day, (item) => {
      const variant = displayVariantFor(data, item);
      return variant ? configurationLabel(variant, data) : 'Unknown';
    }),
    operatedAs: summarizeLegValues(day, (item) => {
      const variant = displayVariantFor(data, item);
      return variant ? flightName(variant.operatedAs, data.airlines) : 'Unknown';
    }),
    schedule: summarizeLegValues(day, (item) => {
      const variant = displayVariantFor(data, item);
      const from = data.airports[item.departureAirportId]?.iataCode ?? item.departureAirportId;
      if (!variant) {
        return `${from} cancelled`;
      }
      const to = data.airports[variant.arrivalAirportId]?.iataCode ?? variant.arrivalAirportId;
      const departure = departureScheduleTime(item.departureDateLocal, variant);
      const arrival = arrivalScheduleTime(item.departureDateLocal, variant);
      return `${from} ${departure.time} → ${to} ${arrival.time}${dayDeltaLabel(arrival.dayDelta)}`;
    }),
    utcOffsets: summarizeLegValues(day, (item) => {
      const variant = displayVariantFor(data, item);
      return variant
        ? `${formatUtcOffset(variant.departureUtcOffsetSeconds)} → ${formatUtcOffset(variant.arrivalUtcOffsetSeconds)}`
        : 'Unknown';
    }),
    duration: summarizeLegValues(day, (item) => {
      const variant = displayVariantFor(data, item);
      return variant ? duration(variant.durationSeconds) : 'Unknown';
    }),
    serviceType: summarizeLegValues(
      day,
      (item) => displayVariantFor(data, item)?.serviceType || '—',
    ),
    owner: summarizeLegValues(day, (item) => displayVariantFor(data, item)?.aircraftOwner || '—'),
  };
}

function summarizeLegValues(day: JourneyDay, valueFor: (item: FlightScheduleItem) => string) {
  const values = day.legs.map(valueFor);
  return new Set(values).size === 1
    ? values[0]
    : values.map((value, index) => `L${index + 1} ${value}`).join(' / ');
}

function configurationLabel(
  variant: FlightScheduleVariant,
  data: FlightReferenceData,
  includeIdentifier = false,
) {
  const configuration = variant.aircraftConfigurationVersion;
  if (!configuration) {
    return 'No configuration';
  }
  const operatingAirlineId =
    data.airlines[variant.operatedAs.airlineId]?.iataCode ?? variant.operatedAs.airlineId;
  const aircraftId = data.aircraft[variant.aircraftId]?.iataCode ?? variant.aircraftId;
  const names = aircraftConfigurationNames(operatingAirlineId, aircraftId, configuration);
  if (!names) {
    return configuration;
  }
  const name = includeIdentifier ? names.name : names.shortName;
  return includeIdentifier && name !== configuration ? `${name} (${configuration})` : name;
}

function countBy(
  items: readonly FlightScheduleItem[],
  keyFn: (item: FlightScheduleItem) => string,
) {
  const values = new Map<string, number>();
  for (const item of items) {
    const key = keyFn(item);
    if (key) {
      values.set(key, (values.get(key) ?? 0) + 1);
    }
  }
  return [...values]
    .map(([key, count]) => ({ key, count }))
    .sort((left, right) => right.count - left.count || left.key.localeCompare(right.key));
}

function groupByDate(items: readonly FlightScheduleItem[]) {
  const result = new Map<string, FlightScheduleItem[]>();
  for (const item of items) {
    result.set(item.departureDateLocal, [...(result.get(item.departureDateLocal) ?? []), item]);
  }
  return result;
}

function groupJourneyDays(
  items: readonly FlightScheduleItem[],
  data: FlightSchedules,
): JourneyDay[] {
  return [...groupByDate(items).entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([date, legs]) => ({ date, legs: orderJourneyLegs(legs, data) }));
}

function orderJourneyLegs(items: readonly FlightScheduleItem[], data: FlightReferenceData) {
  const remaining = [...items];
  const arrivals = new Set(
    remaining.flatMap((item) => {
      const variant = displayVariantFor(data, item);
      return variant ? [variant.arrivalAirportId] : [];
    }),
  );
  const byTime = (left: FlightScheduleItem, right: FlightScheduleItem) =>
    legDepartureInstant(left, data) - legDepartureInstant(right, data) ||
    left.departureAirportId.localeCompare(right.departureAirportId);
  const ordered: FlightScheduleItem[] = [];
  let current =
    remaining.filter((item) => !arrivals.has(item.departureAirportId)).sort(byTime)[0] ??
    remaining.sort(byTime)[0];
  while (current) {
    ordered.push(current);
    remaining.splice(remaining.indexOf(current), 1);
    const arrival = displayVariantFor(data, current)?.arrivalAirportId;
    current =
      (arrival ? remaining.filter((item) => item.departureAirportId === arrival) : []).sort(
        byTime,
      )[0] ?? remaining.sort(byTime)[0];
  }
  return ordered;
}

function journeySignature(day: JourneyDay, data: FlightSchedules) {
  return day.legs.map((item) => scheduleSignature(item, data)).join('>>');
}

function journeyLabel(day: JourneyDay, data: FlightReferenceData) {
  if (day.legs.some(isCancelled)) {
    return day.legs
      .map((item) => {
        const from = data.airports[item.departureAirportId]?.iataCode ?? item.departureAirportId;
        const variant = displayVariantFor(data, item);
        if (!variant) {
          return `${from} cancelled`;
        }
        const to = data.airports[variant.arrivalAirportId]?.iataCode ?? variant.arrivalAirportId;
        return `${from} → ${to}${isCancelled(item) ? ' cancelled' : ''}`;
      })
      .join(' · ');
  }
  const airports: string[] = [];
  for (const item of day.legs) {
    const from = data.airports[item.departureAirportId]?.iataCode ?? item.departureAirportId;
    const variant = displayVariantFor(data, item);
    const to = variant
      ? (data.airports[variant.arrivalAirportId]?.iataCode ?? variant.arrivalAirportId)
      : undefined;
    if (!airports.length || airports.at(-1) !== from) {
      airports.push(from);
    }
    if (to && airports.at(-1) !== to) {
      airports.push(to);
    }
  }
  return airports.join(' → ');
}

function countJourneyPatterns(days: readonly JourneyDay[], data: FlightSchedules) {
  const counts = new Map<string, { label: string; count: number }>();
  for (const day of days) {
    const key = day.legs.map((item) => routeKey(item, data) || item.departureAirportId).join('>>');
    const current = counts.get(key);
    counts.set(key, { label: journeyLabel(day, data), count: (current?.count ?? 0) + 1 });
  }
  return [...counts.entries()]
    .map(([key, value]) => ({ key, ...value }))
    .sort((left, right) => right.count - left.count || left.label.localeCompare(right.label));
}

function connectionLabel(
  current: FlightScheduleItem,
  next: FlightScheduleItem,
  data: FlightReferenceData,
) {
  const currentVariant = displayVariantFor(data, current);
  const nextVariant = displayVariantFor(data, next);
  if (!currentVariant || !nextVariant) {
    return undefined;
  }
  if (currentVariant.arrivalAirportId !== next.departureAirportId) {
    return 'Separate published leg';
  }
  const connectionAirport =
    data.airports[currentVariant.arrivalAirportId]?.iataCode ?? currentVariant.arrivalAirportId;
  const gapSeconds = Math.round(
    (legDepartureInstant(next, data) -
      (legDepartureInstant(current, data) + currentVariant.durationSeconds * 1000)) /
      1000,
  );
  if (gapSeconds >= 0 && gapSeconds < 86_400) {
    return `${isCancelled(current) || isCancelled(next) ? 'Planned ' : ''}${duration(gapSeconds)} stopover in ${connectionAirport}`;
  }
  return `${isCancelled(current) || isCancelled(next) ? 'Planned to continue' : 'Continues'} via ${connectionAirport}`;
}

function legDepartureInstant(item: FlightScheduleItem, data: FlightReferenceData) {
  const variant = displayVariantFor(data, item);
  if (!variant) {
    return Number.MAX_SAFE_INTEGER;
  }
  return (
    Date.parse(`${item.departureDateLocal}T${variant.departureTimeLocal}Z`) -
    variant.departureUtcOffsetSeconds * 1000
  );
}

function departureDateForBasis(
  item: FlightScheduleItem,
  data: FlightReferenceData,
  basis: DateBasis,
) {
  if (basis === 'local' || !displayVariantFor(data, item)) {
    return item.departureDateLocal;
  }
  return new Date(legDepartureInstant(item, data)).toISOString().slice(0, 10);
}

function matchesDateRange(date: string, from: string, to: string) {
  return date >= from && date <= to;
}

function uniqueDateCount(items: readonly FlightScheduleItem[]) {
  return new Set(items.map((item) => item.departureDateLocal)).size;
}

function routeKey(item: FlightScheduleItem, data: FlightSchedules) {
  const variant = displayVariantFor(data, item);
  return variant ? `${item.departureAirportId}>${variant.arrivalAirportId}` : '';
}
function scheduleSignature(item: FlightScheduleItem, data: FlightSchedules) {
  return `${item.departureAirportId}|${isCancelled(item) ? 'cancelled|' : ''}${variantSignature(displayVariantFor(data, item))}`;
}
function isCancelled(item: FlightScheduleItem) {
  return item.flightVariantId == null;
}

function variantSignature(variant: FlightScheduleVariant | undefined) {
  if (!variant) {
    return '';
  }
  const operatedAs = `${variant.operatedAs.airlineId}-${variant.operatedAs.number}-${variant.operatedAs.suffix ?? ''}`;
  return [
    operatedAs,
    variant.departureTimeLocal,
    variant.departureUtcOffsetSeconds,
    variant.durationSeconds,
    variant.arrivalAirportId,
    variant.arrivalUtcOffsetSeconds,
    variant.aircraftOwner,
    variant.aircraftId,
    variant.aircraftConfigurationVersion,
    variant.serviceType,
  ].join('|');
}
function routeLabel(key: string, data: Pick<FlightSchedules, 'airports'>) {
  const [from, to] = key.split('>');
  return `${data.airports[from]?.iataCode ?? from} → ${data.airports[to]?.iataCode ?? to}`;
}
function weekdayOf(item: FlightScheduleItem) {
  return new Date(`${item.departureDateLocal}T12:00:00Z`).getUTCDay();
}
function isNextDay(left: string, right: string) {
  return daysBetween(left, right) === 1;
}
function changePeriodDateSummary(period: SchedulePeriod) {
  const runs = dateRuns(period.days);
  const fullLabel = runs.map((run) => formatRange(run.start, run.end)).join(' · ');
  const firstRun = runs[0];
  const lastRun = runs.at(-1);
  if (!firstRun || !lastRun) {
    return { label: 'No dates', detail: '0 departure dates', fullLabel: '' };
  }
  if (runs.length === 1) {
    return {
      label: fullLabel,
      detail: `${period.days.length} departure date${period.days.length === 1 ? '' : 's'}`,
      fullLabel,
    };
  }
  return {
    label: `${period.days.length} dates across ${runs.length} date ranges`,
    detail: `${formatRange(firstRun.start, firstRun.end)} · ${formatRange(lastRun.start, lastRun.end)}`,
    fullLabel,
  };
}

function dateRuns(days: readonly JourneyDay[]) {
  const sortedDates = [...new Set(days.map((day) => day.date))].sort();
  const runs: { start: string; end: string }[] = [];
  for (const date of sortedDates) {
    const run = runs.at(-1);
    if (run && isNextDay(run.end, date)) {
      run.end = date;
    } else {
      runs.push({ start: date, end: date });
    }
  }
  return runs;
}

function scheduleViewDescription(
  view: ScheduleView,
  periods: readonly SchedulePeriod[],
  changePeriodCount: number,
) {
  switch (view) {
    case 'periods':
      return periodViewLabel(periods);
    case 'calendar':
      return 'Full-year schedule · filtered dates are dimmed';
    case 'dates':
      return 'Exact dated schedule records';
    case 'changes':
      return `${changePeriodCount} grouped revision event${changePeriodCount === 1 ? '' : 's'}`;
  }
}

function periodFrequencyLabel(day: JourneyDay, periodDayCount: number) {
  if (day.legs.length > 1) {
    return `${day.legs.length}-leg journey`;
  }

  if (periodDayCount > 1) {
    return 'Daily in this period';
  }

  return weekdayLabels[weekdayOf(day.legs[0])];
}

function VariantComparison({
  item,
  variant,
  data,
}: {
  item: FlightScheduleItem;
  variant: FlightScheduleVariant | undefined;
  data: FlightReferenceData;
}) {
  if (!variant) {
    return <span className='change-status-off'>Cancelled</span>;
  }

  return <VariantSnapshot item={item} variant={variant} data={data} compact />;
}

function ChangeBadges({ changes }: { changes: readonly FieldChange[] }) {
  if (changes.length === 0) {
    return <Badge>No published field difference</Badge>;
  }

  return changes.slice(0, 4).map((change) => (
    <Badge key={change.key} tone='amber'>
      {change.label}
    </Badge>
  ));
}

function changeRouteLabel(
  departure: string,
  current: FlightScheduleVariant | undefined,
  previous: FlightScheduleVariant | undefined,
  data: FlightReferenceData,
) {
  if (current) {
    const arrival = data.airports[current.arrivalAirportId]?.iataCode ?? current.arrivalAirportId;
    return `${departure} → ${arrival}`;
  }

  if (previous) {
    const arrival = data.airports[previous.arrivalAirportId]?.iataCode ?? previous.arrivalAirportId;
    return `${departure} → ${arrival} · Cancelled`;
  }

  return `${departure} · Cancelled`;
}

function cadenceLabel(coverage: number, weekdayCount: number) {
  if (coverage > 0.98) {
    return 'Daily service';
  }

  if (coverage >= 0.85) {
    return 'Near-daily service';
  }

  return `${weekdayCount} day${weekdayCount === 1 ? '' : 's'} weekly`;
}

function ordinalSuffix(value: number) {
  switch (value % 10) {
    case 1:
      return 'st';
    case 2:
      return 'nd';
    case 3:
      return 'rd';
    default:
      return 'th';
  }
}

function formatFilterDate(date: string) {
  return dateLabel(date, { year: 'numeric', month: 'short', day: 'numeric' });
}
function ordinal(value: number) {
  const remainder = value % 100;
  if (remainder >= 11 && remainder <= 13) {
    return `${value}th`;
  }
  return `${value}${ordinalSuffix(value)}`;
}
