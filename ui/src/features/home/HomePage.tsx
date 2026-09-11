import { ArrowRight, Filter, GitBranch, History, MapPin } from 'lucide-react';
import { FormEvent, useState } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { FlightAutocomplete } from '@/components/FlightAutocomplete';
import { normalizeFlightNumber } from '@/lib/format';
import styles from './HomePage.module.css';

const tools = [
  {
    name: 'Flight search',
    copy: 'Find flights by airline, date, route or aircraft.',
    href: '/tools/flight-search',
    icon: Filter,
  },
  {
    name: 'Connections',
    copy: 'Find routes between airports, including stopovers.',
    href: '/connections',
    icon: GitBranch,
  },
  {
    name: 'Airports',
    copy: 'Browse destinations and schedules by airport.',
    href: '/airport',
    icon: MapPin,
  },
  {
    name: 'Schedule updates',
    copy: 'See what changed in the latest schedules.',
    href: '/updates',
    icon: History,
  },
];

const fleet = [
  { name: 'Lufthansa Allegris', href: '/allegris' },
  { name: 'SWISS A350', href: '/swiss350' },
  { name: 'Lufthansa A380', href: '/lh380' },
  { name: 'Lufthansa A340', href: '/lh340' },
  { name: 'Lufthansa 747', href: '/lh747' },
];

export function HomePage() {
  const [searchParams] = useSearchParams();
  const [flight, setFlight] = useState('');
  const navigate = useNavigate();
  const sharedSearch = searchParams.get('search');

  if (sharedSearch) {
    return <Navigate to={`/connections?search=${encodeURIComponent(sharedSearch)}`} replace />;
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    const value = normalizeFlightNumber(flight);
    if (value) {
      navigate(`/flight/${encodeURIComponent(value)}`);
    }
  }

  return (
    <div className={`page ${styles.page}`}>
      <header className={styles.intro}>
        <h1>Explore flight schedules</h1>
        <p>Routes, aircraft and schedule history, all in one place.</p>
      </header>
      <section className={styles.lookup} aria-labelledby='home-lookup-title'>
        <h2 id='home-lookup-title'>Look up a flight</h2>
        <p className={styles.lookupCopy}>
          Start with a flight number to explore its schedule and history.
        </p>
        <form onSubmit={submit}>
          <label htmlFor='home-flight'>Flight number</label>
          <div className='input-action'>
            <FlightAutocomplete
              id='home-flight'
              value={flight}
              onChange={setFlight}
              onSelect={(value) => navigate(`/flight/${encodeURIComponent(value)}`)}
              placeholder='e.g. LH 400'
            />
            <button
              type='submit'
              aria-label='Open flight'
              disabled={!normalizeFlightNumber(flight)}
            >
              <ArrowRight size={20} />
            </button>
          </div>
        </form>
        <p className={styles.examples}>
          Try <Link to='/flight/LH400'>LH 400</Link> or <Link to='/flight/LX16'>LX 16</Link>
        </p>
      </section>
      <section className={styles.explore} aria-labelledby='home-tools-title'>
        <h2 id='home-tools-title'>Explore schedules</h2>
        <nav className={styles.tools} aria-label='Explore schedules'>
          {tools.map(({ name, copy, href, icon: Icon }) => (
            <Link key={href} to={href} className={styles.tool}>
              <span className={styles.toolIcon}>
                <Icon size={20} aria-hidden='true' />
              </span>
              <div>
                <h3>{name}</h3>
                <p>{copy}</p>
              </div>
              <ArrowRight size={18} aria-hidden='true' />
            </Link>
          ))}
        </nav>
      </section>
      <section className={styles.fleet} aria-labelledby='home-fleet-title'>
        <h2 id='home-fleet-title'>Fleet watch</h2>
        <div className={styles.fleetLinks}>
          {fleet.map(({ name, href }) => (
            <Link key={href} to={href}>
              {name}
              <ArrowRight size={14} aria-hidden='true' />
            </Link>
          ))}
        </div>
      </section>
      <p className={styles.coverage}>
        Schedules cover selected airlines. <Link to='/about'>View data coverage</Link>
      </p>
    </div>
  );
}
