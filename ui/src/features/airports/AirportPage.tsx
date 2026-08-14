import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, BarChart3, Compass, List, Map as MapIcon, Plane } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '@/api/client';
import type { Airport, AirportMovementDirection, AirportSummary } from '@/api/types';
import { YearSwitcher } from '@/components/ScheduleControls';
import { Card, EmptyState, ErrorState, Loading, PageHeader } from '@/components/primitives';
import { discoverYearlyData, loadYearlyData, type YearSelection } from '@/lib/yearlyData';
import { useCurrentDate } from '@/lib/useCurrentDate';
import { useHashView } from '@/lib/useHashView';
import { AirportFlights } from './AirportFlights';
import { AirportMap } from './AirportMap';
import { AirportOverview, AirportFacts } from './AirportOverview';
import { AirportRoutes } from './AirportRoutes';
import { AirportStatistics } from './AirportStatistics';
import { airportLocalDate, defaultAirportDate, defaultDirection } from './airportData';

const airportViews = ['overview', 'flights', 'routes', 'statistics', 'map'] as const;
type AirportView = (typeof airportViews)[number];

export function AirportLayout() {
  const { view, hrefFor, selectView } = useHashView<AirportView>('overview', airportViews);
  const { airportId = '' } = useParams();
  const airports = useQuery({ queryKey: ['airports'], queryFn: api.airports });
  const airport = airports.data?.find(
    (item) => item.id === airportId || item.iataCode === airportId.toUpperCase(),
  );

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
    <AirportPageForAirport
      key={airport.id}
      airport={airport}
      view={view}
      hrefFor={hrefFor}
      selectView={selectView}
    />
  );
}

function AirportPageForAirport({
  airport,
  view,
  hrefFor,
  selectView,
}: {
  airport: Airport;
  view: AirportView;
  hrefFor: (view: AirportView) => { pathname: string; search: string; hash: string };
  selectView: (view: AirportView) => void;
}) {
  const now = useCurrentDate();
  const today = airportLocalDate(now, airport.timezone);
  const currentYear = Number(today.slice(0, 4));
  const [selection, setSelection] = useState<YearSelection>({ mode: 'discover' });
  const selectedYear = selection.mode === 'single' ? selection.year : currentYear;
  const query = useQuery({
    queryKey: ['airport-statistics', airport.id, selection.mode, selectedYear],
    queryFn: () =>
      selection.mode === 'discover'
        ? discoverAirportSummary(airport.id, currentYear)
        : loadAirportSummary(airport.id, selection.year),
    retry: false,
  });
  const summary = query.data?.data;
  const year = query.data?.year ?? selectedYear;

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
          <div className='airport-header-actions'>
            <YearSwitcher
              year={year}
              onChange={(nextYear) => setSelection({ mode: 'single', year: nextYear })}
            />
          </div>
        }
      />
      <nav className='subnav airport-detail-nav' aria-label='Airport view'>
        <AirportViewLink
          view='overview'
          currentView={view}
          href={hrefFor('overview')}
          icon={<Compass size={16} />}
          label='Overview'
        />
        <AirportViewLink
          view='flights'
          currentView={view}
          href={hrefFor('flights')}
          icon={<List size={16} />}
          label='Flights'
        />
        <AirportViewLink
          view='routes'
          currentView={view}
          href={hrefFor('routes')}
          icon={<Plane size={16} />}
          label='Routes'
        />
        <AirportViewLink
          view='statistics'
          currentView={view}
          href={hrefFor('statistics')}
          icon={<BarChart3 size={16} />}
          label='Statistics'
        />
        <AirportViewLink
          view='map'
          currentView={view}
          href={hrefFor('map')}
          icon={<MapIcon size={16} />}
          label='Map'
        />
      </nav>

      {query.isLoading && <Loading label={`Loading ${airport.iataCode} ${selectedYear}…`} />}
      {query.error && (
        <div className='airport-summary-error'>
          <ErrorState error={query.error} title={`Could not load ${year} airport statistics`} />
          <Card className='airport-facts airport-reference-card'>
            <AirportFacts airport={airport} />
          </Card>
        </div>
      )}
      {summary && (
        <AirportYearContent
          key={`${airport.id}-${year}`}
          airport={airport}
          summary={summary}
          view={view}
          today={today}
          selectView={selectView}
        />
      )}
    </div>
  );
}

function AirportYearContent({
  airport,
  summary,
  view,
  today,
  selectView,
}: {
  airport: Airport;
  summary: AirportSummary;
  view: AirportView;
  today: string;
  selectView: (view: AirportView) => void;
}) {
  const [direction, setDirection] = useState<AirportMovementDirection>(() =>
    defaultDirection(summary),
  );
  const [selectedDate, setSelectedDate] = useState<string | undefined>(() =>
    defaultAirportDate(summary, today),
  );
  const hasMovements = summary.directions.some((item) => item.scheduledLegs > 0);

  if (!hasMovements) {
    return (
      <div className='airport-empty-year'>
        <EmptyState
          title={`No scheduled movements in ${summary.year}`}
          description='This is the explicitly selected year. Choose another year to look for airport schedules.'
        />
        <Card className='airport-facts airport-reference-card'>
          <AirportFacts airport={airport} />
        </Card>
      </div>
    );
  }

  if (view === 'flights') {
    return (
      <AirportFlights
        airport={airport}
        summary={summary}
        direction={direction}
        selectedDate={selectedDate}
        today={today}
        onDirectionChange={setDirection}
        onDateChange={setSelectedDate}
      />
    );
  }
  if (view === 'routes') {
    return (
      <AirportRoutes summary={summary} direction={direction} onDirectionChange={setDirection} />
    );
  }
  if (view === 'statistics') {
    return (
      <AirportStatistics
        summary={summary}
        direction={direction}
        onDirectionChange={setDirection}
        onDateSelect={(date) => {
          setSelectedDate(date);
          selectView('flights');
        }}
      />
    );
  }
  if (view === 'map') {
    return (
      <AirportMap
        airport={airport}
        summary={summary}
        direction={direction}
        onDirectionChange={setDirection}
      />
    );
  }

  return (
    <AirportOverview
      airport={airport}
      summary={summary}
      direction={direction}
      onDirectionChange={setDirection}
    />
  );
}

function AirportViewLink({
  view,
  currentView,
  href,
  icon,
  label,
}: {
  view: AirportView;
  currentView: AirportView;
  href: { pathname: string; search: string; hash: string };
  icon: ReactNode;
  label: string;
}) {
  return (
    <Link
      id={view === 'overview' ? undefined : view}
      to={href}
      className={currentView === view ? 'active' : ''}
      aria-current={currentView === view ? 'page' : undefined}
    >
      {icon}
      {label}
    </Link>
  );
}

async function loadAirportSummary(airport: string, year: number) {
  return loadYearlyData(year, (selectedYear) => api.airportStatistics(airport, selectedYear));
}

async function discoverAirportSummary(airport: string, currentYear: number) {
  return discoverYearlyData({
    currentYear,
    load: (year) => api.airportStatistics(airport, year),
    hasData: (data) => data.directions.some((direction) => direction.scheduledLegs > 0),
    emptyMessage: (year) => `No airport schedule data found for ${airport} in ${year}`,
    notFoundMessage: `No airport schedule found for ${airport}`,
  });
}
