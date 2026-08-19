import { Map as MapIcon, Plane, TableProperties, TrendingUp } from 'lucide-react';
import { barY, defineChart } from '@tanstack/charts';
import { Chart } from '@tanstack/charts/react';
import { scaleBand } from '@tanstack/charts/scales/band';
import { scaleLinear } from '@tanstack/charts/scales/linear';
import { tooltip } from '@tanstack/charts/tooltip';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import type {
  FlightScheduleItem,
  OperatingFlightScheduleItem,
  QuerySchedulesResponse,
} from '@/api/types';
import { FlightMap } from '@/components/FlightMap';
import { Card, Stat } from '@/components/primitives';
import { SimpleSelect } from '@/components/SimpleSelect';
import { calendarColorCount } from '@/components/YearCalendar';
import { isDefined } from '@/lib/collections';
import { compactNumberLabel, flightName, numberLabel } from '@/lib/format';
import { isOperatingScheduleItem } from '@/lib/schedules';
import { useHashView } from '@/lib/useHashView';
import {
  FleetHighlightControls,
  fleetHighlightValue,
  type FleetHighlight,
} from '@/features/fleet/fleetHighlights';
import {
  FleetScheduleWorkspace,
  type FleetSchedulePreset,
} from '@/features/fleet/FleetScheduleWorkspace';

type ResultsTab = 'overview' | 'map' | 'schedule';
const resultsTabs = ['overview', 'map', 'schedule'] as const satisfies readonly ResultsTab[];
const monthShortFormatter = new Intl.DateTimeFormat(undefined, { month: 'short' });
const calendarHighlightColors = Array.from(
  { length: calendarColorCount },
  (_, index) => `var(--calendar-highlight-${index})`,
);

export function ScheduleResults({
  data,
  year: fixedYear,
  scheduleTitle = 'Schedule results',
}: {
  data: QuerySchedulesResponse;
  year?: number;
  scheduleTitle?: string;
}) {
  const availableYears = useMemo(() => scheduleResultYears(data), [data]);
  const [selectedYear, setSelectedYear] = useState(
    () => fixedYear ?? preferredResultYear(availableYears),
  );
  const year = fixedYear ?? selectedYear;
  const resultData = useMemo(() => scheduleResultsForYear(data, year), [data, year]);
  const { view: tab, hrefFor, selectView } = useHashView<ResultsTab>('overview', resultsTabs);
  const [schedulePreset, setSchedulePreset] = useState<FleetSchedulePreset & { key: number }>({
    key: 0,
  });
  const rows = flatten(resultData);
  const operating = rows.filter(isOperatingRow);
  const directionalRoutes = uniqueRoutes(resultData, operating);
  const routePairs = combineRoutePairs(directionalRoutes);
  const mapRoutes = routePairs.map((route) => ({
    from: route.from,
    to: route.to,
    label: route.label,
    frequency: route.count,
  }));
  const types = [
    ...new Set(
      operating
        .map((row) => resultData.variants[row.item.flightVariantId]?.aircraftId)
        .filter(isDefined),
    ),
  ];

  function openSchedule(preset: FleetSchedulePreset = {}) {
    setSchedulePreset((current) => ({ ...preset, key: current.key + 1 }));
    selectView('schedule');
  }

  return (
    <>
      <div className='schedule-results-nav'>
        <nav className='subnav'>
          <Link
            to={hrefFor('overview')}
            className={tab === 'overview' ? 'active' : ''}
            aria-current={tab === 'overview' ? 'page' : undefined}
          >
            <TrendingUp size={16} />
            Overview
          </Link>
          <Link
            id='map'
            to={hrefFor('map')}
            className={tab === 'map' ? 'active' : ''}
            aria-current={tab === 'map' ? 'page' : undefined}
          >
            <MapIcon size={16} />
            Map
          </Link>
          <Link
            id='schedule'
            to={hrefFor('schedule')}
            className={tab === 'schedule' ? 'active' : ''}
            aria-current={tab === 'schedule' ? 'page' : undefined}
          >
            <TableProperties size={16} />
            Schedule
          </Link>
        </nav>
        {!fixedYear && availableYears.length > 1 && (
          <label className='schedule-results-year'>
            <span>Result year</span>
            <SimpleSelect
              aria-label='Result year'
              value={year}
              onChange={(event) => setSelectedYear(Number(event.target.value))}
            >
              {availableYears.map((availableYear) => (
                <option key={availableYear} value={availableYear}>
                  {availableYear}
                </option>
              ))}
            </SimpleSelect>
          </label>
        )}
      </div>

      {tab === 'overview' && (
        <ScheduleOverview
          data={resultData}
          rows={operating}
          directionalRoutes={directionalRoutes}
          routePairs={routePairs}
          types={types}
          year={year}
          onOpenSchedule={openSchedule}
        />
      )}
      {tab === 'map' && (
        <section className='airport-subpage'>
          <div className='section-heading'>
            <div>
              <span className='eyebrow'>Published network</span>
              <h2>{numberLabel(mapRoutes.length)} route pairs</h2>
              <p>
                Labels show total published departures in either direction in {year}; stronger color
                indicates higher frequency.
              </p>
            </div>
          </div>
          <FlightMap routes={mapRoutes} height={610} />
        </section>
      )}
      {tab === 'schedule' && (
        <FleetScheduleWorkspace
          key={`${year}-${schedulePreset.key}`}
          data={resultData}
          year={year}
          preset={schedulePreset}
          title={scheduleTitle}
        />
      )}
    </>
  );
}

function ScheduleOverview({
  data,
  rows,
  directionalRoutes,
  routePairs,
  types,
  year,
  onOpenSchedule,
}: {
  data: QuerySchedulesResponse;
  rows: OperatingRow[];
  directionalRoutes: ReturnType<typeof uniqueRoutes>;
  routePairs: ReturnType<typeof combineRoutePairs>;
  types: string[];
  year: number;
  onOpenSchedule: (preset?: FleetSchedulePreset) => void;
}) {
  const [highlight, setHighlight] = useState<FleetHighlight>('aircraft');
  const flightNumbers = new Set(rows.map((row) => flightName(row.flightNumber, data.airlines)));
  const airports = new Set(routePairs.flatMap((route) => [route.from.id, route.to.id]));
  const highlightValues = useMemo(() => {
    if (highlight === 'none') {
      return [];
    }

    return [
      ...new Map(
        rows.flatMap((row) => {
          const variant = data.variants[row.item.flightVariantId];
          if (!variant) {
            return [];
          }
          const value = fleetHighlightValue(variant, highlight, data);
          return [[value.key, value.label] as const];
        }),
      ).entries(),
    ];
  }, [data, highlight, rows]);
  const highlightIndex = new Map(
    highlightValues.map(([key], index) => [key, index % calendarColorCount]),
  );
  const monthly = useMemo(() => {
    const rowsByMonth = Array.from({ length: 12 }, (): OperatingRow[] => []);
    for (const row of rows) {
      rowsByMonth[Number(row.item.departureDateLocal.slice(5, 7)) - 1].push(row);
    }

    return rowsByMonth.map((monthRows, index) => {
      const groupCounts = new Map<string, number>();
      if (highlight !== 'none') {
        for (const row of monthRows) {
          const variant = data.variants[row.item.flightVariantId];
          if (!variant) {
            continue;
          }
          const value = fleetHighlightValue(variant, highlight, data);
          groupCounts.set(value.key, (groupCounts.get(value.key) ?? 0) + 1);
        }
      }
      return { month: index + 1, total: monthRows.length, groups: [...groupCounts.entries()] };
    });
  }, [data, highlight, rows]);
  const chartDefinition = useMemo(() => {
    const monthLabels = monthly.map((month) =>
      monthShortFormatter.format(new Date(2020, month.month - 1)),
    );
    const seriesLabels = new Map(highlightValues);
    const chartRows = monthly.flatMap((month) => {
      const label = monthLabels[month.month - 1] ?? String(month.month);

      if (highlight === 'none') {
        return [
          {
            month: month.month,
            label,
            seriesKey: 'all',
            series: 'All departures',
            departures: month.total,
          },
        ];
      }

      return month.groups.map(([seriesKey, departures]) => ({
        month: month.month,
        label,
        seriesKey,
        series: seriesLabels.get(seriesKey) ?? seriesKey,
        departures,
      }));
    });
    const colorDomain =
      highlight === 'none'
        ? ['All departures']
        : highlightValues.map(([, seriesLabel]) => seriesLabel);
    const colorRange =
      highlight === 'none'
        ? ['var(--fleet-accent)']
        : colorDomain.map((_, index) => calendarHighlightColors[index % calendarColorCount]);

    return defineChart({
      marks: [
        barY(chartRows, {
          x: 'label',
          y: 'departures',
          z: 'series',
          color: 'series',
          key: (row) => `${row.month}-${row.seriesKey}`,
          inset: 2,
          maxThickness: 24,
          radius: 2,
        }),
      ],
      x: {
        scale: () => scaleBand<string>().domain(monthLabels).padding(0.2),
      },
      y: {
        scale: scaleLinear,
        nice: true,
        grid: true,
        axis: {
          ticks: { count: 4, format: compactNumberLabel },
        },
      },
      color: { domain: colorDomain, range: colorRange },
      focus: 'group-x',
      maxFocusDistance: Number.POSITIVE_INFINITY,
      svgAnimation: true,
      tooltip,
    });
  }, [highlight, highlightValues, monthly]);

  function openMonth(month: number) {
    onOpenSchedule({
      from: `${year}-${String(month).padStart(2, '0')}-01`,
      to: `${year}-${String(month).padStart(2, '0')}-${String(new Date(year, month, 0).getDate()).padStart(2, '0')}`,
    });
  }

  return (
    <>
      <div className='stats-grid'>
        <Stat label='Scheduled departures' value={rows.length} hint={`Across ${year}`} />
        <Stat label='Flight numbers' value={flightNumbers.size} />
        <Stat
          label='Route pairs'
          value={routePairs.length}
          hint={`${directionalRoutes.length} directional routes`}
        />
        <Stat
          label='Airports served'
          value={airports.size}
          hint={`${types.length} aircraft type${types.length === 1 ? '' : 's'}`}
        />
      </div>
      <div className='fleet-overview-grid'>
        <Card className='activity-chart'>
          <div className='activity-chart-heading'>
            <div className='card-heading'>
              <TrendingUp />
              <div>
                <h2>Published departures over time</h2>
                <p>Published departures by month</p>
              </div>
            </div>
            <FleetHighlightControls
              value={highlight}
              onChange={setHighlight}
              ariaLabel='Monthly chart highlight'
            />
          </div>
          {highlight !== 'none' && (
            <div className='calendar-legend activity-chart-legend'>
              <div className='calendar-legend-values'>
                {highlightValues.map(([key, label]) => (
                  <span key={key}>
                    <i className={`highlight-${highlightIndex.get(key)}`} />
                    {label}
                  </span>
                ))}
              </div>
            </div>
          )}
          <Chart
            definition={chartDefinition}
            height={235}
            className='activity-tanstack-chart'
            ariaLabel={`Published departures by month in ${year}`}
            ariaDescription='Select a bar with a pointer or keyboard to open that month in the schedule.'
            onSelect={(point) => {
              if (point) {
                openMonth(point.datum.month);
              }
            }}
          />
        </Card>
        <Card className='route-ranking'>
          <div className='card-heading'>
            <Plane />
            <div>
              <h2>Frequent routes</h2>
              <p>Based on published departures</p>
            </div>
          </div>
          <div>
            {routePairs.slice(0, 8).map((route, index) => (
              <button key={route.key} onClick={() => onOpenSchedule({ routePair: route.key })}>
                <span>{index + 1}</span>
                <strong>
                  {route.from.iataCode}
                  <span aria-hidden='true'>↔</span>
                  {route.to.iataCode}
                </strong>
                <em>{numberLabel(route.count)} departures</em>
              </button>
            ))}
          </div>
        </Card>
      </div>
    </>
  );
}

interface Row {
  flightNumber: QuerySchedulesResponse['schedules'][number]['flightNumber'];
  item: FlightScheduleItem;
}

interface OperatingRow extends Row {
  item: OperatingFlightScheduleItem;
}

function isOperatingRow(row: Row): row is OperatingRow {
  return isOperatingScheduleItem(row.item);
}

function flatten(data: QuerySchedulesResponse): Row[] {
  return data.schedules
    .flatMap((schedule) =>
      schedule.items.map((item) => ({ flightNumber: schedule.flightNumber, item })),
    )
    .sort((left, right) =>
      left.item.departureDateLocal.localeCompare(right.item.departureDateLocal),
    );
}

function uniqueRoutes(data: QuerySchedulesResponse, rows: OperatingRow[]) {
  const routes = new Map<
    string,
    {
      from: (typeof data.airports)[string];
      to: (typeof data.airports)[string];
      label: string;
      count: number;
    }
  >();
  for (const row of rows) {
    const variant = data.variants[row.item.flightVariantId];
    const from = data.airports[row.item.departureAirportId];
    const to = variant && data.airports[variant.arrivalAirportId];
    if (!from || !to) {
      continue;
    }
    const key = `${from.id}-${to.id}`;
    const current = routes.get(key);
    if (current) {
      current.count++;
    } else {
      routes.set(key, {
        from,
        to,
        label: flightName(row.flightNumber, data.airlines),
        count: 1,
      });
    }
  }
  return [...routes.values()].sort((left, right) => right.count - left.count);
}

function combineRoutePairs(routes: ReturnType<typeof uniqueRoutes>) {
  const pairs = new Map<
    string,
    {
      from: (typeof routes)[number]['from'];
      to: (typeof routes)[number]['to'];
      label: string;
      count: number;
      key: string;
    }
  >();
  for (const route of routes) {
    const [from, to] =
      route.from.id.localeCompare(route.to.id) <= 0
        ? [route.from, route.to]
        : [route.to, route.from];
    const key = `${from.id}-${to.id}`;
    const current = pairs.get(key);
    if (current) {
      current.count += route.count;
    } else {
      pairs.set(key, {
        from,
        to,
        label: `${from.iataCode}–${to.iataCode}`,
        count: route.count,
        key: `${from.id}<>${to.id}`,
      });
    }
  }
  return [...pairs.values()].sort((left, right) => right.count - left.count);
}

function scheduleResultYears(data: QuerySchedulesResponse): number[] {
  return [
    ...new Set(
      data.schedules.flatMap((schedule) =>
        schedule.items.map((item) => Number(item.departureDateLocal.slice(0, 4))),
      ),
    ),
  ]
    .filter(Number.isFinite)
    .sort((left, right) => right - left);
}

function preferredResultYear(years: number[]): number {
  const currentYear = new Date().getFullYear();
  return years.includes(currentYear) ? currentYear : (years[0] ?? currentYear);
}

function scheduleResultsForYear(
  data: QuerySchedulesResponse,
  year: number,
): QuerySchedulesResponse {
  const prefix = `${year}-`;
  return {
    ...data,
    schedules: data.schedules.flatMap((schedule) => {
      const items = schedule.items.filter((item) => item.departureDateLocal.startsWith(prefix));
      return items.length ? [{ ...schedule, items }] : [];
    }),
  };
}
