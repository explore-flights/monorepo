import { JourneyRouteSnapshot } from '@/components/JourneySnapshot';
import styles from './ConnectionGraphCard.module.css';

export interface ConnectionGraphCardData {
  flight: string;
  departureAirport: string;
  arrivalAirport: string;
  departure: string;
  arrival: string;
  arrivalDayDelta: number;
  duration: string;
  aircraft: string;
  configuration: string;
}

export type ConnectionGraphCardPresentation = 'default' | 'connected' | 'active' | 'muted';

const mutedValues = {
  departureAirport: styles.mutedValue,
  departureTime: styles.mutedValue,
  duration: styles.mutedValue,
  arrivalAirport: styles.mutedValue,
  arrivalTime: styles.mutedValue,
  operationPrimary: styles.mutedValue,
  operationSecondary: styles.mutedValue,
};

export function ConnectionGraphCard({
  data,
  presentation,
}: {
  data: ConnectionGraphCardData;
  presentation: ConnectionGraphCardPresentation;
}) {
  return (
    <div className={styles.card} data-presentation={presentation} aria-hidden='true'>
      <strong className={styles.heading}>{data.flight}</strong>
      <div className={styles.body}>
        <JourneyRouteSnapshot
          compact
          departureAirport={data.departureAirport}
          departureTime={data.departure}
          duration={data.duration}
          arrivalAirport={data.arrivalAirport}
          arrivalTime={data.arrival}
          arrivalDayDelta={data.arrivalDayDelta}
          operation={{ primary: data.aircraft, secondary: data.configuration }}
          valueClassNames={presentation === 'muted' ? mutedValues : undefined}
        />
      </div>
    </div>
  );
}
