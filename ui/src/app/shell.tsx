import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import {
  AlertCircle,
  Building2,
  CheckCircle2,
  Filter,
  GitBranch,
  History,
  Home,
  Info,
  LoaderCircle,
  Menu,
  Moon,
  Network,
  Plane,
  Settings,
  Sun,
  TriangleAlert,
  X,
} from 'lucide-react';
import { api } from '@/api/client';
import type { Notification } from '@/api/types';
import { Button } from '@/components/primitives';
import { FlightAutocomplete } from '@/components/FlightAutocomplete';
import { classNames, normalizeFlightNumber } from '@/lib/format';
import { themeModes, usePreferences, type ConsentLevel, type ThemeMode } from './preferences';

const primaryNav = [
  { to: '/', label: 'Overview', icon: Home, end: true },
  { to: '/connections', label: 'Connections', icon: GitBranch },
  { to: '/flight', label: 'Flights', icon: Plane },
  { to: '/tools/flight-search', label: 'Flight search', icon: Filter },
  { to: '/airport', label: 'Airports', icon: Building2 },
  { to: '/updates', label: 'Updates', icon: History },
];

const fleetNav = [
  { to: '/allegris', label: 'Lufthansa Allegris' },
  { to: '/swiss350', label: 'SWISS A350' },
  { to: '/lh380', label: 'Lufthansa A380' },
  { to: '/lh340', label: 'Lufthansa A340' },
  { to: '/lh747', label: 'Lufthansa 747' },
];

export function AppShell() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [flight, setFlight] = useState('');
  const navigate = useNavigate();
  const { effectiveTheme, setTheme } = usePreferences();

  function submitFlight(event: React.FormEvent) {
    event.preventDefault();
    const normalized = normalizeFlightNumber(flight);
    if (normalized) {
      navigate(`/flight/${encodeURIComponent(normalized)}`);
      setFlight('');
      setMenuOpen(false);
    }
  }

  return (
    <div className='app-frame'>
      <header className='mobile-header'>
        <Button variant='ghost' aria-label='Open navigation' onClick={() => setMenuOpen(true)}>
          <Menu size={20} />
        </Button>
        <Logo compact />
        <Button variant='ghost' aria-label='Open settings' onClick={() => setSettingsOpen(true)}>
          <Settings size={20} />
        </Button>
      </header>
      {menuOpen && (
        <button
          className='scrim'
          aria-label='Close navigation'
          onClick={() => setMenuOpen(false)}
        />
      )}
      <aside className={classNames('sidebar', menuOpen && 'sidebar-open')}>
        <div className='sidebar-top'>
          <Logo />
          <Button
            variant='ghost'
            className='mobile-only'
            aria-label='Close navigation'
            onClick={() => setMenuOpen(false)}
          >
            <X size={19} />
          </Button>
        </div>
        <form className='sidebar-search' onSubmit={submitFlight}>
          <FlightAutocomplete
            compact
            showSearchIcon
            ariaLabel='Search flight numbers'
            value={flight}
            onChange={setFlight}
            onSelect={(value) => {
              navigate(`/flight/${encodeURIComponent(value)}`);
              setFlight('');
              setMenuOpen(false);
            }}
            placeholder='Open flight, e.g. LH400'
          />
          <kbd>↵</kbd>
        </form>
        <nav aria-label='Primary navigation'>
          {primaryNav.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              onClick={() => setMenuOpen(false)}
              className={({ isActive }) => classNames('nav-link', isActive && 'active')}
            >
              <Icon size={18} />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>
        <div className='nav-section'>
          <div className='nav-label'>
            <Network size={14} /> Fleet watch
          </div>
          {fleetNav.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              onClick={() => setMenuOpen(false)}
              className={({ isActive }) => classNames('fleet-link', isActive && 'active')}
            >
              {item.label}
            </NavLink>
          ))}
        </div>
        <div className='sidebar-footer'>
          <button className='settings-row' onClick={() => setSettingsOpen(true)}>
            <span className='theme-icon'>
              {effectiveTheme === 'dark' ? <Moon size={17} /> : <Sun size={17} />}
            </span>
            <span>
              <strong>Appearance</strong>
              <small>{effectiveTheme} theme</small>
            </span>
            <Settings size={17} />
          </button>
          <div className='footer-links'>
            <Link to='/about'>About</Link>
            <Link to='/legal'>Legal</Link>
            <Link to='/privacy-policy'>Privacy</Link>
            <a href='https://github.com/explore-flights' target='_blank' rel='noreferrer'>
              GitHub
            </a>
          </div>
        </div>
      </aside>
      <main className='content'>
        <NotificationsPanel />
        <Outlet />
      </main>
      <ConsentBanner onSettings={() => setSettingsOpen(true)} />
      {settingsOpen && (
        <SettingsDialog onClose={() => setSettingsOpen(false)} setTheme={setTheme} />
      )}
    </div>
  );
}

function useNotificationsQuery() {
  return useQuery({
    queryKey: ['notifications'],
    queryFn: api.notifications,
    refetchInterval: 5 * 60_000,
    staleTime: 60_000,
    retry: 2,
  });
}

function NotificationsPanel() {
  const query = useNotificationsQuery();
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const notifications = (query.data?.notifications ?? []).filter(
    (item) => !dismissed.has(`${item.type}:${item.header}:${item.content}`),
  );
  const version = query.data?.dataVersion;
  const showQueryError = Boolean(query.error && !version);
  if (!query.data && !query.error) {
    return null;
  }
  if (!notifications.length && !showQueryError) {
    return null;
  }
  return (
    <section className='global-status' aria-label='Schedule data status'>
      {notifications.map((item) => {
        const key = `${item.type}:${item.header}:${item.content}`;
        const Icon = notificationIcon(item.type);
        return (
          <article className={`global-notification notification-${item.type}`} key={key}>
            <Icon className={item.type === 'in-progress' ? 'spin' : ''} size={18} />
            <div>
              <strong>{item.header ?? 'Information'}</strong>
              {item.content && <p>{item.content}</p>}
            </div>
            <button
              aria-label={`Dismiss ${item.header ?? 'notification'}`}
              onClick={() => setDismissed((previous) => new Set([...previous, key]))}
            >
              <X size={15} />
            </button>
          </article>
        );
      })}
      {showQueryError && (
        <div className='notification-query-error'>
          <AlertCircle size={14} />
          Data freshness is temporarily unavailable.
        </div>
      )}
    </section>
  );
}

function notificationIcon(type: Notification['type']) {
  switch (type) {
    case 'error':
      return AlertCircle;
    case 'warning':
      return TriangleAlert;
    case 'success':
      return CheckCircle2;
    case 'in-progress':
      return LoaderCircle;
    case 'info':
      return Info;
  }
}

function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <Link to='/' className='logo' aria-label='explore.flights home'>
      <span className='logo-mark'>
        <Plane size={compact ? 17 : 19} />
      </span>
      <span>
        explore<span>.flights</span>
      </span>
    </Link>
  );
}

function ConsentBanner({ onSettings }: { onSettings: () => void }) {
  const { hasConsentChoice, acceptAll, acceptEssential } = usePreferences();
  if (hasConsentChoice) {
    return null;
  }
  return (
    <div className='consent-banner' role='dialog' aria-label='Privacy choices'>
      <div>
        <strong>Your data, your choice</strong>
        <p>
          Essential storage keeps the site working. Functional storage remembers appearance; map
          consent loads tiles from VersaTiles.
        </p>
      </div>
      <div className='consent-actions'>
        <Button variant='ghost' onClick={onSettings}>
          Customize
        </Button>
        <Button variant='secondary' onClick={acceptEssential}>
          Essential only
        </Button>
        <Button onClick={acceptAll}>Allow all</Button>
      </div>
    </div>
  );
}

function SettingsDialog({
  onClose,
  setTheme,
}: {
  onClose: () => void;
  setTheme: (mode: ThemeMode) => void;
}) {
  const prefs = usePreferences();
  const [functional, setFunctional] = useState(prefs.consent.has(1));
  const [maps, setMaps] = useState(prefs.consent.has(5));
  function save() {
    const preserved = [...prefs.consent].filter((level) => level !== 1 && level !== 5);
    const levels = new Set<ConsentLevel>(preserved);
    levels.add(0);
    if (functional) {
      levels.add(1);
    }
    if (maps) {
      levels.add(5);
    }
    prefs.saveConsent(levels);
    onClose();
  }
  return (
    <div
      className='modal-layer'
      role='presentation'
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <section className='dialog' role='dialog' aria-modal='true' aria-labelledby='settings-title'>
        <header>
          <div>
            <span className='eyebrow'>Preferences</span>
            <h2 id='settings-title'>Make it yours</h2>
          </div>
          <Button variant='ghost' aria-label='Close' onClick={onClose}>
            <X size={20} />
          </Button>
        </header>
        <div className='dialog-body'>
          <fieldset>
            <legend>Theme</legend>
            <div className='segmented'>
              {themeModes.map((mode) => (
                <button
                  key={mode}
                  className={prefs.theme === mode ? 'active' : ''}
                  onClick={() => setTheme(mode)}
                >
                  {mode}
                </button>
              ))}
            </div>
          </fieldset>
          <fieldset>
            <legend>Privacy</legend>
            <label className='toggle-row'>
              <span>
                <strong>Functional storage</strong>
                <small>Remember your theme preference.</small>
              </span>
              <input
                type='checkbox'
                checked={functional}
                onChange={(e) => setFunctional(e.target.checked)}
              />
            </label>
            <label className='toggle-row'>
              <span>
                <strong>Interactive maps</strong>
                <small>Load map tiles from VersaTiles.</small>
              </span>
              <input type='checkbox' checked={maps} onChange={(e) => setMaps(e.target.checked)} />
            </label>
          </fieldset>
        </div>
        <footer>
          <Button variant='secondary' onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={save}>Save preferences</Button>
        </footer>
      </section>
    </div>
  );
}
