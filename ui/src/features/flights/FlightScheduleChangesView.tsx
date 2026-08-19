import { ArrowRight, ChevronDown, ChevronRight, GitCompareArrows, History } from 'lucide-react';
import { type ReactNode, useState } from 'react';
import type {
  FlightReferenceData,
  FlightScheduleItem,
  FlightScheduleVariant,
  FlightSchedules,
} from '@/api/types';
import { Badge, EmptyState } from '@/components/primitives';
import { CodeshareDetails } from '@/components/ScheduleMetadata';
import { aircraftConfigurationLabel as configurationLabel } from '@/lib/aircraftConfigurations';
import {
  aircraftName,
  airportCode,
  airportLabel,
  classNames,
  dateLabel,
  duration,
  flightName,
  scheduleDateTimeLabel,
} from '@/lib/format';
import { previousVariantFor, variantFor } from '@/lib/schedules';
import { arrivalScheduleTime, departureScheduleTime } from '@/lib/time';
import { compareFlightVariants } from './flightChanges';
import { LegHistoryActions } from './FlightScheduleDatesView';
import {
  ChangeBadges,
  changePeriodDateSummary,
  changeRouteLabel,
  journeyLabel,
  VariantComparison,
  type ChangePeriod,
} from './FlightScheduleWorkspaceDetails';

export function ChangesView({
  periods,
  data,
  flightNumber,
}: {
  periods: ChangePeriod[];
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
  period: ChangePeriod;
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
            key={`${leg.departureDateLocal}:${leg.departureAirportId}:${leg.flightVariantId ?? leg.previousFlightVariantId ?? 'cancelled'}:${leg.version}`}
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
  const departure = airportCode(item.departureAirportId, data.airports);
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
        <LegHistoryActions
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
            {airportLabel(item.departureAirportId, data.airports)}
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
          {airportLabel(item.departureAirportId, data.airports)}
        </ChangeDetailItem>
        <ChangeDetailItem
          label='Departure schedule'
          changed={changedKeys.has('departure-time') || changedKeys.has('departure-offset')}
        >
          {scheduleDateTimeLabel(departure.date, departure.time)} · {departure.offset} ·{' '}
          {from?.timezone ?? '—'}
        </ChangeDetailItem>
        <ChangeDetailItem label='Arrival airport' changed={changedKeys.has('arrival-airport')}>
          {airportLabel(variant.arrivalAirportId, data.airports)}
        </ChangeDetailItem>
        <ChangeDetailItem
          label='Arrival schedule'
          changed={changedKeys.has('arrival-time') || changedKeys.has('arrival-offset')}
        >
          {scheduleDateTimeLabel(arrival.date, arrival.time)} · {arrival.offset} ·{' '}
          {to?.timezone ?? '—'}
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
          {aircraftName(variant.aircraftId, data.aircraft)}
        </ChangeDetailItem>
        <ChangeDetailItem label='Aircraft ID' changed={changedKeys.has('aircraft')}>
          {variant.aircraftId}
        </ChangeDetailItem>
        <ChangeDetailItem label='Configuration' changed={changedKeys.has('configuration')}>
          {configurationLabel(variant, data, true)}
        </ChangeDetailItem>
      </dl>
      <CodeshareDetails
        className={classNames(
          'journey-leg-detail-group',
          changedKeys.has('codeshares') && 'changed',
        )}
        codeShares={variant.codeShares}
        airlines={data.airlines}
      />
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
