import { useQuery } from '@tanstack/react-query';
import { Rss } from 'lucide-react';
import { useState, type CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import { api } from '@/api/client';
import { EmptyState, ErrorState, Loading, PageHeader } from '@/components/primitives';
import { YearSwitcher } from '@/components/ScheduleControls';
import { ScheduleResults } from '@/features/schedules/ScheduleResults';
import { discoverYearlyData, loadYearlyData, type YearSelection } from '@/lib/yearlyData';
import { useCurrentDate } from '@/lib/useCurrentDate';

const fleetConfig: Record<
  string,
  {
    identifier: string;
    title: string;
    short: string;
    description: string;
    accent: string;
  }
> = {
  allegris: {
    identifier: 'allegris',
    title: 'Lufthansa Allegris',
    short: 'Allegris',
    description: 'Published routes and schedules for Lufthansa Allegris cabins.',
    accent: 'var(--fleet-accent-allegris)',
  },
  swiss350: {
    identifier: 'swiss350',
    title: 'SWISS Airbus A350',
    short: 'SWISS A350',
    description: 'Published routes and schedules for the SWISS A350 fleet.',
    accent: 'var(--fleet-accent-swiss-a350)',
  },
  lh380: {
    identifier: 'lh380',
    title: 'Lufthansa Airbus A380',
    short: 'LH A380',
    description: 'Published routes and schedules for the Lufthansa A380 fleet.',
    accent: 'var(--fleet-accent-lufthansa-a380)',
  },
  lh340: {
    identifier: 'lh340',
    title: 'Lufthansa Airbus A340',
    short: 'LH A340',
    description: 'Published routes and schedules for the Lufthansa A340 fleet.',
    accent: 'var(--fleet-accent-lufthansa-a340)',
  },
  lh747: {
    identifier: 'lh747',
    title: 'Lufthansa Boeing 747',
    short: 'LH 747',
    description: 'Published routes and schedules for the Lufthansa 747 fleet.',
    accent: 'var(--fleet-accent-lufthansa-747)',
  },
};

export function FleetPage({ fleetId = 'allegris' }: { fleetId?: string }) {
  return <FleetPageForId key={fleetId} fleetId={fleetId} />;
}

export function AllegrisPage() {
  return <FleetPage fleetId='allegris' />;
}

export function SwissA350Page() {
  return <FleetPage fleetId='swiss350' />;
}

export function LufthansaA380Page() {
  return <FleetPage fleetId='lh380' />;
}

export function LufthansaA340Page() {
  return <FleetPage fleetId='lh340' />;
}

export function Lufthansa747Page() {
  return <FleetPage fleetId='lh747' />;
}

function FleetPageForId({ fleetId }: { fleetId: string }) {
  const config = fleetConfig[fleetId];
  const currentYear = useCurrentDate().getFullYear();
  const [selection, setSelection] = useState<YearSelection>({ mode: 'discover' });
  const selectedYear = selection.mode === 'single' ? selection.year : currentYear;
  const query = useQuery({
    queryKey: ['fleet', config?.identifier, selection.mode, selectedYear],
    queryFn: () =>
      selection.mode === 'discover'
        ? discoverFleetSchedule(config?.identifier ?? '', currentYear)
        : loadFleetSchedule(config?.identifier ?? '', selection.year),
    enabled: !!config,
    retry: false,
  });

  if (!config) {
    return (
      <div className='page'>
        <EmptyState
          title='Fleet watch not found'
          description='This specialty fleet page does not exist.'
          action={
            <Link to='/allegris' className='button button-primary'>
              Open Allegris
            </Link>
          }
        />
      </div>
    );
  }

  const data = query.data?.data;
  const year = query.data?.year ?? selectedYear;
  const pageStyle: CSSProperties & { '--fleet-accent': string } = {
    '--fleet-accent': config.accent,
  };

  return (
    <div className='page fleet-page' style={pageStyle}>
      <div className='breadcrumbs'>
        <span>Fleet watch</span>
        <span>/</span>
        <span>{config.short}</span>
      </div>
      <PageHeader
        title={config.title}
        description={config.description}
        actions={
          <div className='fleet-hero-actions'>
            {['allegris', 'swiss350'].includes(config.identifier) && (
              <div className='fleet-hero-action'>
                <span>Follow schedule</span>
                <div className='fleet-feed-actions' aria-label='Schedule feeds'>
                  <a
                    href={`/data/schedule/${config.identifier}/feed.rss`}
                    target='_blank'
                    rel='nofollow noreferrer'
                    type='application/rss+xml'
                  >
                    <Rss size={14} /> RSS
                  </a>
                  <a
                    href={`/data/schedule/${config.identifier}/feed.atom`}
                    target='_blank'
                    rel='nofollow noreferrer'
                    type='application/atom+xml'
                  >
                    <Rss size={14} /> Atom
                  </a>
                </div>
              </div>
            )}
            <div className='fleet-hero-action'>
              <span>Schedule year</span>
              <YearSwitcher
                year={year}
                onChange={(nextYear) => setSelection({ mode: 'single', year: nextYear })}
              />
            </div>
          </div>
        }
      />

      {query.isLoading && <Loading label={`Loading ${config.short} schedules…`} />}
      {query.error && <ErrorState error={query.error} />}
      {data && (
        <ScheduleResults
          key={`${config.identifier}-${year}`}
          data={data}
          year={year}
          scheduleTitle={`${config.short} schedule`}
        />
      )}
    </div>
  );
}

async function loadFleetSchedule(identifier: string, year: number) {
  return loadYearlyData(year, (selectedYear) => api.special(identifier, selectedYear));
}

async function discoverFleetSchedule(identifier: string, currentYear: number) {
  return discoverYearlyData({
    currentYear,
    load: (year) => api.special(identifier, year),
    hasData: (data) => data.schedules.some((schedule) => schedule.items.length > 0),
    emptyMessage: (year) => `No fleet schedule data found for ${identifier} in ${year}`,
    notFoundMessage: `No fleet schedule found for ${identifier}`,
  });
}
