import { FormEvent, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { PageHeader } from '@/components/primitives';
import { FlightAutocomplete } from '@/components/FlightAutocomplete';
import { normalizeFlightNumber } from '@/lib/format';

export function FlightsPage() {
  const [value, setValue] = useState('');
  const navigate = useNavigate();
  function submit(event: FormEvent) {
    event.preventDefault();
    const id = normalizeFlightNumber(value);
    if (id) {
      navigate(`/flight/${id}`);
    }
  }
  return (
    <div className='page narrow-page'>
      <PageHeader
        title='Flights'
        description='Look up a flight number to see its routes, aircraft and schedule history.'
      />
      <section className='flight-search-panel' aria-label='Flight lookup'>
        <form onSubmit={submit}>
          <label htmlFor='flight-lookup'>Flight number</label>
          <div className='input-action'>
            <FlightAutocomplete
              id='flight-lookup'
              value={value}
              onChange={setValue}
              onSelect={(flight) => navigate(`/flight/${encodeURIComponent(flight)}`)}
              placeholder='LH 400'
              autoFocus
            />
            <button type='submit' aria-label='Open flight' disabled={!value.trim()}>
              <ArrowRight size={22} strokeWidth={2.5} />
            </button>
          </div>
        </form>
      </section>
      <div className='popular-row'>
        <span>Try a flight</span>
        {['LH400', 'LH441', 'LX16', 'UA960'].map((flight) => (
          <Link key={flight} to={`/flight/${flight}`}>
            {flight}
          </Link>
        ))}
      </div>
      <div className='explain-grid'>
        <section>
          <h2>Schedules</h2>
          <p>View departure dates, routes and aircraft across the year.</p>
        </section>
        <section>
          <h2>History</h2>
          <p>Choose a departure date to see how its schedule has changed.</p>
        </section>
      </div>
      <Link className='flight-search-alternative' to='/tools/flight-search'>
        <div>
          <strong>Don’t have a flight number?</strong>
          <span>Search by airline, date, airport or aircraft.</span>
        </div>
        <span>
          Find flights <ArrowRight size={17} aria-hidden='true' />
        </span>
      </Link>
    </div>
  );
}
