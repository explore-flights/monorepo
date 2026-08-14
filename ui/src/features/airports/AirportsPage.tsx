import { useQuery } from '@tanstack/react-query';
import { ArrowRight, Globe2, List, Map as MapIcon, MapPin, Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '@/api/client';
import { FlightMap } from '@/components/FlightMap';
import { filterSelectOptions } from '@/components/picker/selectOptions';
import { Card, ErrorState, Loading, PageHeader } from '@/components/primitives';
import { airportSelectOptions } from '@/components/selectOptions';
import { SimpleSelect } from '@/components/SimpleSelect';
import { useHashView } from '@/lib/useHashView';

const airportViews = ['directory', 'map'] as const;
type AirportView = (typeof airportViews)[number];

export function AirportsPage() {
  const { view, hrefFor } = useHashView<AirportView>('directory', airportViews);
  const query = useQuery({ queryKey: ['airports'], queryFn: api.airports });
  const [search, setSearch] = useState('');
  const [region, setRegion] = useState('all');
  const countries = useMemo(
    () => [...new Set(query.data?.map((a) => a.countryCode) ?? [])].sort(),
    [query.data],
  );
  const airports = useMemo(() => {
    const regionAirports =
      query.data?.filter((airport) => region === 'all' || airport.countryCode === region) ?? [];
    const airportsById = new Map(regionAirports.map((airport) => [airport.id, airport]));

    return filterSelectOptions(airportSelectOptions(regionAirports), search).flatMap((option) => {
      const airport = airportsById.get(option.value);
      return airport ? [airport] : [];
    });
  }, [query.data, search, region]);
  return (
    <div className='page airports-page'>
      <PageHeader
        eyebrow='Airport directory'
        title='Explore the network'
        description='Find an airport, see its published destinations and switch between route lists and a geographic network view.'
        actions={
          <span className='airport-count'>
            <Globe2 size={17} />
            {query.data?.length ?? '—'} airports
          </span>
        }
      />
      <Card className='directory-toolbar'>
        <label className='search-input'>
          <Search size={18} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder='Search by code, airport or city'
          />
        </label>
        <label>
          <span>Country</span>
          <SimpleSelect value={region} onChange={(e) => setRegion(e.target.value)}>
            <option value='all'>All countries</option>
            {countries.map((country) => (
              <option key={country}>{country}</option>
            ))}
          </SimpleSelect>
        </label>
      </Card>
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
                <span>{airport.icaoCode ?? airport.type}</span>
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
        <Card className='empty-state'>
          <MapIcon />
          <h3>No airports match</h3>
          <p>Try a code, city, or another country.</p>
        </Card>
      )}
    </div>
  );
}
