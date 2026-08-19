import { BarChart3, CalendarDays, Gauge } from 'lucide-react';
import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import type { AirportMovementDirection, AirportSummary } from '@/api/types';
import { CalendarDateButton, YearCalendar } from '@/components/YearCalendar';
import { Card, EmptyState, Stat } from '@/components/primitives';
import {
  aircraftName,
  airportCode,
  airportName,
  duration,
  fullDateLabel,
  numberLabel,
} from '@/lib/format';
import { AirportDirectionControl } from './AirportDirectionControl';
import { aggregateAirportRoutes, directionStatistics, equipmentUtilization } from './airportData';

export function AirportStatistics({
  summary,
  direction,
  onDirectionChange,
  onDateSelect,
}: {
  summary: AirportSummary;
  direction: AirportMovementDirection;
  onDirectionChange: (direction: AirportMovementDirection) => void;
  onDateSelect: (date: string) => void;
}) {
  const active = directionStatistics(summary, direction);
  const routes = useMemo(() => aggregateAirportRoutes(active?.routes ?? []), [active]);
  const equipment = useMemo(() => equipmentUtilization(active?.routes ?? []), [active]);
  const longestRoutes = useMemo(
    () =>
      [...routes]
        .sort((left, right) => right.durationSecondsAverage - left.durationSecondsAverage)
        .slice(0, 10),
    [routes],
  );
  const daysByDate = useMemo(
    () => new Map(active?.days.map((day) => [day.dateLocal, day]) ?? []),
    [active],
  );
  const dailyCounts =
    active?.days.map((day) => day.scheduledLegs).filter((count) => count > 0) ?? [];
  const minimumDayCount = dailyCounts.length > 0 ? Math.min(...dailyCounts) : 0;
  const maximumDayCount = dailyCounts.length > 0 ? Math.max(...dailyCounts) : 1;

  return (
    <section className='airport-subpage'>
      <div className='section-heading airport-view-heading'>
        <div>
          <span className='eyebrow'>Annual statistics</span>
          <h2>
            {summary.year} {direction === 'departure' ? 'departures' : 'arrivals'}
          </h2>
          <p>Exact scheduled movement counts and duration statistics.</p>
        </div>
        <AirportDirectionControl
          summary={summary}
          direction={direction}
          onChange={onDirectionChange}
        />
      </div>

      {active ? (
        <>
          <div className='stats-grid airport-statistics-metrics'>
            <Stat label='Scheduled legs' value={active.scheduledLegs} />
            <Stat
              label={direction === 'departure' ? 'Destinations' : 'Origins'}
              value={active.routeCount}
            />
            <Stat label='Operating airlines' value={active.airlineCount} />
            <Stat label='Equipment types' value={active.aircraftTypeCount} />
            <Stat
              label='Average duration'
              value={duration(active.durationSecondsAverage)}
              hint={`${duration(active.durationSecondsMedian)} median`}
            />
            <Stat
              label='Minimum duration'
              value={duration(active.durationSecondsMinimum)}
              hint={`${duration(active.durationSecondsMaximum)} maximum`}
            />
          </div>

          <Card className='airport-calendar-card'>
            <div className='card-heading'>
              <CalendarDays />
              <div>
                <h2>Daily scheduled activity</h2>
                <p>Select a populated day to open its timetable</p>
              </div>
              <div
                className='calendar-density-scale'
                aria-label={`Scheduled ${direction === 'departure' ? 'departure' : 'arrival'} scale from ${minimumDayCount} to ${maximumDayCount}`}
              >
                <span>{minimumDayCount}</span>
                <b aria-hidden='true' />
                <span>
                  {maximumDayCount} {direction === 'departure' ? 'departures' : 'arrivals'}
                </span>
              </div>
            </div>
            <YearCalendar
              year={summary.year}
              renderDay={({ date, day }) => {
                const statistic = daysByDate.get(date);
                const label = fullDateLabel(date);
                if (!statistic?.scheduledLegs) {
                  return (
                    <CalendarDateButton
                      key={date}
                      day={day}
                      disabled
                      title={`${label} · No scheduled ${direction === 'departure' ? 'departures' : 'arrivals'}`}
                      aria-label={`${label}, no scheduled ${direction === 'departure' ? 'departures' : 'arrivals'}`}
                    />
                  );
                }

                return (
                  <CalendarDateButton
                    key={date}
                    day={day}
                    density={statistic.scheduledLegs / maximumDayCount}
                    title={`${label} · ${statistic.scheduledLegs} scheduled ${direction === 'departure' ? 'departures' : 'arrivals'}`}
                    aria-label={`${label}, ${statistic.scheduledLegs} scheduled ${direction === 'departure' ? 'departures' : 'arrivals'}; open timetable`}
                    onClick={() => onDateSelect(date)}
                  />
                );
              }}
            />
          </Card>

          <div className='airport-analytics-grid airport-statistics-grid'>
            <Card className='airport-analytics-card'>
              <div className='card-heading'>
                <Gauge />
                <div>
                  <h2>Equipment utilization</h2>
                  <p>Scheduled share across all direct movements</p>
                </div>
              </div>
              <div className='airport-ranking-list'>
                {equipment.slice(0, 12).map((item, index) => {
                  return (
                    <div key={item.aircraftId}>
                      <span>{index + 1}</span>
                      <div>
                        <strong>{aircraftName(item.aircraftId, summary.aircraft)}</strong>
                        <small>
                          {item.routeCount} {item.routeCount === 1 ? 'route' : 'routes'} ·{' '}
                          {item.airlineIds.length} operating{' '}
                          {item.airlineIds.length === 1 ? 'airline' : 'airlines'}
                        </small>
                      </div>
                      <div>
                        <strong>{numberLabel(item.scheduledLegs)}</strong>
                        <small>{(item.share * 100).toFixed(1)}%</small>
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>

            <Card className='airport-analytics-card'>
              <div className='card-heading'>
                <BarChart3 />
                <div>
                  <h2>Longest routes by average scheduled duration</h2>
                  <p>Weighted across airline and equipment subgroups</p>
                </div>
              </div>
              <div className='airport-ranking-list'>
                {longestRoutes.map((route, index) => {
                  return (
                    <div key={route.otherAirportId}>
                      <span>{index + 1}</span>
                      <div>
                        <Link to={`/airport/${route.otherAirportId}`}>
                          <strong>{airportCode(route.otherAirportId, summary.airports)}</strong>{' '}
                          {airportName(route.otherAirportId, summary.airports)}
                        </Link>
                        <small>{numberLabel(route.scheduledLegs)} scheduled legs</small>
                      </div>
                      <strong>{duration(route.durationSecondsAverage)}</strong>
                    </div>
                  );
                })}
              </div>
            </Card>
          </div>
        </>
      ) : (
        <EmptyState
          title={`No ${direction === 'departure' ? 'departure' : 'arrival'} statistics`}
          description='This year has no scheduled movements in the selected direction.'
        />
      )}
    </section>
  );
}
