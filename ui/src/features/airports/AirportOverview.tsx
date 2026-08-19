import { ArrowRight, BarChart3, Globe2, PlaneTakeoff } from 'lucide-react';
import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import type { Airport, AirportMovementDirection, AirportSummary } from '@/api/types';
import { Card, EmptyState, Stat } from '@/components/primitives';
import { airportCode, airportName, duration, numberLabel } from '@/lib/format';
import { AirportDirectionControl } from './AirportDirectionControl';
import { AirportMonthlyChart } from './AirportMonthlyChart';
import { aggregateAirportRoutes, directionStatistics } from './airportData';

export function AirportOverview({
  airport,
  summary,
  direction,
  onDirectionChange,
}: {
  airport: Airport;
  summary: AirportSummary;
  direction: AirportMovementDirection;
  onDirectionChange: (direction: AirportMovementDirection) => void;
}) {
  const departures = directionStatistics(summary, 'departure');
  const arrivals = directionStatistics(summary, 'arrival');
  const active = directionStatistics(summary, direction);
  const routes = useMemo(
    () =>
      aggregateAirportRoutes(active?.routes ?? []).sort(
        (left, right) => right.scheduledLegs - left.scheduledLegs,
      ),
    [active],
  );

  return (
    <>
      <div className='stats-grid airport-summary-metrics'>
        <Stat label='Scheduled departures' value={departures?.scheduledLegs ?? 0} />
        <Stat label='Scheduled arrivals' value={arrivals?.scheduledLegs ?? 0} />
        <Stat
          label='Direct destinations'
          value={departures?.routeCount ?? 0}
          hint={`${numberLabel(arrivals?.routeCount ?? 0)} arrival origins`}
        />
        <Stat
          label='Median scheduled duration'
          value={active ? duration(active.durationSecondsMedian) : '—'}
          hint={
            active
              ? `${direction === 'departure' ? 'Departure' : 'Arrival'} average ${duration(active.durationSecondsAverage)}`
              : 'No scheduled duration'
          }
        />
      </div>

      <div className='airport-analytics-grid'>
        <Card className='airport-analytics-card airport-monthly-card'>
          <div className='card-heading'>
            <BarChart3 />
            <div>
              <h2>Monthly activity</h2>
              <p>Scheduled legs by airport-local month</p>
            </div>
          </div>
          <AirportMonthlyChart summary={summary} />
        </Card>
        <Card className='airport-analytics-card airport-busiest-routes'>
          <div className='card-heading airport-card-heading-responsive'>
            <PlaneTakeoff />
            <div>
              <h2>Busiest {direction === 'departure' ? 'destinations' : 'origins'}</h2>
              <p>Selected-year scheduled movements</p>
            </div>
            <AirportDirectionControl
              summary={summary}
              direction={direction}
              onChange={onDirectionChange}
            />
          </div>
          {routes.length > 0 ? (
            <div className='airport-ranked-routes'>
              {routes.slice(0, 8).map((route) => {
                return (
                  <Link key={route.otherAirportId} to={`/airport/${route.otherAirportId}`}>
                    <strong>{airportCode(route.otherAirportId, summary.airports)}</strong>
                    <span>{airportName(route.otherAirportId, summary.airports)}</span>
                    <small>
                      {numberLabel(route.scheduledLegs)} legs ·{' '}
                      {duration(route.durationSecondsAverage)} avg
                    </small>
                  </Link>
                );
              })}
              <Link className='airport-view-all' to='#routes'>
                View all <ArrowRight size={15} />
              </Link>
            </div>
          ) : (
            <EmptyState
              title={`No ${direction === 'departure' ? 'departures' : 'arrivals'} this year`}
              description='The annual summary has no scheduled movements in this direction.'
            />
          )}
        </Card>
      </div>

      <Card className='airport-facts airport-reference-card'>
        <div className='card-heading'>
          <Globe2 />
          <div>
            <h2>Airport details</h2>
            <p>Reference information</p>
          </div>
        </div>
        <AirportFacts airport={airport} />
      </Card>
    </>
  );
}

export function AirportFacts({ airport }: { airport: Airport }) {
  return (
    <dl>
      <div>
        <dt>IATA code</dt>
        <dd>{airport.iataCode}</dd>
      </div>
      <div>
        <dt>ICAO code</dt>
        <dd>{airport.icaoCode ?? '—'}</dd>
      </div>
      <div>
        <dt>City code</dt>
        <dd>{airport.cityCode}</dd>
      </div>
      <div>
        <dt>Country</dt>
        <dd>{airport.countryCode}</dd>
      </div>
      <div>
        <dt>Airport type</dt>
        <dd>{airport.type}</dd>
      </div>
      <div>
        <dt>Time zone</dt>
        <dd>{airport.timezone}</dd>
      </div>
    </dl>
  );
}
