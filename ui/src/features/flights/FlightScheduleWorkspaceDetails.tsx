import { ArrowRight, CalendarDays, History, Sparkles, X } from 'lucide-react';
import { type ReactNode, useState } from 'react';
import type {
  FlightReferenceData,
  FlightScheduleItem,
  FlightScheduleVariant,
  FlightSchedules,
} from '@/api/types';
import { CenterSectionToggle } from '@/components/CenterSectionToggle';
import { JourneyLegSequence, JourneyRouteSnapshot } from '@/components/JourneySnapshot';
import { Badge, Card } from '@/components/primitives';
import { CodeshareDetails, DataElementList } from '@/components/ScheduleMetadata';
import { aircraftConfigurationLabel as configurationLabel } from '@/lib/aircraftConfigurations';
import { countBy } from '@/lib/collections';
import { daysBetween, weekdayForDate, weekdayLabels, type DateBasis } from '@/lib/date';
import {
  classNames,
  dateLabel,
  dateRangeLabel as formatRange,
  duration,
  flightName,
} from '@/lib/format';
import {
  displayVariantFor,
  groupScheduleItemsByDepartureDate,
  isCancelledScheduleItem as isCancelled,
  isOperatingScheduleItem,
  previousVariantFor,
  variantFor,
} from '@/lib/schedules';
import {
  arrivalScheduleTime,
  dayDeltaLabel,
  departureScheduleTime,
  departureScheduleTimeForBasis,
  scheduleInstant,
} from '@/lib/time';
import { compareFlightVariants, type FieldChange } from './flightChanges';
import { type JourneyDay, type SchedulePeriod } from './schedulePeriods';

export type ScheduleStatus = 'scheduled' | 'cancelled' | 'all';
export type ScheduleView = 'periods' | 'calendar' | 'dates' | 'map' | 'changes';
const scheduleWeekdayOrder: readonly number[] = [1, 2, 3, 4, 5, 6, 0];

export interface FacetFilters {
  route?: string;
  aircraftId?: string;
  weekday?: number;
  text: string;
}

export interface ChangePeriod {
  start: string;
  end: string;
  days: JourneyDay[];
  signature: string;
}

export function PeriodsView({
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
      {periods.map((period) => (
        <SchedulePeriodCard
          key={`${period.start}-${period.signature}`}
          period={period}
          data={data}
          highlighted={highlightedBlock === period.start}
          onInspect={onInspect}
        />
      ))}
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
  const pattern = period.patterns[0];
  if (period.presentation === 'weekday') {
    return (
      <RecurringWeeklyScheduleCard
        period={period}
        data={data}
        highlighted={highlighted}
        onInspect={onInspect}
      />
    );
  }
  if (!pattern) {
    return null;
  }

  const day = pattern.representativeDay;
  const variation = periodVariationSummary(pattern.days, data);
  const cancelled = period.days.flatMap((entry) => entry.legs).filter(isCancelled).length;
  const operating = day.legs.some((leg) => !isCancelled(leg));
  return (
    <Card
      id={`schedule-period-${period.start}`}
      className={classNames(
        'schedule-period',
        period.basis === 'schedule' && 'variable',
        cancelled > 0 && 'has-cancelled',
        !operating && 'cancelled-only',
        day.legs.length > 1 && 'multi-leg',
        expanded && 'expanded',
        highlighted && 'highlighted',
      )}
    >
      <div className='period-range'>
        <span>{formatRange(period.start, period.end)}</span>
        <small>{yearRangeLabel(period.start, period.end)}</small>
      </div>
      <div className={classNames('period-main', 'expandable-center', expanded && 'expanded')}>
        <CenterSectionToggle
          expanded={expanded}
          label={`${expanded ? 'Collapse' : 'Expand'} schedule details for ${journeyLabel(day, data)}`}
          onToggle={() => setExpanded(!expanded)}
        />
        <JourneySnapshot
          day={day}
          data={data}
          variation={variation}
          showEquipment={pattern.basis === 'exact'}
          aggregate
          flatSingleLeg
          expanded={expanded}
        />
      </div>
      <div className='period-meta'>
        <span>
          <CalendarDays size={14} />
          {periodFrequencyLabel(period)}
        </span>
        {cancelled > 0 && (
          <Badge tone='red'>
            <X size={13} />
            {cancelled} cancelled leg{cancelled === 1 ? '' : 's'}
          </Badge>
        )}
        <button onClick={() => onInspect(period.start, period.end)}>
          View dates <ArrowRight size={13} />
        </button>
      </div>
      <PeriodExceptionDates
        period={period}
        data={data}
        totalDates={period.days.length}
        onInspect={onInspect}
      />
    </Card>
  );
}

function RecurringWeeklyScheduleCard({
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
  const [expandedPattern, setExpandedPattern] = useState<string>();
  return (
    <Card
      id={`schedule-period-${period.start}`}
      className={classNames(
        'schedule-period',
        'recurring-weekly',
        period.basis === 'schedule' && 'variable',
        highlighted && 'highlighted',
      )}
    >
      <div className='period-range'>
        <span>{formatRange(period.start, period.end)}</span>
        <small>{yearRangeLabel(period.start, period.end)}</small>
      </div>
      <div className='recurring-weekly-main'>
        <div className='recurring-weekly-heading'>
          <Badge tone='blue'>Weekday pattern</Badge>
          <strong>
            {period.patterns.length} recurring pattern{period.patterns.length === 1 ? '' : 's'}
          </strong>
        </div>
        <div className='weekly-pattern-list'>
          {period.patterns.map((pattern) => {
            const variation = periodVariationSummary(pattern.days, data);
            const weekdayLabel = weeklyPatternWeekdayLabel(pattern.weekdays);
            const expanded = expandedPattern === pattern.signature;
            return (
              <section
                className={classNames(
                  'weekly-pattern',
                  'expandable-center',
                  expanded && 'expanded',
                )}
                key={pattern.signature}
              >
                <CenterSectionToggle
                  expanded={expanded}
                  label={`${expanded ? 'Collapse' : 'Expand'} ${weekdayLabel} schedule details for ${journeyLabel(pattern.representativeDay, data)}`}
                  onToggle={() =>
                    setExpandedPattern((current) =>
                      current === pattern.signature ? undefined : pattern.signature,
                    )
                  }
                />
                <span className='weekly-pattern-caption'>{weekdayLabel}</span>
                <JourneySnapshot
                  day={pattern.representativeDay}
                  data={data}
                  variation={variation}
                  showEquipment={pattern.basis === 'exact'}
                  aggregate
                  flatSingleLeg
                  expanded={expanded}
                />
              </section>
            );
          })}
        </div>
      </div>
      <div className='period-meta'>
        <span>
          <CalendarDays size={14} />
          {period.days.length} departure date{period.days.length === 1 ? '' : 's'}
        </span>
        <button onClick={() => onInspect(period.start, period.end)}>
          View dates <ArrowRight size={13} />
        </button>
      </div>
      <PeriodExceptionDates
        period={period}
        data={data}
        totalDates={period.days.length}
        onInspect={onInspect}
      />
    </Card>
  );
}

function PeriodExceptionDates({
  period,
  data,
  totalDates,
  onInspect,
}: {
  period: SchedulePeriod;
  data: FlightReferenceData;
  totalDates: number;
  onInspect: (from: string, to: string, view?: ScheduleView) => void;
}) {
  const dates = period.exceptionDates;
  if (dates.length === 0) {
    return null;
  }
  const percentage = Math.round((dates.length / totalDates) * 100);

  return (
    <details className='period-exceptions'>
      <summary>
        <strong>
          <Sparkles size={14} />
          Exceptions
        </strong>
        <span>
          {dates.length} date{dates.length === 1 ? '' : 's'} ({percentage}%)
        </span>
      </summary>
      <ul className='period-exception-list'>
        {dates.map((date) => {
          const differences = periodExceptionDifferences(period, date, data);
          const label = dateLabel(date, { weekday: 'short', month: 'short', day: 'numeric' });
          return (
            <li className='period-exception-item' key={date}>
              <button
                className='period-exception-date'
                type='button'
                onClick={() => onInspect(date, date)}
              >
                {label}
                <ArrowRight size={12} />
              </button>
              <div className='period-exception-differences' aria-label={`Differences on ${label}`}>
                {differences.map((difference) => {
                  const detail = `${difference.label}: expected ${difference.expected}; actual ${difference.actual}`;
                  return (
                    <span
                      className='badge badge-amber'
                      key={difference.key}
                      aria-label={detail}
                      title={detail}
                    >
                      {difference.label}
                    </span>
                  );
                })}
              </div>
            </li>
          );
        })}
      </ul>
    </details>
  );
}

interface PeriodExceptionDifference {
  key: string;
  label: string;
  expected: string;
  actual: string;
}

function periodExceptionDifferences(
  period: SchedulePeriod,
  date: string,
  data: FlightReferenceData,
): PeriodExceptionDifference[] {
  const day = period.days.find((candidate) => candidate.date === date);
  const weekday = weekdayForDate(date);
  const expectedPattern = period.patterns.find((pattern) => pattern.weekdays.includes(weekday));
  const fallbackPattern = period.patterns[0];
  const expectedDay = expectedPattern?.representativeDay ?? fallbackPattern?.representativeDay;
  if (!day || !expectedDay) {
    return [differentPublishedSchedule()];
  }

  const differences: PeriodExceptionDifference[] = [];
  if (!expectedPattern) {
    const expectedWeekdays = [...new Set(period.patterns.flatMap((pattern) => pattern.weekdays))];
    differences.push({
      key: 'weekday',
      label: 'Operating weekday',
      expected: weeklyPatternWeekdayLabel(expectedWeekdays),
      actual: weekdayLabels[weekday],
    });
  }

  if (expectedDay.legs.length !== day.legs.length) {
    differences.push({
      key: 'journey-legs',
      label: 'Journey legs',
      expected: String(expectedDay.legs.length),
      actual: String(day.legs.length),
    });
  }

  const legCount = Math.max(expectedDay.legs.length, day.legs.length);
  for (let index = 0; index < legCount; index += 1) {
    const expectedItem = expectedDay.legs[index];
    const actualItem = day.legs[index];
    if (!expectedItem || !actualItem) {
      continue;
    }

    const legPrefix = legCount > 1 ? `Leg ${index + 1} · ` : '';
    if (expectedItem.departureAirportId !== actualItem.departureAirportId) {
      differences.push({
        key: `leg-${index}-departure-airport`,
        label: `${legPrefix}Departure airport`,
        expected: airportExceptionLabel(expectedItem.departureAirportId, data),
        actual: airportExceptionLabel(actualItem.departureAirportId, data),
      });
    }

    const variantChanges = compareFlightVariants(
      variantFor(data, expectedItem.flightVariantId),
      variantFor(data, actualItem.flightVariantId),
      data,
      date,
    );
    differences.push(
      ...variantChanges.map((change) => ({
        key: `leg-${index}-${change.key}`,
        label: `${legPrefix}${change.label}`,
        expected: change.before || 'Not published',
        actual: change.after || 'Not published',
      })),
    );
  }

  if (differences.length > 0) {
    return differences;
  }

  const expectedVariants = expectedDay.legs.map((item) => item.flightVariantId ?? 'cancelled');
  const actualVariants = day.legs.map((item) => item.flightVariantId ?? 'cancelled');
  if (expectedVariants.join('|') !== actualVariants.join('|')) {
    return [
      {
        key: 'published-variant',
        label: 'Published variant',
        expected: 'Period variant',
        actual: 'Different variant identity',
      },
    ];
  }

  return [differentPublishedSchedule()];
}

function differentPublishedSchedule(): PeriodExceptionDifference {
  return {
    key: 'published-schedule',
    label: 'Published schedule',
    expected: 'Period pattern',
    actual: 'Different schedule',
  };
}

function airportExceptionLabel(id: string, data: FlightReferenceData) {
  return data.airports[id]?.iataCode ?? id;
}

function weeklyPatternWeekdayLabel(weekdays: readonly number[]) {
  return [...weekdays]
    .sort((left, right) => scheduleWeekdayOrder.indexOf(left) - scheduleWeekdayOrder.indexOf(right))
    .map((weekday) => weekdayLabels[weekday])
    .join(' · ');
}

export function JourneySnapshot({
  day,
  data,
  variation,
  showEquipment = true,
  aggregate = false,
  compact = false,
  flatSingleLeg = false,
  expanded = false,
}: {
  day: JourneyDay;
  data: FlightReferenceData;
  variation?: PeriodVariationSummary;
  showEquipment?: boolean;
  aggregate?: boolean;
  compact?: boolean;
  flatSingleLeg?: boolean;
  expanded?: boolean;
}) {
  const legs = day.legs.map((item, index) => {
    const next = day.legs[index + 1];
    const connection = next ? connectionLabel(item, next, data) : undefined;
    return {
      key: `${item.departureAirportId}-${item.flightVariantId ?? item.previousFlightVariantId ?? index}`,
      content: (
        <JourneyLegCard
          item={item}
          index={index}
          showLegNumber={day.legs.length > 1}
          data={data}
          variableProperties={variation?.byLeg[index]}
          snapshotVariableProperties={variation?.snapshotByLeg[index]}
          showEquipment={showEquipment}
          aggregate={aggregate}
          compact={compact}
          expanded={expanded}
        />
      ),
      connection: next
        ? {
            label: connection ?? 'Routing not published',
            routingUnknown: !connection,
          }
        : undefined,
    };
  });

  return (
    <JourneyLegSequence
      className={classNames(
        aggregate && 'aggregate',
        compact && 'compact',
        flatSingleLeg && 'flat-single-leg',
        day.legs.length === 1 && 'single-leg',
        day.legs.length > 2 && 'many-legs',
        day.legs.some(isCancelled) && 'has-cancelled',
      )}
      legs={legs}
    />
  );
}

function JourneyLegCard({
  item,
  index,
  showLegNumber,
  data,
  showEquipment,
  aggregate,
  variableProperties,
  snapshotVariableProperties,
  compact,
  expanded,
}: {
  item: FlightScheduleItem;
  index: number;
  showLegNumber: boolean;
  data: FlightReferenceData;
  showEquipment: boolean;
  aggregate: boolean;
  variableProperties?: ReadonlySet<LegPropertyKey>;
  snapshotVariableProperties?: ReadonlySet<SnapshotPropertyKey>;
  compact: boolean;
  expanded: boolean;
}) {
  const variant = variantFor(data, item.flightVariantId);
  const previousVariant = previousVariantFor(data, item);
  const showRevision = !aggregate && item.versionCount > 1;
  const cancelled = isCancelled(item);
  return (
    <div
      className={classNames(
        'journey-leg-panel',
        isCancelled(item) && 'cancelled',
        expanded && 'expanded',
      )}
    >
      <div className='journey-leg-card'>
        {(showLegNumber || showRevision || cancelled) && (
          <span className='journey-leg-heading'>
            {showLegNumber && <span>Leg {index + 1}</span>}
            {showRevision && (
              <span className='journey-leg-revision'>
                <History size={11} />
                {ordinal(item.versionCount)} Revision
              </span>
            )}
            {cancelled && (
              <span className='journey-leg-cancelled'>
                <X size={10} />
                Cancelled
              </span>
            )}
          </span>
        )}
        {variant ? (
          <VariantSnapshot
            item={item}
            variant={variant}
            data={data}
            showEquipment={showEquipment}
            variableProperties={snapshotVariableProperties}
            compact={compact}
          />
        ) : (
          <CancelledSnapshot
            item={item}
            previousVariant={previousVariant}
            data={data}
            showEquipment={showEquipment}
            snapshotVariableProperties={snapshotVariableProperties}
            compact={compact}
          />
        )}
        {expanded && (
          <JourneyLegDetails
            item={item}
            variant={variant}
            previousVariant={previousVariant}
            data={data}
            variableProperties={variableProperties}
            aggregate={aggregate}
          />
        )}
      </div>
    </div>
  );
}

function CancelledSnapshot({
  item,
  previousVariant,
  data,
  showEquipment,
  snapshotVariableProperties,
  compact,
}: {
  item: FlightScheduleItem;
  previousVariant: FlightScheduleVariant | undefined;
  data: FlightReferenceData;
  showEquipment: boolean;
  snapshotVariableProperties?: ReadonlySet<SnapshotPropertyKey>;
  compact: boolean;
}) {
  const airport = data.airports[item.departureAirportId];
  return (
    <div className='cancelled-snapshot'>
      {previousVariant ? (
        <VariantSnapshot
          item={item}
          variant={previousVariant}
          data={data}
          showEquipment={showEquipment}
          variableProperties={snapshotVariableProperties}
          compact={compact}
        />
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
  variableProperties,
  aggregate,
}: {
  item: FlightScheduleItem;
  variant: FlightScheduleVariant | undefined;
  previousVariant: FlightScheduleVariant | undefined;
  data: FlightReferenceData;
  variableProperties?: ReadonlySet<LegPropertyKey>;
  aggregate: boolean;
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
            <JourneyDetailItem label='Status'>Cancelled</JourneyDetailItem>
            <JourneyDetailItem
              label='Departure airport'
              varies={variableProperties?.has('departureAirport')}
            >
              {from ? `${from.iataCode} · ${from.name}` : item.departureAirportId}
            </JourneyDetailItem>
            {!aggregate && (
              <>
                <JourneyDetailItem label='Departure local date'>
                  {dateLabel(item.departureDateLocal, { dateStyle: 'long' })}
                </JourneyDetailItem>
                <JourneyDetailItem label='Record version'>{item.version || '—'}</JourneyDetailItem>
                <JourneyDetailItem label='Observed versions'>{item.versionCount}</JourneyDetailItem>
              </>
            )}
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
          <JourneyDetailItem label='Status'>Cancelled</JourneyDetailItem>
          <JourneyDetailItem
            label='Departure airport'
            varies={variableProperties?.has('departureAirport')}
          >
            {from ? `${from.iataCode} · ${from.name}` : item.departureAirportId}
          </JourneyDetailItem>
          <JourneyDetailItem
            label='Scheduled departure'
            varies={variableProperties?.has('departureSchedule')}
          >
            {aggregate ? '' : `${departure.date} `}
            {departure.time} · {departure.offset} · {from?.timezone ?? '—'}
          </JourneyDetailItem>
          <JourneyDetailItem
            label='Arrival airport'
            varies={variableProperties?.has('arrivalAirport')}
          >
            {to ? `${to.iataCode} · ${to.name}` : previousVariant.arrivalAirportId}
          </JourneyDetailItem>
          <JourneyDetailItem
            label='Scheduled arrival'
            varies={variableProperties?.has('arrivalSchedule')}
          >
            {aggregate ? '' : `${arrival.date} `}
            {arrival.time}
            {aggregate && <sup>{dayDeltaLabel(arrival.dayDelta)}</sup>} · {arrival.offset} ·{' '}
            {to?.timezone ?? '—'}
          </JourneyDetailItem>
          <JourneyDetailItem label='Operated as' varies={variableProperties?.has('operatedAs')}>
            {flightName(previousVariant.operatedAs, data.airlines)}
          </JourneyDetailItem>
          <JourneyDetailItem label='Duration' varies={variableProperties?.has('duration')}>
            {duration(previousVariant.durationSeconds)}
          </JourneyDetailItem>
          <JourneyDetailItem label='Service type' varies={variableProperties?.has('serviceType')}>
            {previousVariant.serviceType || '—'}
          </JourneyDetailItem>
          <JourneyDetailItem
            label='Aircraft owner'
            varies={variableProperties?.has('aircraftOwner')}
          >
            {previousVariant.aircraftOwner || '—'}
          </JourneyDetailItem>
          <JourneyDetailItem label='Aircraft' varies={variableProperties?.has('aircraft')}>
            {data.aircraft[previousVariant.aircraftId]?.name ?? previousVariant.aircraftId}
          </JourneyDetailItem>
          <JourneyDetailItem label='Aircraft ID' varies={variableProperties?.has('aircraft')}>
            {previousVariant.aircraftId}
          </JourneyDetailItem>
          <JourneyDetailItem
            label='Configuration'
            varies={variableProperties?.has('configuration')}
          >
            {configurationLabel(previousVariant, data, true)}
          </JourneyDetailItem>
          {!aggregate && (
            <>
              <JourneyDetailItem label='Record version'>{item.version || '—'}</JourneyDetailItem>
              <JourneyDetailItem label='Observed versions'>{item.versionCount}</JourneyDetailItem>
            </>
          )}
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
        <JourneyDetailItem
          label='Departure airport'
          varies={variableProperties?.has('departureAirport')}
        >
          {from ? `${from.iataCode} · ${from.name}` : item.departureAirportId}
        </JourneyDetailItem>
        <JourneyDetailItem
          label='Departure schedule'
          varies={variableProperties?.has('departureSchedule')}
        >
          {aggregate ? '' : `${departure.date} `}
          {departure.time} · {departure.offset} · {from?.timezone ?? '—'}
        </JourneyDetailItem>
        <JourneyDetailItem
          label='Arrival airport'
          varies={variableProperties?.has('arrivalAirport')}
        >
          {to ? `${to.iataCode} · ${to.name}` : variant.arrivalAirportId}
        </JourneyDetailItem>
        <JourneyDetailItem
          label='Arrival schedule'
          varies={variableProperties?.has('arrivalSchedule')}
        >
          {aggregate ? '' : `${arrival.date} `}
          {arrival.time}
          {aggregate && <sup>{dayDeltaLabel(arrival.dayDelta)}</sup>} · {arrival.offset} ·{' '}
          {to?.timezone ?? '—'}
        </JourneyDetailItem>
        <JourneyDetailItem label='Operated as' varies={variableProperties?.has('operatedAs')}>
          {flightName(variant.operatedAs, data.airlines)}
        </JourneyDetailItem>
        <JourneyDetailItem label='Duration' varies={variableProperties?.has('duration')}>
          {duration(variant.durationSeconds)}
        </JourneyDetailItem>
        <JourneyDetailItem label='Service type' varies={variableProperties?.has('serviceType')}>
          {variant.serviceType || '—'}
        </JourneyDetailItem>
        <JourneyDetailItem label='Aircraft owner' varies={variableProperties?.has('aircraftOwner')}>
          {variant.aircraftOwner || '—'}
        </JourneyDetailItem>
        <JourneyDetailItem label='Aircraft' varies={variableProperties?.has('aircraft')}>
          {data.aircraft[variant.aircraftId]?.name ?? variant.aircraftId}
        </JourneyDetailItem>
        <JourneyDetailItem label='Aircraft ID' varies={variableProperties?.has('aircraft')}>
          {variant.aircraftId}
        </JourneyDetailItem>
        <JourneyDetailItem label='Configuration' varies={variableProperties?.has('configuration')}>
          {configurationLabel(variant, data, true)}
        </JourneyDetailItem>
        {!aggregate && (
          <>
            <JourneyDetailItem label='Record version'>{item.version || '—'}</JourneyDetailItem>
            <JourneyDetailItem label='Observed versions'>{item.versionCount}</JourneyDetailItem>
          </>
        )}
      </dl>
      {variableProperties?.has('codeshares') ? (
        <VariableDetailGroup label='Codeshares' />
      ) : (
        <CodeshareDetails
          className='journey-leg-detail-group'
          codeShares={variant.codeShares}
          airlines={data.airlines}
          pathFor={(number) => `/flight/${number}`}
        />
      )}
      {(variableProperties?.has('dataElements') ||
        Object.keys(variant.dataElements).length > 0) && (
        <div className='journey-leg-detail-group'>
          <span>Data elements</span>
          {variableProperties?.has('dataElements') ? (
            <strong className='variable-property-value'>Varies</strong>
          ) : (
            <DataElementList dataElements={variant.dataElements} />
          )}
        </div>
      )}
    </div>
  );
}

function JourneyDetailItem({
  label,
  varies = false,
  children,
}: {
  label: string;
  varies?: boolean;
  children: ReactNode;
}) {
  return (
    <div>
      <dt>{label}</dt>
      <dd className={varies ? 'variable-property-value' : undefined}>
        {varies ? 'Varies' : children}
      </dd>
    </div>
  );
}

function VariableDetailGroup({ label }: { label: string }) {
  return (
    <div className='journey-leg-detail-group'>
      <span>{label}</span>
      <strong className='variable-property-value'>Varies</strong>
    </div>
  );
}

function VariantSnapshot({
  item,
  variant,
  data,
  showEquipment = true,
  variableProperties,
  compact = false,
}: {
  item: FlightScheduleItem;
  variant: FlightScheduleVariant;
  data: FlightReferenceData;
  showEquipment?: boolean;
  variableProperties?: ReadonlySet<SnapshotPropertyKey>;
  compact?: boolean;
}) {
  const from = data.airports[item.departureAirportId];
  const to = data.airports[variant.arrivalAirportId];
  const departure = departureScheduleTime(item.departureDateLocal, variant);
  const arrival = arrivalScheduleTime(item.departureDateLocal, variant);
  const configuration = configurationLabel(variant, data);
  return (
    <JourneyRouteSnapshot
      compact={compact}
      departureAirport={variablePropertyValue(
        variableProperties,
        'departureAirport',
        from?.iataCode ?? item.departureAirportId,
      )}
      departureTime={variablePropertyValue(variableProperties, 'departureSchedule', departure.time)}
      duration={variablePropertyValue(
        variableProperties,
        'duration',
        duration(variant.durationSeconds),
      )}
      arrivalAirport={variablePropertyValue(
        variableProperties,
        'arrivalAirport',
        to?.iataCode ?? variant.arrivalAirportId,
      )}
      arrivalTime={
        variableProperties?.has('arrivalSchedule') ? (
          'Varies'
        ) : (
          <>
            {arrival.time}
            <sup>{dayDeltaLabel(arrival.dayDelta)}</sup>
          </>
        )
      }
      operation={
        showEquipment
          ? {
              primary: variablePropertyValue(
                variableProperties,
                'aircraft',
                data.aircraft[variant.aircraftId]?.name ?? variant.aircraftId,
              ),
              secondary: variablePropertyValue(variableProperties, 'configuration', configuration),
            }
          : undefined
      }
      valueClassNames={{
        departureAirport: variablePropertyClass(variableProperties, 'departureAirport'),
        departureTime: variablePropertyClass(variableProperties, 'departureSchedule'),
        duration: variablePropertyClass(variableProperties, 'duration'),
        arrivalAirport: variablePropertyClass(variableProperties, 'arrivalAirport'),
        arrivalTime: variablePropertyClass(variableProperties, 'arrivalSchedule'),
        operationPrimary: variablePropertyClass(variableProperties, 'aircraft'),
        operationSecondary: variablePropertyClass(variableProperties, 'configuration'),
      }}
    />
  );
}

function variablePropertyClass(
  properties: ReadonlySet<SnapshotPropertyKey> | undefined,
  key: SnapshotPropertyKey,
) {
  return properties?.has(key) ? 'variable-property-value' : undefined;
}

function variablePropertyValue(
  properties: ReadonlySet<SnapshotPropertyKey> | undefined,
  key: SnapshotPropertyKey,
  value: string,
) {
  return properties?.has(key) ? 'Varies' : value;
}

export function matchesFacets(
  item: FlightScheduleItem,
  data: FlightSchedules,
  filters: FacetFilters,
) {
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

export function groupChangePeriods(days: readonly JourneyDay[], data: FlightSchedules) {
  const sorted = [...days].sort((left, right) => left.date.localeCompare(right.date));
  const periodsBySignature = new Map<string, ChangePeriod>();
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

function periodViewLabel(periods: readonly SchedulePeriod[]) {
  const weekly = periods.filter((period) => period.presentation === 'weekday').length;

  return [
    `${periods.length} timetable period${periods.length === 1 ? '' : 's'}`,
    weekly ? `${weekly} weekday-pattern period${weekly === 1 ? '' : 's'}` : '',
  ]
    .filter(Boolean)
    .join(' · ');
}

function yearRangeLabel(start: string, end: string) {
  const startYear = start.slice(0, 4);
  const endYear = end.slice(0, 4);
  if (startYear === endYear) {
    return startYear;
  }

  return `${startYear}–${endYear}`;
}

export function scheduleInsights(
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

export function activeFilterChips(
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

export function periodSummary(period: SchedulePeriod, data: FlightSchedules) {
  const day = period.patterns[0]?.representativeDay ?? period.days[0];
  const aircraft = [
    ...new Set(
      period.basis === 'exact'
        ? period.patterns.flatMap((pattern) =>
            pattern.representativeDay.legs.flatMap((item) => {
              const variant = displayVariantFor(data, item);
              return variant ? [data.aircraft[variant.aircraftId]?.name ?? variant.aircraftId] : [];
            }),
          )
        : [],
    ),
  ];
  return `${journeyLabel(day, data)}${aircraft.length ? ` · ${aircraft.join(' / ')}` : ''}`;
}

type LegPropertyKey =
  | 'status'
  | 'departureAirport'
  | 'departureSchedule'
  | 'arrivalAirport'
  | 'arrivalSchedule'
  | 'aircraft'
  | 'configuration'
  | 'operatedAs'
  | 'duration'
  | 'serviceType'
  | 'aircraftOwner'
  | 'codeshares'
  | 'dataElements';

type SnapshotPropertyKey =
  | 'departureAirport'
  | 'departureSchedule'
  | 'arrivalAirport'
  | 'arrivalSchedule'
  | 'aircraft'
  | 'configuration'
  | 'duration';

const legPropertyKeys = [
  'status',
  'departureAirport',
  'departureSchedule',
  'arrivalAirport',
  'arrivalSchedule',
  'aircraft',
  'configuration',
  'operatedAs',
  'duration',
  'serviceType',
  'aircraftOwner',
  'codeshares',
  'dataElements',
] as const satisfies readonly LegPropertyKey[];

const snapshotPropertyKeys = [
  'departureAirport',
  'departureSchedule',
  'arrivalAirport',
  'arrivalSchedule',
  'aircraft',
  'configuration',
  'duration',
] as const satisfies readonly SnapshotPropertyKey[];

interface PeriodVariationSummary {
  byLeg: ReadonlyArray<ReadonlySet<LegPropertyKey>>;
  snapshotByLeg: ReadonlyArray<ReadonlySet<SnapshotPropertyKey>>;
}

function periodVariationSummary(
  days: readonly JourneyDay[],
  data: FlightReferenceData,
): PeriodVariationSummary {
  const propertiesByDay = days.map((day) => day.legs.map((item) => legPropertyValues(item, data)));
  const snapshotsByDay = days.map((day) =>
    day.legs.map((item) => snapshotPropertyValues(item, data)),
  );
  const first = propertiesByDay[0] ?? [];
  const firstSnapshots = snapshotsByDay[0] ?? [];
  const byLeg = first.map((_, legIndex) => {
    const different = new Set<LegPropertyKey>();
    for (const key of legPropertyKeys) {
      const values = new Set(propertiesByDay.map((day) => day[legIndex]?.[key] ?? ''));
      if (values.size > 1) {
        different.add(key);
      }
    }
    return different;
  });
  const snapshotByLeg = firstSnapshots.map((_, legIndex) => {
    const different = new Set<SnapshotPropertyKey>();
    for (const key of snapshotPropertyKeys) {
      const values = new Set(snapshotsByDay.map((day) => day[legIndex]?.[key] ?? ''));
      if (values.size > 1) {
        different.add(key);
      }
    }
    return different;
  });
  return { byLeg, snapshotByLeg };
}

function snapshotPropertyValues(
  item: FlightScheduleItem,
  data: FlightReferenceData,
): Record<SnapshotPropertyKey, string> {
  const variant = displayVariantFor(data, item);
  const departureAirport = data.airports[item.departureAirportId];
  const arrivalAirport = variant ? data.airports[variant.arrivalAirportId] : undefined;
  const arrival = variant ? arrivalScheduleTime(item.departureDateLocal, variant) : undefined;
  return {
    departureAirport: departureAirport?.iataCode ?? item.departureAirportId,
    departureSchedule: variant?.departureTimeLocal ?? '',
    arrivalAirport: variant ? (arrivalAirport?.iataCode ?? variant.arrivalAirportId) : '',
    arrivalSchedule: arrival ? `${arrival.time}|${arrival.dayDelta}` : '',
    aircraft: variant ? (data.aircraft[variant.aircraftId]?.name ?? variant.aircraftId) : '',
    configuration: variant ? configurationLabel(variant, data) : '',
    duration: variant ? duration(variant.durationSeconds) : '',
  };
}

function legPropertyValues(
  item: FlightScheduleItem,
  data: FlightReferenceData,
): Record<LegPropertyKey, string> {
  const variant = displayVariantFor(data, item);
  const arrival = variant ? arrivalScheduleTime(item.departureDateLocal, variant) : undefined;
  const codeshares = [...(variant?.codeShares ?? [])]
    .map((codeshare) =>
      JSON.stringify([codeshare.airlineId, codeshare.number, codeshare.suffix ?? '']),
    )
    .sort();
  const dataElements = Object.entries(variant?.dataElements ?? {}).sort(
    ([left], [right]) => Number(left) - Number(right),
  );
  return {
    status: isCancelled(item) ? 'cancelled' : 'scheduled',
    departureAirport: item.departureAirportId,
    departureSchedule: variant
      ? `${variant.departureTimeLocal}|${variant.departureUtcOffsetSeconds}`
      : '',
    arrivalAirport: variant?.arrivalAirportId ?? '',
    arrivalSchedule: variant
      ? `${arrival?.time ?? ''}|${arrival?.dayDelta ?? ''}|${variant.arrivalUtcOffsetSeconds}`
      : '',
    aircraft: variant?.aircraftId ?? '',
    configuration: variant?.aircraftConfigurationVersion ?? '',
    operatedAs: variant
      ? JSON.stringify([
          variant.operatedAs.airlineId,
          variant.operatedAs.number,
          variant.operatedAs.suffix ?? '',
        ])
      : '',
    duration: String(variant?.durationSeconds ?? ''),
    serviceType: variant?.serviceType ?? '',
    aircraftOwner: variant?.aircraftOwner ?? '',
    codeshares: JSON.stringify(codeshares),
    dataElements: JSON.stringify(dataElements),
  };
}

export function groupJourneyDays(
  items: readonly FlightScheduleItem[],
  data: FlightSchedules,
): JourneyDay[] {
  return [...groupScheduleItemsByDepartureDate(items).entries()]
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

export function journeyLabel(day: JourneyDay, data: FlightReferenceData) {
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
  return scheduleInstant(item.departureDateLocal, variant);
}

export function departureDateForBasis(
  item: FlightScheduleItem,
  data: FlightReferenceData,
  basis: DateBasis,
) {
  const variant = displayVariantFor(data, item);
  if (!variant) {
    return item.departureDateLocal;
  }

  return departureScheduleTimeForBasis(item.departureDateLocal, variant, basis).date;
}

export function matchesDateRange(date: string, from: string, to: string) {
  return date >= from && date <= to;
}

export function uniqueDateCount(items: readonly FlightScheduleItem[]) {
  return new Set(items.map((item) => item.departureDateLocal)).size;
}

export function routeKey(item: FlightScheduleItem, data: FlightSchedules) {
  const variant = displayVariantFor(data, item);
  return variant ? `${item.departureAirportId}>${variant.arrivalAirportId}` : '';
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
export function routeLabel(key: string, data: Pick<FlightSchedules, 'airports'>) {
  const [from, to] = key.split('>');
  return `${data.airports[from]?.iataCode ?? from} → ${data.airports[to]?.iataCode ?? to}`;
}
function weekdayOf(item: FlightScheduleItem) {
  return weekdayForDate(item.departureDateLocal);
}
function isNextDay(left: string, right: string) {
  return daysBetween(left, right) === 1;
}
export function changePeriodDateSummary(period: ChangePeriod) {
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

export function scheduleViewDescription(
  view: ScheduleView,
  periods: readonly SchedulePeriod[],
  changePeriodCount: number,
  days: readonly JourneyDay[],
) {
  switch (view) {
    case 'periods':
      return periodViewLabel(periods);
    case 'calendar':
      return 'Full-year schedule · filtered dates are dimmed';
    case 'dates': {
      const legCount = days.reduce((total, day) => total + day.legs.length, 0);
      return `${days.length} dates · ${legCount} leg${legCount === 1 ? '' : 's'}`;
    }
    case 'map':
      return 'Route map for the filtered schedule';
    case 'changes':
      return `${changePeriodCount} grouped revision event${changePeriodCount === 1 ? '' : 's'}`;
  }
}

function periodFrequencyLabel(period: SchedulePeriod) {
  const day = period.patterns[0]?.representativeDay ?? period.days[0];
  if (!day) {
    return 'No operating dates';
  }
  if (day.legs.length > 1) {
    return `${day.legs.length}-leg journey`;
  }

  const operatingDays = period.days.filter((entry) =>
    entry.legs.some((item) => !isCancelled(item)),
  );
  if (!operatingDays.length) {
    return 'No operating dates';
  }
  if (operatingDays.length === 1) {
    return weekdayLabels[weekdayOf(operatingDays[0].legs[0])];
  }

  const span = daysBetween(period.start, period.end) + 1;
  const ratio = operatingDays.length / span;
  const weekdays = new Set(period.patterns.flatMap((pattern) => pattern.weekdays));
  return cadenceLabel(ratio, weekdays.size);
}

export function VariantComparison({
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

export function ChangeBadges({ changes }: { changes: readonly FieldChange[] }) {
  if (changes.length === 0) {
    return <Badge>No published field difference</Badge>;
  }

  return changes.slice(0, 4).map((change) => (
    <Badge key={change.key} tone='amber'>
      {change.label}
    </Badge>
  ));
}

export function changeRouteLabel(
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
