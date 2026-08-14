import { useMemo } from 'react';
import type { Airport, AirportMovementDirection, AirportSummary } from '@/api/types';
import { FlightMap } from '@/components/FlightMap';
import { EmptyState } from '@/components/primitives';
import { AirportDirectionControl } from './AirportDirectionControl';
import { aggregateAirportRoutes, directionStatistics } from './airportData';

export function AirportMap({
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
  const active = directionStatistics(summary, direction);
  const routes = useMemo(() => aggregateAirportRoutes(active?.routes ?? []), [active]);
  const mapRoutes = useMemo(
    () =>
      routes.flatMap((route) => {
        const other = summary.airports[route.otherAirportId];
        if (!other) {
          return [];
        }

        const from = direction === 'departure' ? airport : other;
        const to = direction === 'departure' ? other : airport;
        return [
          {
            from,
            to,
            frequency: route.scheduledLegs,
            label: `${from.iataCode} → ${to.iataCode}: ${route.scheduledLegs.toLocaleString()} scheduled legs in ${summary.year}`,
          },
        ];
      }),
    [airport, direction, routes, summary],
  );

  return (
    <section className='airport-subpage'>
      <div className='section-heading airport-view-heading'>
        <div>
          <span className='eyebrow'>Annual geographic view</span>
          <h2>{summary.year} network map</h2>
          <p>
            {direction === 'departure' ? 'Airport to destination' : 'Origin to airport'} · line
            weight shows scheduled-leg volume.
          </p>
        </div>
        <AirportDirectionControl
          summary={summary}
          direction={direction}
          onChange={onDirectionChange}
        />
      </div>
      {mapRoutes.length > 0 ? (
        <FlightMap routes={mapRoutes} airports={[airport]} height={590} airportLinks />
      ) : (
        <EmptyState
          title={`No ${direction === 'departure' ? 'departure' : 'arrival'} routes to map`}
          description='This year has no resolved scheduled network in the selected direction.'
        />
      )}
    </section>
  );
}
