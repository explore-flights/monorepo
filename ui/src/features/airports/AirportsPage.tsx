import { useQuery } from '@tanstack/react-query';
import { ArrowRight, Globe2, Map, MapPin, Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '@/api/client';
import { Card, ErrorState, Loading, PageHeader } from '@/components/primitives';
import { SimpleSelect } from '@/components/SimpleSelect';

export function AirportsPage() {
  const query = useQuery({ queryKey: ['airports'], queryFn: api.airports });
  const [search, setSearch] = useState('');
  const [region, setRegion] = useState('all');
  const countries = useMemo(
    () => [...new Set(query.data?.map((a) => a.countryCode) ?? [])].sort(),
    [query.data],
  );
  const airports = useMemo(
    () =>
      query.data?.filter((a) => {
        const q = search.toLowerCase();
        return (
          (region === 'all' || a.countryCode === region) &&
          (!q ||
            `${a.iataCode} ${a.icaoCode ?? ''} ${a.name} ${a.cityCode}`.toLowerCase().includes(q))
        );
      }) ?? [],
    [query.data, search, region],
  );
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
      {query.isLoading && <Loading label='Loading airport directory…' />}
      {query.error && <ErrorState error={query.error} />}
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
      {query.data && airports.length === 0 && (
        <Card className='empty-state'>
          <Map />
          <h3>No airports match</h3>
          <p>Try a code, city, or another country.</p>
        </Card>
      )}
    </div>
  );
}
