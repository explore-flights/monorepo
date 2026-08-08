import { ArrowRight, GitBranch, Globe2, History, Network, PlaneTakeoff, Route } from 'lucide-react';
import { FormEvent, useState } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { FlightAutocomplete } from '@/components/FlightAutocomplete';
import { Badge, Card } from '@/components/primitives';
import { normalizeFlightNumber } from '@/lib/format';

const fleet = [
  ['Allegris', 'Lufthansa’s new cabin generation', '/allegris', '/assets/aircraft-a350-900.svg'],
  ['SWISS A350', 'Follow the newest long-haul fleet', '/swiss350', '/assets/aircraft-a350-900.svg'],
  ['Lufthansa A380', 'See where the superjumbo flies', '/lh380', '/assets/aircraft-a380.svg'],
] as const;

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
      navigate(`/flight/${value}`);
    }
  }
  return (
    <div className='page home-page'>
      <section className='home-hero'>
        <div className='hero-copy'>
          <Badge tone='blue'>Schedule intelligence</Badge>
          <h1>
            The world’s flight schedules, made <em>explorable.</em>
          </h1>
          <p>
            Search routes, inspect a flight’s history, discover airport networks and follow the
            aircraft that matter to you.
          </p>
          <div className='hero-actions'>
            <Link className='button button-primary' to='/connections'>
              <GitBranch size={18} /> Find a connection
            </Link>
            <Link className='button button-secondary' to='/airport'>
              <Globe2 size={18} /> Explore airports
            </Link>
          </div>
        </div>
        <Card className='flight-lookup'>
          <div className='lookup-icon'>
            <PlaneTakeoff size={26} />
          </div>
          <div>
            <span className='eyebrow'>Quick lookup</span>
            <h2>Open a flight schedule</h2>
            <p>Enter a marketing flight number to see operating details, aircraft and changes.</p>
          </div>
          <form onSubmit={submit}>
            <label htmlFor='home-flight'>Flight number</label>
            <div className='input-action'>
              <FlightAutocomplete
                id='home-flight'
                value={flight}
                onChange={setFlight}
                onSelect={(value) => navigate(`/flight/${encodeURIComponent(value)}`)}
                placeholder='LH 400'
              />
              <button type='submit' aria-label='Open flight' disabled={!flight.trim()}>
                <ArrowRight size={20} strokeWidth={2.5} />
              </button>
            </div>
          </form>
          <div className='quick-flights'>
            <span>Try</span>
            {['LH400', 'LX16'].map((item) => (
              <button key={item} onClick={() => navigate(`/flight/${item}`)}>
                {item}
              </button>
            ))}
          </div>
        </Card>
      </section>
      <section className='feature-grid'>
        <Link to='/connections' className='feature-card'>
          <span className='feature-icon blue'>
            <Route />
          </span>
          <div>
            <h2>Connection finder</h2>
            <p>
              Build multi-stop journeys and compare them as itineraries, a network graph or on a
              map.
            </p>
          </div>
          <ArrowRight />
        </Link>
        <Link to='/updates' className='feature-card'>
          <span className='feature-icon green'>
            <History />
          </span>
          <div>
            <h2>Schedule updates</h2>
            <p>Track how many flights were added, changed or removed in each data import.</p>
          </div>
          <ArrowRight />
        </Link>
        <Link to='/airport' className='feature-card'>
          <span className='feature-icon amber'>
            <Network />
          </span>
          <div>
            <h2>Airport networks</h2>
            <p>Browse airports, inspect destinations and understand each hub’s reach.</p>
          </div>
          <ArrowRight />
        </Link>
      </section>
      <section className='home-section'>
        <div className='section-heading'>
          <div>
            <span className='eyebrow'>Fleet watch</span>
            <h2>Follow distinctive aircraft</h2>
          </div>
          <Link to='/allegris'>
            Open fleet watch <ArrowRight size={16} />
          </Link>
        </div>
        <div className='fleet-preview'>
          {fleet.map(([name, copy, href, artwork], index) => (
            <Link key={name} to={href} className={`fleet-preview-card fleet-${index}`}>
              <img className='fleet-preview-aircraft' src={artwork} alt='' loading='lazy' />
              <span>0{index + 1}</span>
              <div>
                <h3>{name}</h3>
                <p>{copy}</p>
              </div>
              <ArrowRight />
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
