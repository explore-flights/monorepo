import { createBrowserRouter, Navigate } from 'react-router-dom';
import { AppShell } from './shell';
import {
  AboutPage,
  LegalPage,
  NotFoundPage,
  PrivacyPolicyPage,
} from '@/features/static/StaticPages';

export const router = createBrowserRouter([
  {
    path: '/',
    element: <AppShell />,
    errorElement: <NotFoundPage />,
    hydrateFallbackElement: <RouteFallback />,
    children: [
      {
        index: true,
        lazy: () =>
          import('@/features/home/HomePage').then((module) => ({ Component: module.HomePage })),
      },
      {
        path: 'connections',
        lazy: () =>
          import('@/features/connections/ConnectionsPage').then((module) => ({
            Component: module.ConnectionsPage,
          })),
      },
      {
        path: 'flight',
        lazy: () =>
          import('@/features/flights/FlightsPage').then((module) => ({
            Component: module.FlightsPage,
          })),
      },
      {
        path: 'tools/flight-search',
        lazy: () =>
          import('@/features/flights/FlightSearchPage').then((module) => ({
            Component: module.FlightSearchPage,
          })),
      },
      {
        path: 'flight/:flightNumber',
        lazy: () =>
          import('@/features/flights/FlightPage').then((module) => ({
            Component: module.FlightPage,
          })),
      },
      {
        path: 'flight/:flightNumber/versions/:airport/:date',
        lazy: () =>
          import('@/features/flights/FlightHistoryPage').then((module) => ({
            Component: module.FlightHistoryPage,
          })),
      },
      {
        path: 'airport',
        lazy: () =>
          import('@/features/airports/AirportsPage').then((module) => ({
            Component: module.AirportsPage,
          })),
      },
      {
        path: 'airport/:airportId',
        lazy: () =>
          import('@/features/airports/AirportPage').then((module) => ({
            Component: module.AirportLayout,
          })),
      },
      {
        path: 'allegris',
        lazy: () =>
          import('@/features/fleet/FleetPage').then((module) => ({
            Component: module.AllegrisPage,
          })),
      },
      {
        path: 'swiss350',
        lazy: () =>
          import('@/features/fleet/FleetPage').then((module) => ({
            Component: module.SwissA350Page,
          })),
      },
      {
        path: 'lh380',
        lazy: () =>
          import('@/features/fleet/FleetPage').then((module) => ({
            Component: module.LufthansaA380Page,
          })),
      },
      {
        path: 'lh340',
        lazy: () =>
          import('@/features/fleet/FleetPage').then((module) => ({
            Component: module.LufthansaA340Page,
          })),
      },
      {
        path: 'lh747',
        lazy: () =>
          import('@/features/fleet/FleetPage').then((module) => ({
            Component: module.Lufthansa747Page,
          })),
      },
      {
        path: 'updates',
        lazy: () =>
          import('@/features/updates/UpdatesPage').then((module) => ({
            Component: module.UpdatesPage,
          })),
      },
      { path: 'about', element: <AboutPage /> },
      { path: 'legal', element: <LegalPage /> },
      { path: 'privacy-policy', element: <PrivacyPolicyPage /> },
      { path: 'privacy', element: <Navigate to='/privacy-policy' replace /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
]);

function RouteFallback() {
  return (
    <main className='standalone-state'>
      <div className='route-spinner' />
      <span>Loading explore.flights…</span>
    </main>
  );
}
