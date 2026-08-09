import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

const siteOrigin = 'https://explore.flights';
const defaultDescription = 'Explore flight schedules, connections, airports and fleet operations.';

type SeoConfig = {
  title: string;
  description: string;
  canonicalPath?: string;
  robots: 'index,follow' | 'noindex,follow';
};

const staticRoutes: Readonly<Record<string, Omit<SeoConfig, 'robots' | 'canonicalPath'>>> = {
  '/': {
    title: 'explore.flights',
    description: defaultDescription,
  },
  '/connections': {
    title: 'Connections • explore.flights',
    description: 'Search flight connections across one or many origins and destinations.',
  },
  '/flight': {
    title: 'Flights • explore.flights',
    description: 'Open a flight number to explore its published schedule, routes and aircraft.',
  },
  '/tools/flight-search': {
    title: 'Search • explore.flights',
    description: 'Search published schedules using airline, time, equipment and route filters.',
  },
  '/airport': {
    title: 'Airports • explore.flights',
    description: 'Explore airport networks, published destinations and route maps.',
  },
  '/updates': {
    title: 'Updates • explore.flights',
    description: 'See how the flight schedule dataset changes between imports.',
  },
  '/allegris': {
    title: 'Allegris • explore.flights',
    description: 'Follow flights scheduled with Lufthansa’s newest long-haul cabin generation.',
  },
  '/swiss350': {
    title: 'SWISS A350 • explore.flights',
    description: 'Track the planned network for the SWISS Airbus A350 fleet.',
  },
  '/lh380': {
    title: 'Lufthansa A380 • explore.flights',
    description: 'Explore Lufthansa Airbus A380 routes and published schedules.',
  },
  '/lh340': {
    title: 'Lufthansa A340 • explore.flights',
    description: 'Explore Lufthansa Airbus A340 routes and published schedules.',
  },
  '/lh747': {
    title: 'Lufthansa 747 • explore.flights',
    description: 'Explore Lufthansa Boeing 747 routes and published schedules.',
  },
  '/about': {
    title: 'About • explore.flights',
    description: 'Learn why explore.flights exists, how it operates and where its data comes from.',
  },
  '/legal': {
    title: 'Legal • explore.flights',
    description: 'Legal information for explore.flights.',
  },
  '/privacy-policy': {
    title: 'Privacy policy • explore.flights',
    description: 'Privacy and data-processing information for explore.flights.',
  },
};

export function RouteSeo() {
  const { pathname, search } = useLocation();
  const config = seoForLocation(pathname, search);

  useEffect(() => {
    document.title = config.title;
    setMeta('name', 'description', config.description);
    setMeta('name', 'robots', config.robots);
    setMeta('property', 'og:title', config.title);
    setMeta('property', 'og:description', config.description);
    setMeta('name', 'twitter:title', config.title);
    setMeta('name', 'twitter:description', config.description);

    if (config.canonicalPath) {
      const canonicalUrl = `${siteOrigin}${config.canonicalPath}`;
      setCanonical(canonicalUrl);
      setMeta('property', 'og:url', canonicalUrl);
    } else {
      document.head.querySelector('link[rel="canonical"]')?.remove();
      document.head.querySelector('meta[property="og:url"]')?.remove();
    }
  }, [config]);

  return null;
}

export function seoForLocation(pathname: string, search: string): SeoConfig {
  const path = normalizePath(pathname);
  const sharedSearch = new URLSearchParams(search).has('search');

  if ((path === '/' || path === '/connections') && sharedSearch) {
    return {
      ...staticRoutes['/connections'],
      canonicalPath: '/connections',
      robots: 'noindex,follow',
    };
  }

  const staticRoute = staticRoutes[path];
  if (staticRoute) {
    return { ...staticRoute, canonicalPath: path, robots: 'index,follow' };
  }

  const historyMatch = path.match(/^\/flight\/([^/]+)\/versions\/([^/]+)\/([^/]+)$/);
  if (historyMatch) {
    const flightNumber = readableSegment(historyMatch[1]).toUpperCase();
    return {
      title: `${flightNumber} version history • explore.flights`,
      description: `Published schedule version history for ${flightNumber}.`,
      canonicalPath: path,
      robots: 'noindex,follow',
    };
  }

  const flightMatch = path.match(/^\/flight\/([^/]+)$/);
  if (flightMatch) {
    const flightNumber = readableSegment(flightMatch[1]).toUpperCase();
    return {
      title: `${flightNumber} flight schedule • explore.flights`,
      description: `Explore the published schedule, routes, aircraft and changes for ${flightNumber}.`,
      canonicalPath: `/flight/${encodeURIComponent(flightNumber)}`,
      robots: 'index,follow',
    };
  }

  const airportMatch = path.match(/^\/airport\/([^/]+)(?:\/(routes|map))?$/);
  if (airportMatch) {
    const airport = readableSegment(airportMatch[1]).toUpperCase();
    const section = airportMatch[2];
    if (section === 'map') {
      return {
        title: `${airport} route map • explore.flights`,
        description: `Map of published direct destinations from ${airport}.`,
        canonicalPath: `/airport/${encodeURIComponent(airport)}`,
        robots: 'noindex,follow',
      };
    }
    if (section === 'routes') {
      return {
        title: `${airport} routes • explore.flights`,
        description: `Explore published direct destinations and routes from ${airport}.`,
        canonicalPath: `/airport/${encodeURIComponent(airport)}/routes`,
        robots: 'index,follow',
      };
    }
    return {
      title: `${airport} airport • explore.flights`,
      description: `Explore the airport network, destinations and schedules for ${airport}.`,
      canonicalPath: `/airport/${encodeURIComponent(airport)}`,
      robots: 'index,follow',
    };
  }

  return {
    title: 'Page not found • explore.flights',
    description: 'This page does not exist on explore.flights.',
    robots: 'noindex,follow',
  };
}

function normalizePath(pathname: string) {
  if (pathname === '/') {
    return pathname;
  }
  return pathname.replace(/\/+$/, '');
}

function readableSegment(segment: string) {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

function setMeta(attribute: 'name' | 'property', key: string, content: string) {
  let element = document.head.querySelector<HTMLMetaElement>(`meta[${attribute}="${key}"]`);
  if (!element) {
    element = document.createElement('meta');
    element.setAttribute(attribute, key);
    document.head.append(element);
  }
  element.content = content;
}

function setCanonical(href: string) {
  let element = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  if (!element) {
    element = document.createElement('link');
    element.rel = 'canonical';
    document.head.append(element);
  }
  element.href = href;
}
