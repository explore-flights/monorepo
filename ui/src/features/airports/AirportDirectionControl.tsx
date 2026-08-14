import type { AirportMovementDirection, AirportSummary } from '@/api/types';
import { directionStatistics } from './airportData';

export function AirportDirectionControl({
  summary,
  direction,
  onChange,
}: {
  summary: AirportSummary;
  direction: AirportMovementDirection;
  onChange: (direction: AirportMovementDirection) => void;
}) {
  const departuresAvailable = Boolean(directionStatistics(summary, 'departure')?.scheduledLegs);
  const arrivalsAvailable = Boolean(directionStatistics(summary, 'arrival')?.scheduledLegs);

  return (
    <div className='airport-direction-control' aria-label='Movement direction'>
      <button
        type='button'
        className={direction === 'departure' ? 'active' : ''}
        aria-pressed={direction === 'departure'}
        disabled={!departuresAvailable}
        onClick={() => onChange('departure')}
      >
        Departures
      </button>
      <button
        type='button'
        className={direction === 'arrival' ? 'active' : ''}
        aria-pressed={direction === 'arrival'}
        disabled={!arrivalsAvailable}
        onClick={() => onChange('arrival')}
      >
        Arrivals
      </button>
    </div>
  );
}
