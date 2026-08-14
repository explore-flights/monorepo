import { ArrowRight } from 'lucide-react';
import type { ReactNode } from 'react';
import { classNames } from '@/lib/format';

interface JourneyConnection {
  label: ReactNode;
  routingUnknown?: boolean;
}

interface JourneyLegPresentation {
  key: string;
  content: ReactNode;
  connection: JourneyConnection | undefined;
}

export function JourneyLegSequence({
  className,
  legs,
}: {
  className?: string;
  legs: readonly JourneyLegPresentation[];
}) {
  return (
    <div className={classNames('journey-snapshot', className)}>
      {legs.map((leg) => (
        <div className='journey-leg-wrap' key={leg.key}>
          {leg.content}
          {leg.connection && (
            <div
              className={classNames(
                'journey-connection',
                leg.connection.routingUnknown && 'routing-unknown',
              )}
            >
              <i />
              <span>{leg.connection.label}</span>
              <i />
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

interface JourneyRouteValueClassNames {
  departureAirport?: string;
  departureTime?: string;
  duration?: string;
  arrivalAirport?: string;
  arrivalTime?: string;
  operationPrimary?: string;
  operationSecondary?: string;
}

interface JourneyRouteOperation {
  primary: ReactNode;
  secondary: ReactNode;
}

export function JourneyRouteSnapshot({
  departureAirport,
  departureTime,
  duration,
  arrivalAirport,
  arrivalTime,
  operation,
  valueClassNames,
  compact = false,
}: {
  departureAirport: ReactNode;
  departureTime: ReactNode;
  duration: ReactNode;
  arrivalAirport: ReactNode;
  arrivalTime: ReactNode;
  operation: JourneyRouteOperation | undefined;
  valueClassNames?: JourneyRouteValueClassNames;
  compact?: boolean;
}) {
  return (
    <div className={classNames('variant-snapshot', compact && 'compact')}>
      <div className='snapshot-route'>
        <strong className={valueClassNames?.departureAirport}>{departureAirport}</strong>
        <span className={valueClassNames?.departureTime}>{departureTime}</span>
        <span className='snapshot-route-transition'>
          <ArrowRight size={16} />
          <span className={valueClassNames?.duration}>{duration}</span>
        </span>
        <strong className={valueClassNames?.arrivalAirport}>{arrivalAirport}</strong>
        <span className={valueClassNames?.arrivalTime}>{arrivalTime}</span>
      </div>
      {operation && (
        <div className='snapshot-operation'>
          <strong className={valueClassNames?.operationPrimary}>{operation.primary}</strong>
          <span className={valueClassNames?.operationSecondary}>{operation.secondary}</span>
        </div>
      )}
    </div>
  );
}
