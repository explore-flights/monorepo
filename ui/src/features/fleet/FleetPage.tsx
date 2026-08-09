import { useQuery } from '@tanstack/react-query';
import { Radio, Rss } from 'lucide-react';
import { useState, type CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import { api } from '@/api/client';
import { Badge, EmptyState, ErrorState, Loading } from '@/components/primitives';
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
    artwork: string[];
  }
> = {
  allegris: {
    identifier: 'allegris',
    title: 'Lufthansa Allegris',
    short: 'Allegris',
    description: 'Follow flights scheduled with Lufthansa’s newest long-haul cabin generation.',
    accent: '#4f7cff',
    artwork: ['/assets/aircraft-a350-900.svg', '/assets/aircraft-787-dreamliner.svg'],
  },
  swiss350: {
    identifier: 'swiss350',
    title: 'SWISS Airbus A350',
    short: 'SWISS A350',
    description: 'Track the planned network for the newest aircraft in the SWISS long-haul fleet.',
    accent: '#e84749',
    artwork: ['/assets/aircraft-a350-900.svg'],
  },
  lh380: {
    identifier: 'lh380',
    title: 'Lufthansa Airbus A380',
    short: 'LH A380',
    description: 'See where Lufthansa plans to deploy its returning superjumbo fleet.',
    accent: '#7357df',
    artwork: ['/assets/aircraft-a380.svg'],
  },
  lh340: {
    identifier: 'lh340',
    title: 'Lufthansa Airbus A340',
    short: 'LH A340',
    description:
      'Explore the remaining published operation of Lufthansa’s four-engine Airbus fleet.',
    accent: '#e8892f',
    artwork: ['/assets/aircraft-a340-300.svg', '/assets/aircraft-a340-600.svg'],
  },
  lh747: {
    identifier: 'lh747',
    title: 'Lufthansa Boeing 747',
    short: 'LH 747',
    description: 'Follow scheduled passenger flights on Lufthansa’s iconic Queen of the Skies.',
    accent: '#16a074',
    artwork: ['/assets/aircraft-747-400.svg', '/assets/aircraft-747-8.svg'],
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
      <div className='fleet-hero'>
        <div className='fleet-plane'>
          {config.artwork.map((src) => (
            <img key={src} src={src} alt='' />
          ))}
        </div>
        <div>
          <Badge tone='blue'>
            <Radio size={13} />
            Fleet watch
          </Badge>
          <h1>{config.title}</h1>
          <p>{config.description}</p>
        </div>
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
      </div>

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
