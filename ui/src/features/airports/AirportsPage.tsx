import { useQuery } from '@tanstack/react-query';
import { ArrowRight, Globe2, List, Map as MapIcon, MapPin, Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '@/api/client';
import { FlightMap } from '@/components/FlightMap';
import { filterSelectOptions } from '@/components/picker/selectOptions';
import { Button, Card, EmptyState, ErrorState, Loading, PageHeader } from '@/components/primitives';
import { airportSelectOptions } from '@/components/selectOptions';
import { SimpleSelect } from '@/components/SimpleSelect';
import { airportTypeLabel, numberLabel } from '@/lib/format';
import { useHashView } from '@/lib/useHashView';

const airportViews = ['directory', 'map'] as const;
type AirportView = (typeof airportViews)[number];

export function AirportsPage() {
  const { view, hrefFor } = useHashView<AirportView>('directory', airportViews);
  const query = useQuery({ queryKey: ['airports'], queryFn: api.airports });
  const [search, setSearch] = useState('');
  const [country, setCountry] = useState('all');
  const countries = useMemo(
    () => [...new Set(query.data?.map((a) => a.countryCode) ?? [])].sort(),
    [query.data],
  );
  const airports = useMemo(() => {
    const countryAirports =
      query.data?.filter((airport) => country === 'all' || airport.countryCode === country) ?? [];
    const airportsById = new Map(countryAirports.map((airport) => [airport.id, airport]));

    return filterSelectOptions(airportSelectOptions(countryAirports), search).flatMap((option) => {
      const airport = airportsById.get(option.value);
      return airport ? [airport] : [];
    });
  }, [country, query.data, search]);
  return (
    <div className='page airports-page'>
      <PageHeader
        title='Airports'
        description='Browse airports and their published routes and schedules.'
        actions={
          <span className='airport-count'>
            <Globe2 size={17} />
            {query.data?.length ?? '—'} airports
          </span>
        }
      />
      <Card className='directory-toolbar'>
        <label className='directory-search'>
          <span>Airport or city</span>
          <div className='search-input'>
            <Search size={18} />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label='Search airports'
              placeholder='Search by code, airport or city'
            />
          </div>
        </label>
        <label>
          <span>Country</span>
          <SimpleSelect value={country} onChange={(e) => setCountry(e.target.value)}>
            <option value='all'>All countries</option>
            {countries.map((country) => (
              <option key={country}>{country}</option>
            ))}
          </SimpleSelect>
        </label>
      </Card>
      <div className='directory-results-heading'>
        <nav className='subnav airport-directory-tabs' aria-label='Airport directory view'>
          <Link
            to={hrefFor('directory')}
            className={view === 'directory' ? 'active' : ''}
            aria-current={view === 'directory' ? 'page' : undefined}
          >
            <List size={16} />
            Directory
          </Link>
          <Link
            id='map'
            to={hrefFor('map')}
            className={view === 'map' ? 'active' : ''}
            aria-current={view === 'map' ? 'page' : undefined}
          >
            <MapIcon size={16} />
            Map
          </Link>
        </nav>
        {query.data && (
          <div className='directory-results-summary'>
            <span role='status'>
              {numberLabel(airports.length)} of {numberLabel(query.data.length)} airports
            </span>
            {(search || country !== 'all') && (
              <Button
                variant='ghost'
                onClick={() => {
                  setSearch('');
                  setCountry('all');
                }}
              >
                Clear filters
              </Button>
            )}
          </div>
        )}
      </div>
      {query.isLoading && <Loading label='Loading airport directory…' />}
      {query.error && <ErrorState error={query.error} />}
      {view === 'directory' && (
        <div className='airport-grid'>
          {airports.map((airport) => (
            <Link className='airport-card' to={`/airport/${airport.id}`} key={airport.id}>
              <div className='airport-code'>{airport.iataCode}</div>
              <div className='airport-info'>
                <h2>{airport.name}</h2>
                <p>
                  <MapPin size={14} />
                  {airport.cityCode} · {airport.countryCode}
                </p>
                <span>{airport.icaoCode ?? airportTypeLabel(airport.type)}</span>
              </div>
              <ArrowRight className='airport-open' size={19} />
            </Link>
          ))}
        </div>
      )}
      {view === 'map' && airports.length > 0 && (
        <FlightMap routes={[]} airports={airports} height={620} airportLinks />
      )}
      {query.data && airports.length === 0 && (
        <EmptyState title='No airports match' description='Try a code, city, or another country.' />
      )}
    </div>
  );
}
