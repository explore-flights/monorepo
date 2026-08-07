import { useQuery } from '@tanstack/react-query';
import {
  ArrowLeft,
  ArrowRight,
  Compass,
  ExternalLink,
  Globe2,
  List,
  Map as MapIcon,
  MapPin,
  PlaneTakeoff,
} from 'lucide-react';
import { Link, NavLink, Outlet, useOutletContext, useParams } from 'react-router-dom';
import { api } from '@/api/client';
import type { Airport } from '@/api/types';
import { FlightMap } from '@/components/FlightMap';
import {
  Badge,
  Card,
  EmptyState,
  ErrorState,
  Loading,
  PageHeader,
  Stat,
} from '@/components/primitives';
import { classNames } from '@/lib/format';

type Context = {
  airport: Airport;
  destinations: readonly Airport[];
  loading: boolean;
  error: Error | null;
};
export function AirportLayout() {
  const { airportId = '' } = useParams();
  const airports = useQuery({ queryKey: ['airports'], queryFn: api.airports });
  const airport = airports.data?.find(
    (a) => a.id === airportId || a.iataCode === airportId.toUpperCase(),
  );
  const destinations = useQuery({
    queryKey: ['destinations', airport?.id],
    queryFn: () => loadDestinations(airport),
    enabled: !!airport,
  });
  if (airports.isLoading) {
    return (
      <div className='page'>
        <Loading label='Loading airport…' />
      </div>
    );
  }
  if (airports.error) {
    return (
      <div className='page'>
        <ErrorState error={airports.error} />
      </div>
    );
  }
  if (!airport) {
    return (
      <div className='page'>
        <EmptyState
          title='Airport not found'
          description={`There is no airport matching “${airportId}”.`}
          action={
            <Link className='button button-primary' to='/airport'>
              Airport directory
            </Link>
          }
        />
      </div>
    );
  }
  return (
    <div className='page airport-page'>
      <div className='breadcrumbs'>
        <Link to='/airport'>
          <ArrowLeft size={14} />
          Airports
        </Link>
        <span>/</span>
        <span>{airport.iataCode}</span>
      </div>
      <PageHeader
        eyebrow={`${airport.type} · ${airport.countryCode}`}
        title={
          <>
            <span className='airport-title-code'>{airport.iataCode}</span>
            {airport.name}
          </>
        }
        description={`${airport.cityCode} · ${airport.timezone}`}
        actions={
          <Badge tone='blue'>
            <MapPin size={14} />
            {airport.location.lat.toFixed(2)}, {airport.location.lng.toFixed(2)}
          </Badge>
        }
      />
      <nav className='subnav'>
        <NavLink end to='.' className={({ isActive }) => classNames(isActive && 'active')}>
          <Compass size={16} />
          Overview
        </NavLink>
        <NavLink to='routes' className={({ isActive }) => classNames(isActive && 'active')}>
          <List size={16} />
          Routes
        </NavLink>
        <NavLink to='map' className={({ isActive }) => classNames(isActive && 'active')}>
          <MapIcon size={16} />
          Map
        </NavLink>
      </nav>
      <Outlet
        context={
          {
            airport,
            destinations: destinations.data ?? [],
            loading: destinations.isLoading,
            error: destinations.error,
          } satisfies Context
        }
      />
    </div>
  );
}

function loadDestinations(airport: Airport | undefined) {
  if (!airport) {
    return Promise.resolve([]);
  }

  return api.destinations(airport.id);
}
function useAirport() {
  return useOutletContext<Context>();
}
export function AirportOverview() {
  const { airport, destinations, loading, error } = useAirport();
  const countries = new Set(destinations.map((a) => a.countryCode));
  return (
    <>
      {loading && <Loading label='Loading destination network…' />}
      {error && <ErrorState error={error} />}
      <div className='stats-grid'>
        <Stat
          label='Published destinations'
          value={loading ? '—' : destinations.length}
          hint='Direct destinations'
        />
        <Stat label='Countries reached' value={loading ? '—' : countries.size} />
        <Stat label='Time zone' value={airport.timezone.split('/').at(-1)?.replace('_', ' ')} />
        <Stat
          label='Coordinates'
          value={`${airport.location.lat.toFixed(2)}°`}
          hint={`${airport.location.lng.toFixed(2)}° longitude`}
        />
      </div>
      <div className='airport-overview-grid'>
        <Card className='airport-facts'>
          <div className='card-heading'>
            <Globe2 />
            <div>
              <h2>Airport details</h2>
              <p>Reference information</p>
            </div>
          </div>
          <dl>
            <div>
              <dt>IATA code</dt>
              <dd>{airport.iataCode}</dd>
            </div>
            <div>
              <dt>ICAO code</dt>
              <dd>{airport.icaoCode ?? '—'}</dd>
            </div>
            <div>
              <dt>City code</dt>
              <dd>{airport.cityCode}</dd>
            </div>
            <div>
              <dt>Country</dt>
              <dd>{airport.countryCode}</dd>
            </div>
            <div>
              <dt>Airport type</dt>
              <dd>{airport.type}</dd>
            </div>
            <div>
              <dt>Timezone</dt>
              <dd>{airport.timezone}</dd>
            </div>
          </dl>
        </Card>
        <Card className='top-destinations'>
          <div className='card-heading'>
            <PlaneTakeoff />
            <div>
              <h2>Destinations</h2>
              <p>First published direct links</p>
            </div>
            <Link to='routes'>
              View all <ArrowRight size={15} />
            </Link>
          </div>
          <div>
            {destinations.slice(0, 8).map((item) => (
              <Link key={item.id} to={`/airport/${item.id}`}>
                <strong>{item.iataCode}</strong>
                <span>{item.name}</span>
                <small>{item.countryCode}</small>
              </Link>
            ))}
          </div>
          {!loading && !destinations.length && (
            <p className='muted-copy'>No published destinations found.</p>
          )}
        </Card>
      </div>
    </>
  );
}
export function AirportRoutes() {
  const { airport, destinations, loading, error } = useAirport();
  if (loading) {
    return <Loading label='Loading routes…' />;
  }
  if (error) {
    return <ErrorState error={error} />;
  }
  return (
    <section className='airport-subpage'>
      <div className='section-heading'>
        <div>
          <span className='eyebrow'>Direct network</span>
          <h2>
            {destinations.length} destinations from {airport.iataCode}
          </h2>
        </div>
      </div>
      {destinations.length ? (
        <Card className='table-card'>
          <div className='table-scroll'>
            <table className='data-table'>
              <thead>
                <tr>
                  <th>Destination</th>
                  <th>Airport</th>
                  <th>Country</th>
                  <th>Timezone</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {destinations.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <strong className='large-code'>{item.iataCode}</strong>
                      <small>{item.icaoCode}</small>
                    </td>
                    <td>
                      <strong>{item.name}</strong>
                      <small>{item.cityCode}</small>
                    </td>
                    <td>{item.countryCode}</td>
                    <td>{item.timezone}</td>
                    <td>
                      <Link className='icon-link' to={`/airport/${item.id}`}>
                        <ExternalLink size={15} />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ) : (
        <EmptyState
          title='No routes published'
          description='The current dataset has no direct destinations for this airport.'
        />
      )}
    </section>
  );
}
export function AirportMapPage() {
  const { airport, destinations, loading, error } = useAirport();
  if (loading) {
    return <Loading label='Building route map…' />;
  }
  if (error) {
    return <ErrorState error={error} />;
  }
  return (
    <section className='airport-subpage'>
      <div className='section-heading'>
        <div>
          <span className='eyebrow'>Geographic view</span>
          <h2>Network map</h2>
          <p>Direct published destinations from {airport.name}.</p>
        </div>
      </div>
      <FlightMap
        airports={[airport, ...destinations]}
        routes={destinations.map((to) => ({ from: airport, to }))}
        height={590}
      />
    </section>
  );
}
