import { FormEvent, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, CalendarRange, History, Plane } from 'lucide-react';
import { Badge, Card, PageHeader } from '@/components/primitives';
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
        eyebrow='Flight explorer'
        title='Inspect a flight number'
        description='See its published schedule across the year, operating airline, aircraft, routes and individual version history.'
      />
      <Card className='flight-search-panel'>
        <div className='flight-search-visual'>
          <Plane size={38} />
          <span className='flight-path' />
        </div>
        <form onSubmit={submit}>
          <label>Marketing flight number</label>
          <div className='input-action large-input'>
            <FlightAutocomplete
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
          <p>Enter a flight number to explore its routes, schedule and aircraft.</p>
        </form>
      </Card>
      <div className='explain-grid'>
        <Card>
          <span className='feature-icon blue'>
            <CalendarRange />
          </span>
          <h2>Whole-year schedule</h2>
          <p>
            Understand when and where a flight operates, including seasonal changes and aircraft
            assignments.
          </p>
        </Card>
        <Card>
          <span className='feature-icon amber'>
            <History />
          </span>
          <h2>Version history</h2>
          <p>
            Open any dated departure to see the exact sequence of schedule changes for that flight.
          </p>
        </Card>
      </div>
      <div className='popular-row'>
        <span>Popular lookups</span>
        {['LH400', 'LH441', 'LX16', 'UA960'].map((flight) => (
          <button key={flight} onClick={() => navigate(`/flight/${flight}`)}>
            <Badge tone='neutral'>{flight}</Badge>
          </button>
        ))}
      </div>
    </div>
  );
}
