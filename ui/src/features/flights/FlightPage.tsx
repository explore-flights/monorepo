import { useQuery } from '@tanstack/react-query';
import { ArrowRight, History } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '@/api/client';
import type { FlightSchedules } from '@/api/types';
import { Badge, Card, ErrorState, Loading, PageHeader, Stat } from '@/components/primitives';
import { YearSwitcher } from '@/components/ScheduleControls';
import { aircraftName, airlineName, airportCode, dateLabel, flightName } from '@/lib/format';
import { displayVariantFor } from '@/lib/schedules';
import { discoverYearlyData, loadYearlyData, type YearSelection } from '@/lib/yearlyData';
import { useCurrentDate } from '@/lib/useCurrentDate';
import { FlightScheduleWorkspace } from './FlightScheduleWorkspace';

interface SemanticCounts {
  records: number;
  operatingRecords: number;
  cancelledRecords: number;
  dates: number;
  changedDates: number;
  changedRecords: number;
  multiLeg: boolean;
}

export function FlightPage() {
  const { flightNumber = '' } = useParams();
  const normalized = flightNumber.toUpperCase();
  return <FlightPageForNumber key={normalized} flightNumber={normalized} />;
}

function FlightPageForNumber({ flightNumber: normalized }: { flightNumber: string }) {
  const currentYear = useCurrentDate().getFullYear();
  const [selection, setSelection] = useState<YearSelection>({ mode: 'discover' });
  const selectedYear = selection.mode === 'single' ? selection.year : currentYear;
  const query = useQuery({
    queryKey: ['flight', normalized, selection.mode, selectedYear],
    queryFn: () =>
      selection.mode === 'discover'
        ? discoverFlightSchedule(normalized, currentYear)
        : loadFlightSchedule(normalized, selection.year),
    retry: false,
  });
  const data = query.data?.data;
  const year = query.data?.year ?? selectedYear;
  const selectYear = (nextYear: number) => setSelection({ mode: 'single', year: nextYear });
  const semanticCounts = useMemo<SemanticCounts>(() => {
    const items = data?.items ?? [];
    const byDate = new Map<string, typeof items>();
    for (const item of items) {
      byDate.set(item.departureDateLocal, [...(byDate.get(item.departureDateLocal) ?? []), item]);
    }
    return {
      records: items.length,
      operatingRecords: items.filter((item) => Boolean(item.flightVariantId)).length,
      cancelledRecords: items.filter((item) => item.flightVariantId == null).length,
      dates: byDate.size,
      changedDates: [...byDate.values()].filter((entries) =>
        entries.some((item) => item.versionCount > 1),
      ).length,
      changedRecords: items.filter((item) => item.versionCount > 1).length,
      multiLeg: [...byDate.values()].some((entries) => entries.length > 1),
    };
  }, [data]);
  const routes = useMemo(() => {
    if (!data) {
      return [];
    }
    return [
      ...new Set(
        data.items.flatMap((item) => {
          const variant = displayVariantFor(data, item);
          return variant
            ? [
                `${airportCode(item.departureAirportId, data.airports)} → ${airportCode(variant.arrivalAirportId, data.airports)}`,
              ]
            : [];
        }),
      ),
    ];
  }, [data]);
  const aircraft = useMemo(() => {
    if (!data) {
      return [];
    }
    const ids = new Set(
      data.items.flatMap((item) => {
        const variant = displayVariantFor(data, item);
        return variant ? [variant.aircraftId] : [];
      }),
    );
    return [...ids].map((id) => {
      const name = aircraftName(id, data.aircraft);
      return { name, shortName: name.replace(/^(Airbus|Boeing)\s+/, '') };
    });
  }, [data]);

  return (
    <div className='page flight-page'>
      <div className='breadcrumbs'>
        <Link to='/flight'>Flights</Link>
        <span>/</span>
        <span>{normalized}</span>
      </div>
      <PageHeader
        eyebrow='Flight schedule'
        title={normalized}
        description={
          data ? (
            <span className='flight-header-details'>
              <span>
                {airlineName(data.flightNumber.airlineId, data.airlines)} · Airport local time with
                UTC offsets
              </span>
              {data.relatedFlightNumbers.length > 0 && (
                <span className='header-related-flights'>
                  <span>Related flight numbers</span>
                  <span>
                    {data.relatedFlightNumbers.map((flight) => (
                      <Link
                        key={flightName(flight, data.airlines)}
                        to={`/flight/${flightName(flight, data.airlines)}`}
                      >
                        <Badge tone='blue'>{flightName(flight, data.airlines)}</Badge>
                      </Link>
                    ))}
                  </span>
                </span>
              )}
            </span>
          ) : (
            'Published schedule'
          )
        }
        actions={<YearSwitcher year={year} onChange={selectYear} />}
      />
      {query.isLoading && <Loading label={`Loading ${normalized}…`} />}
      {query.error && (
        <ErrorState error={query.error} title={`No schedule found for ${normalized}`} />
      )}
      {data && (
        <>
          <div className='stats-grid'>
            <Stat
              label={semanticCounts.multiLeg ? 'Published legs' : 'Published departures'}
              value={semanticCounts.records}
              hint={scheduleCountHint(semanticCounts)}
            />
            <Stat
              label='Routes'
              value={routes.length}
              hint={routes.slice(0, 2).join(' · ') || 'No operating routes'}
            />
            <Stat
              label='Aircraft types'
              value={aircraft.length}
              hint={
                aircraft.length ? (
                  <span
                    className='aircraft-codes'
                    title={aircraft.map((item) => item.name).join(' · ')}
                  >
                    {aircraft.map((item) => item.shortName).join(' · ')}
                  </span>
                ) : (
                  'No equipment'
                )
              }
            />
            <Stat
              label='Changed dates'
              value={semanticCounts.changedDates}
              hint={
                semanticCounts.multiLeg
                  ? `${semanticCounts.changedRecords} revised legs`
                  : 'With version history'
              }
            />
          </div>
          <FlightScheduleWorkspace
            key={`${normalized}-${year}`}
            data={data}
            flightNumber={normalized}
            year={year}
          />
          {data.updateReport.length > 0 && (
            <section className='minor-section'>
              <div className='section-heading'>
                <div>
                  <span className='eyebrow'>Imports</span>
                  <h2>Recent data changes</h2>
                </div>
                <Link to='#changes' className='section-heading-action'>
                  Flight changes <ArrowRight size={16} />
                </Link>
              </div>
              <div className='update-strip'>
                {data.updateReport
                  .slice(-6)
                  .reverse()
                  .map((update) => (
                    <Card key={update.version}>
                      <History size={18} />
                      <strong>
                        {dateLabel(update.version, { month: 'short', day: 'numeric' })}
                      </strong>
                      <span>
                        <i className='green-dot' />
                        {update.added} added
                      </span>
                      <span>
                        <i className='amber-dot' />
                        {update.updated} updated
                      </span>
                    </Card>
                  ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}

async function loadFlightSchedule(flightNumber: string, year: number) {
  return loadYearlyData(year, (selectedYear) => api.flight(flightNumber, selectedYear));
}

async function discoverFlightSchedule(
  flightNumber: string,
  currentYear: number,
): Promise<{ data: FlightSchedules; year: number }> {
  return discoverYearlyData({
    currentYear,
    load: (year) => api.flight(flightNumber, year),
    hasData: (data) => data.items.length > 0,
    emptyMessage: (year) => `No schedule data found for ${flightNumber} in ${year}`,
    notFoundMessage: `No schedule found for ${flightNumber}`,
  });
}

function scheduleCountHint(counts: SemanticCounts) {
  if (counts.cancelledRecords > 0) {
    return `${counts.operatingRecords} operating · ${counts.cancelledRecords} cancelled`;
  }

  if (counts.multiLeg) {
    return `${counts.dates} departure dates`;
  }

  return `${counts.records} dated records`;
}
