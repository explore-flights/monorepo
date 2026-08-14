import { ChevronRight, History, X } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { FlightScheduleItem, FlightSchedules } from '@/api/types';
import { CenterSectionToggle } from '@/components/CenterSectionToggle';
import { Badge, Card } from '@/components/primitives';
import { ShowMore } from '@/components/ShowMore';
import { classNames, dateLabel } from '@/lib/format';
import { isCancelledScheduleItem as isCancelled } from '@/lib/schedules';
import { FlightHistoryFeedLinks } from './FlightHistoryFeedLinks';
import { JourneySnapshot, journeyLabel } from './FlightScheduleWorkspaceDetails';
import type { JourneyDay } from './schedulePeriods';

export function DatesView({
  days,
  filteredOutDays,
  data,
  flightNumber,
  visible,
  onMore,
}: {
  days: readonly JourneyDay[];
  filteredOutDays: readonly JourneyDay[];
  data: FlightSchedules;
  flightNumber: string;
  visible: number;
  onMore: () => void;
}) {
  const [filteredOutExpanded, setFilteredOutExpanded] = useState(
    days.length === 0 && filteredOutDays.length > 0,
  );
  const filteredOutItemCount = filteredOutDays.reduce((total, day) => total + day.legs.length, 0);

  return (
    <div className='journey-date-view'>
      {days.length > 0 && (
        <Card className='journey-date-table'>
          <div className='journey-date-list'>
            {days.slice(0, visible).map((day) => (
              <JourneyDateRow key={day.date} day={day} data={data} flightNumber={flightNumber} />
            ))}
          </div>
          <ShowMore
            visible={visible}
            total={days.length}
            batchSize={100}
            itemLabel='dates'
            onShowMore={onMore}
          />
        </Card>
      )}
      {filteredOutDays.length > 0 && (
        <details
          className='card filtered-dates-disclosure'
          open={filteredOutExpanded}
          onToggle={(event) => setFilteredOutExpanded(event.currentTarget.open)}
        >
          <summary>
            <span className='filtered-dates-summary-icon'>
              <ChevronRight size={16} />
            </span>
            <span>
              <strong>Filtered out dates</strong>
              <small>Hidden by the current detail or status filters.</small>
            </span>
            <Badge>
              {filteredOutDays.length} date{filteredOutDays.length === 1 ? '' : 's'} ·{' '}
              {filteredOutItemCount} leg{filteredOutItemCount === 1 ? '' : 's'}
            </Badge>
          </summary>
          <div className='journey-date-list filtered-date-list'>
            {filteredOutDays.map((day) => (
              <JourneyDateRow key={day.date} day={day} data={data} flightNumber={flightNumber} />
            ))}
          </div>
        </details>
      )}
    </div>
  );
}

function JourneyDateRow({
  day,
  data,
  flightNumber,
}: {
  day: JourneyDay;
  data: FlightSchedules;
  flightNumber: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const cancelled = day.legs.filter(isCancelled).length;
  return (
    <article
      className={classNames(
        'journey-date-row',
        cancelled > 0 && 'has-cancelled',
        expanded && 'expanded',
      )}
    >
      <div className='journey-date-label'>
        <strong>{dateLabel(day.date, { weekday: 'short', month: 'short', day: '2-digit' })}</strong>
        <span>{new Date(day.date).getFullYear()}</span>
        {cancelled > 0 && (
          <Badge tone='red'>
            <X size={12} />
            {cancelled} cancelled
          </Badge>
        )}
      </div>
      <div className={classNames('journey-date-main', 'expandable-center', expanded && 'expanded')}>
        <CenterSectionToggle
          expanded={expanded}
          label={`${expanded ? 'Collapse' : 'Expand'} schedule details for ${journeyLabel(day, data)} on ${day.date}`}
          onToggle={() => setExpanded(!expanded)}
        />
        <JourneySnapshot day={day} data={data} compact flatSingleLeg expanded={expanded} />
      </div>
      <div className='journey-date-history'>
        {day.legs.map((leg, index) => (
          <LegHistoryActions
            key={`${leg.departureDateLocal}:${leg.departureAirportId}:${leg.flightVariantId ?? leg.previousFlightVariantId ?? 'cancelled'}:${leg.version}`}
            flightNumber={flightNumber}
            item={leg}
            label={`Leg ${index + 1} history`}
          />
        ))}
      </div>
    </article>
  );
}

export function LegHistoryActions({
  flightNumber,
  item,
  label,
}: {
  flightNumber: string;
  item: FlightScheduleItem;
  label: string;
}) {
  return (
    <div className='leg-history-actions'>
      <Link
        className='history-link leg-history-link'
        to={`/flight/${flightNumber}/versions/${item.departureAirportId}/${item.departureDateLocal}`}
      >
        <History size={13} />
        <span>{label}</span>
      </Link>
      <FlightHistoryFeedLinks
        flightNumber={flightNumber}
        airport={item.departureAirportId}
        date={item.departureDateLocal}
        compact
      />
    </div>
  );
}
