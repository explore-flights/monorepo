import {
  CalendarDays,
  GitCompareArrows,
  List,
  Plane,
  RotateCcw,
  Search,
  Sparkles,
  Table2,
} from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import type { FlightSchedules } from '@/api/types';
import { Button, Card, EmptyState } from '@/components/primitives';
import { ActiveFilterRow, ScheduleInsight, WeekdaySelect } from '@/components/ScheduleControls';
import { ScheduleScopeTabs } from '@/components/ScheduleScopeTabs';
import { SimpleSelect } from '@/components/SimpleSelect';
import { TemporalInput } from '@/components/TemporalInput';
import { countBy, isOneOf } from '@/lib/collections';
import {
  dateBases,
  localDate,
  matchingScheduleScope,
  rangeForYearScope as rangeForPreset,
  type DateBasis,
} from '@/lib/date';
import { dateRangeLabel as formatRange } from '@/lib/format';
import { displayVariantFor, isCancelledScheduleItem as isCancelled } from '@/lib/schedules';
import { useCurrentDate } from '@/lib/useCurrentDate';
import { useHashView } from '@/lib/useHashView';
import { groupSchedulePeriods, type SchedulePeriod } from './schedulePeriods';
import { CalendarView } from './FlightScheduleCalendarView';
import { ChangesView } from './FlightScheduleChangesView';
import { DatesView } from './FlightScheduleDatesView';
import {
  activeFilterChips,
  departureDateForBasis,
  groupChangePeriods,
  groupJourneyDays,
  journeyLabel,
  matchesDateRange,
  matchesFacets,
  periodSummary,
  PeriodsView,
  routeKey,
  routeLabel,
  scheduleInsights,
  scheduleViewDescription,
  uniqueDateCount,
  type FacetFilters,
  type ScheduleStatus,
  type ScheduleView,
} from './FlightScheduleWorkspaceDetails';

const scheduleStatuses = [
  'scheduled',
  'cancelled',
  'all',
] as const satisfies readonly ScheduleStatus[];
const scheduleViews = [
  'periods',
  'calendar',
  'dates',
  'changes',
] as const satisfies readonly ScheduleView[];

export function FlightScheduleWorkspace({
  data,
  flightNumber,
  year,
}: {
  data: FlightSchedules;
  flightNumber: string;
  year: number;
}) {
  const {
    view,
    hrefFor,
    selectView: selectHashView,
  } = useHashView<ScheduleView>('periods', scheduleViews);
  const currentDate = useCurrentDate();
  const today = localDate(currentDate);
  const utcToday = currentDate.toISOString().slice(0, 10);
  const yearStart = `${year}-01-01`;
  const yearEnd = `${year}-12-31`;
  const defaultRange = rangeForPreset('upcoming', year, today) ?? { from: yearStart, to: yearEnd };
  const [dateFrom, setDateFrom] = useState(defaultRange.from);
  const [dateTo, setDateTo] = useState(defaultRange.to);
  const [dateBasis, setDateBasis] = useState<DateBasis>('local');
  const [status, setStatus] = useState<ScheduleStatus>('scheduled');
  const [filters, setFilters] = useState<FacetFilters>({ text: '' });
  const [visible, setVisible] = useState(100);
  const [highlightedBlock, setHighlightedBlock] = useState<string>();
  const highlightTimerRef = useRef<number | undefined>(undefined);
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
  const filteredDateSet = useMemo(
    () => new Set(filteredItems.map((item) => item.departureDateLocal)),
    [filteredItems],
  );
  const changedDateSet = useMemo(
    () => new Set(changedItems.map((item) => item.departureDateLocal)),
    [changedItems],
  );
  const filteredDays = useMemo(
    () => allDays.filter((day) => filteredDateSet.has(day.date)),
    [allDays, filteredDateSet],
  );
  const filteredOutDays = useMemo(
    () => allDays.filter((day) => !filteredDateSet.has(day.date)),
    [allDays, filteredDateSet],
  );
  const changedDays = useMemo(
    () => allDays.filter((day) => changedDateSet.has(day.date)),
    [allDays, changedDateSet],
  );
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
    selectHashView(next);
    resetPagination();
  }
  function inspectRange(from: string, to: string, nextView: ScheduleView = 'dates') {
    applyDateRange(from, to);
    selectHashView(nextView);
  }
  function clearAll() {
    applyDateRange('', '');
    setDateBasis('local');
    setStatus('scheduled');
    setFilters({ text: '' });
    if (view === 'changes') {
      selectHashView('periods');
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
    const blockStart = period.start;
    selectHashView('periods');
    setHighlightedBlock(blockStart);
    window.clearTimeout(highlightTimerRef.current);
    window.requestAnimationFrame(() =>
      window.requestAnimationFrame(() =>
        document
          .getElementById(`schedule-period-${blockStart}`)
          ?.scrollIntoView({ behavior: 'smooth', block: 'center' }),
      ),
    );
    highlightTimerRef.current = window.setTimeout(() => setHighlightedBlock(undefined), 2400);
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
            <WeekdaySelect
              value={filters.weekday ?? ''}
              onChange={(event) =>
                updateFilters({
                  ...filters,
                  weekday: event.target.value === '' ? undefined : Number(event.target.value),
                })
              }
            />
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
            <TemporalInput
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
            <TemporalInput
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
              selectHashView('periods');
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
            onClick={() => selectHashView('periods')}
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

      <div className='workspace-viewbar' id='flight-schedule-viewbar'>
        <div className='workspace-view-tabs' aria-label='Schedule view'>
          {(
            [
              ['periods', 'Periods', List],
              ['calendar', 'Calendar', CalendarDays],
              ['dates', 'Dates', Table2],
              ['changes', 'Changes', GitCompareArrows],
            ] as const
          ).map(([key, label, Icon]) => (
            <Link
              key={key}
              id={key === 'periods' ? undefined : key}
              to={hrefFor(key)}
              aria-current={view === key ? 'page' : undefined}
              className={view === key ? 'active' : ''}
              onClick={resetPagination}
            >
              <Icon size={15} />
              <span>{label}</span>
              {key === 'changes' && <b>{changedCount}</b>}
            </Link>
          ))}
        </div>
        <p className={view === 'dates' ? 'workspace-view-summary' : undefined}>
          {scheduleViewDescription(view, periods, changePeriods.length, filteredDays)}
        </p>
      </div>

      {view === 'dates' && (filteredDays.length > 0 || filteredOutDays.length > 0) && (
        <DatesView
          key={filteredDays.length === 0 ? 'only-filtered-out' : 'matching-days'}
          days={filteredDays}
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
        (view !== 'dates' || filteredOutDays.length === 0) && (
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
