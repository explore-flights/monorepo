import { ArrowDown, ArrowUp, ChevronDown, ChevronRight, Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import type { AirportMovementDirection, AirportSummary } from '@/api/types';
import { ShowMore } from '@/components/ShowMore';
import { filterSelectOptions } from '@/components/picker/selectOptions';
import { Card, EmptyState } from '@/components/primitives';
import { airportSelectOptions } from '@/components/selectOptions';
import { dateRangeLabel, duration } from '@/lib/format';
import { AirportDirectionControl } from './AirportDirectionControl';
import { aggregateAirportRoutes, directionStatistics } from './airportData';

type RouteSort = 'airport' | 'volume' | 'duration';
type SortOrder = 'ascending' | 'descending';

export function AirportRoutes({
  summary,
  direction,
  onDirectionChange,
}: {
  summary: AirportSummary;
  direction: AirportMovementDirection;
  onDirectionChange: (direction: AirportMovementDirection) => void;
}) {
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<RouteSort>('volume');
  const [sortOrder, setSortOrder] = useState<SortOrder>('descending');
  const [expandedAirportId, setExpandedAirportId] = useState<string>();
  const [visible, setVisible] = useState(50);
  const active = directionStatistics(summary, direction);
  const routes = useMemo(() => aggregateAirportRoutes(active?.routes ?? []), [active]);
  const filteredRoutes = useMemo(() => {
    const airports = routes.flatMap((route) => {
      const airport = summary.airports[route.otherAirportId];
      return airport ? [airport] : [];
    });
    const matchingIds = new Set(
      filterSelectOptions(airportSelectOptions(airports), search).map((option) => option.value),
    );
    const rawCodeMatches = routes
      .filter((route) => !summary.airports[route.otherAirportId])
      .filter((route) =>
        route.otherAirportId.toLocaleUpperCase().includes(search.toLocaleUpperCase()),
      )
      .map((route) => route.otherAirportId);
    rawCodeMatches.forEach((id) => matchingIds.add(id));

    return routes
      .filter((route) => !search.trim() || matchingIds.has(route.otherAirportId))
      .sort((left, right) => compareRoutes(left, right, sort, sortOrder, summary));
  }, [routes, search, sort, sortOrder, summary]);

  const updateSort = (nextSort: RouteSort) => {
    if (sort === nextSort) {
      setSortOrder(sortOrder === 'ascending' ? 'descending' : 'ascending');
      return;
    }

    setSort(nextSort);
    setSortOrder(nextSort === 'airport' ? 'ascending' : 'descending');
  };

  return (
    <section className='airport-subpage'>
      <div className='section-heading airport-view-heading'>
        <div>
          <span className='eyebrow'>Annual direct network</span>
          <h2>
            {routes.length.toLocaleString()} scheduled{' '}
            {direction === 'departure' ? 'destinations' : 'origins'}
          </h2>
          <p>Aggregated across operating airline and equipment combinations.</p>
        </div>
        <AirportDirectionControl
          summary={summary}
          direction={direction}
          onChange={onDirectionChange}
        />
      </div>

      {routes.length > 0 && (
        <Card className='table-card airport-routes-card'>
          <div className='airport-routes-toolbar'>
            <label className='search-input airport-route-search'>
              <Search size={18} />
              <input
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value);
                  setVisible(50);
                }}
                placeholder='Search by airport code or name'
              />
            </label>
          </div>
          {filteredRoutes.length > 0 ? (
            <div className='table-scroll airport-routes-table-wrap'>
              <table className='data-table rich-schedule-table airport-routes-table'>
                <thead>
                  <tr>
                    <th aria-label='Expand details' />
                    <SortableHeading
                      label='Airport'
                      active={sort === 'airport'}
                      order={sortOrder}
                      onClick={() => updateSort('airport')}
                    />
                    <SortableHeading
                      label='Scheduled legs'
                      active={sort === 'volume'}
                      order={sortOrder}
                      onClick={() => updateSort('volume')}
                    />
                    <th>Airlines</th>
                    <th>Equipment</th>
                    <SortableHeading
                      label='Average duration'
                      active={sort === 'duration'}
                      order={sortOrder}
                      onClick={() => updateSort('duration')}
                    />
                  </tr>
                </thead>
                <tbody>
                  {filteredRoutes.slice(0, visible).map((route) => {
                    const airport = summary.airports[route.otherAirportId];
                    const expanded = route.otherAirportId === expandedAirportId;
                    return (
                      <RouteRows
                        key={route.otherAirportId}
                        route={route}
                        airportName={airport?.name ?? route.otherAirportId}
                        airportCode={airport?.iataCode ?? route.otherAirportId}
                        countryCode={airport?.countryCode}
                        expanded={expanded}
                        summary={summary}
                        onToggle={() =>
                          setExpandedAirportId(expanded ? undefined : route.otherAirportId)
                        }
                      />
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState
              title='No routes match'
              description='Try another airport code, city, or airport name.'
            />
          )}
          <ShowMore
            visible={visible}
            total={filteredRoutes.length}
            batchSize={50}
            itemLabel='routes'
            onShowMore={() => setVisible(visible + 50)}
          />
        </Card>
      )}

      {routes.length === 0 && (
        <EmptyState
          title={`No scheduled ${direction === 'departure' ? 'departures' : 'arrivals'}`}
          description='This year has no route statistics in the selected direction.'
        />
      )}
    </section>
  );
}

function RouteRows({
  route,
  airportName,
  airportCode,
  countryCode,
  expanded,
  summary,
  onToggle,
}: {
  route: ReturnType<typeof aggregateAirportRoutes>[number];
  airportName: string;
  airportCode: string;
  countryCode: string | undefined;
  expanded: boolean;
  summary: AirportSummary;
  onToggle: () => void;
}) {
  return (
    <>
      <tr className='airport-route-row'>
        <td className='airport-route-expand-cell'>
          <button
            type='button'
            className='row-expand'
            aria-expanded={expanded}
            aria-label={`${expanded ? 'Collapse' : 'Expand'} airline and equipment breakdown for ${airportCode}`}
            onClick={onToggle}
          >
            {expanded ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
          </button>
        </td>
        <td data-label='Airport'>
          <div className='airport-route-airport-cell'>
            <Link className='airport-route-airport' to={`/airport/${route.otherAirportId}`}>
              <strong>{airportCode}</strong>
              <span>{airportName}</span>
            </Link>
            {countryCode && <small>{countryCode}</small>}
          </div>
        </td>
        <td data-label='Scheduled legs'>
          <strong>{route.scheduledLegs.toLocaleString()}</strong>
          <small>{dateRangeLabel(route.firstDateLocal, route.lastDateLocal)}</small>
        </td>
        <td data-label='Airlines'>{route.airlineIds.length}</td>
        <td data-label='Equipment'>{route.aircraftIds.length}</td>
        <td data-label='Average duration'>{duration(route.durationSecondsAverage)}</td>
      </tr>
      {expanded && (
        <tr className='expanded-table-row airport-route-breakdown-row'>
          <td colSpan={6}>
            <div className='airport-route-breakdown'>
              {route.breakdown
                .slice()
                .sort((left, right) => right.scheduledLegs - left.scheduledLegs)
                .map((row) => {
                  const airline = summary.airlines[row.operatingAirlineId];
                  const aircraft = summary.aircraft[row.aircraftId];
                  return (
                    <div key={`${row.operatingAirlineId}-${row.aircraftId}`}>
                      <strong>
                        {airline?.name ?? row.operatingAirlineId} ·{' '}
                        {aircraft?.name ?? row.aircraftId}
                      </strong>
                      <span>{row.scheduledLegs.toLocaleString()} scheduled legs</span>
                      <span>
                        Avg {duration(row.durationSecondsAverage)} · Median{' '}
                        {duration(row.durationSecondsMedian)}
                      </span>
                      <span>
                        Min {duration(row.durationSecondsMinimum)} · Max{' '}
                        {duration(row.durationSecondsMaximum)}
                      </span>
                    </div>
                  );
                })}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

function SortableHeading({
  label,
  active,
  order,
  onClick,
}: {
  label: string;
  active: boolean;
  order: SortOrder;
  onClick: () => void;
}) {
  return (
    <th aria-sort={active ? order : 'none'}>
      <button type='button' className='sort-button' onClick={onClick}>
        {label}
        {active && (order === 'ascending' ? <ArrowUp size={12} /> : <ArrowDown size={12} />)}
      </button>
    </th>
  );
}

function compareRoutes(
  left: ReturnType<typeof aggregateAirportRoutes>[number],
  right: ReturnType<typeof aggregateAirportRoutes>[number],
  sort: RouteSort,
  order: SortOrder,
  summary: AirportSummary,
) {
  let comparison = 0;
  if (sort === 'airport') {
    const leftAirport = summary.airports[left.otherAirportId];
    const rightAirport = summary.airports[right.otherAirportId];
    comparison = (leftAirport?.iataCode ?? left.otherAirportId).localeCompare(
      rightAirport?.iataCode ?? right.otherAirportId,
    );
  } else if (sort === 'duration') {
    comparison = left.durationSecondsAverage - right.durationSecondsAverage;
  } else {
    comparison = left.scheduledLegs - right.scheduledLegs;
  }

  if (comparison === 0) {
    comparison = left.otherAirportId.localeCompare(right.otherAirportId);
  }

  return order === 'ascending' ? comparison : -comparison;
}
