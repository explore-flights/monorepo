import '@cloudscape-design/global-styles/index.css';
import React from 'react';
import ReactDOM from 'react-dom/client';
import { applyMode, Mode } from '@cloudscape-design/global-styles';
import { createBrowserRouter, Outlet, RouterProvider } from 'react-router-dom';
import { Home } from './home';
import { ErrorLayout, ErrorPage } from './error-page';
import { BaseProviders, RootLayout } from '../components/root';
import { Legal } from './legal';
import { PrivacyPolicy } from './privacy-policy';
import { Links } from './tools/links';
import { FlightView } from './flight';
import { FlightSelect } from './flight-select';
import { FlightSearch } from './tools/flight-search';
import { FlightVersionsView } from './flight-versions';
import { Airports } from './airports';
import { AirportPage } from './airport';
import { Updates } from './updates';
import { TechAirports } from './game/tech-airports';
import { DailyAirports } from './game/daily-airports';
import { Allegris, SwissA350 } from './special_aircraft';
import { About } from './about';

// region router
const router = createBrowserRouter([
  {
    path: '/',
    element: (
      <RootLayout headerHide={false} breadcrumbsHide={false}>
        <Outlet />
      </RootLayout>
    ),
    errorElement: <ErrorPage />,
    children: [
      { index: true, element: <Home /> },
      {
        path: 'about',
        element: <About />,
      },
      {
        path: 'legal',
        element: <Legal />,
      },
      {
        path: 'privacy-policy',
        element: <PrivacyPolicy />,
      },
      {
        path: 'flight',
        element: <FlightSelect />,
      },
      {
        path: 'flight/:id',
        element: <FlightView />,
      },
      {
        path: 'flight/:id/versions/:departureAirport/:departureDateLocal',
        element: <FlightVersionsView />,
      },
      {
        path: 'airport',
        element: <Airports />,
      },
      {
        path: 'game/techairportsanypercent',
        element: <TechAirports />,
      },
      {
        path: 'game/dailyairports',
        element: <DailyAirports />,
      },
      {
        path: 'airport/:id',
        element: <AirportPage />,
      },
      {
        path: 'allegris',
        element: <Allegris />,
      },
      {
        path: 'swiss350',
        element: <SwissA350 />,
      },
      {
        path: 'updates',
        element: <Updates />,
      },
      {
        path: 'tools/flight-search',
        element: <FlightSearch />,
      },
      {
        path: 'tools/links',
        element: <Links />,
      },
      {
        path: 'error',
        element: <ErrorLayout backendError={true} />,
      },
    ],
  },
]);
// endregion

const root = ReactDOM.createRoot(document.getElementById('root')!);
const element = (
  <React.StrictMode>
    <BaseProviders>
      <RouterProvider router={router} />
    </BaseProviders>
  </React.StrictMode>
);

applyMode(Mode.Dark, document.documentElement);
root.render(element);
