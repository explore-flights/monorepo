import { useQuery } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
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
import { RouteSeo } from './seo';

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

const notificationTypePriority: Record<Notification['type'], number> = {
  error: 0,
  warning: 1,
  info: 2,
  'in-progress': 3,
  success: 4,
};

export function AppShell() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [flight, setFlight] = useState('');
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const menuCloseButtonRef = useRef<HTMLButtonElement>(null);
  const settingsReturnFocusRef = useRef<HTMLElement>(null);
  const navigate = useNavigate();
  const { effectiveTheme, setTheme } = usePreferences();

  useEffect(() => {
    if (!menuOpen) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Escape') {
        return;
      }

      event.preventDefault();
      setMenuOpen(false);
      window.requestAnimationFrame(() => menuButtonRef.current?.focus());
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [menuOpen]);

  function closeMenu(restoreFocus = true) {
    setMenuOpen(false);
    if (restoreFocus) {
      window.requestAnimationFrame(() => menuButtonRef.current?.focus());
    }
  }

  function openMenu() {
    setMenuOpen(true);
    window.requestAnimationFrame(() => menuCloseButtonRef.current?.focus());
  }

  function openSettings() {
    let returnFocus: HTMLElement | null = null;
    if (menuOpen) {
      returnFocus = menuButtonRef.current;
    } else if (document.activeElement instanceof HTMLElement) {
      returnFocus = document.activeElement;
    }

    settingsReturnFocusRef.current = returnFocus;
    setMenuOpen(false);
    setSettingsOpen(true);
  }

  function closeSettings() {
    setSettingsOpen(false);
    window.requestAnimationFrame(() => settingsReturnFocusRef.current?.focus());
  }

  function submitFlight(event: React.FormEvent) {
    event.preventDefault();
    const normalized = normalizeFlightNumber(flight);
    if (normalized) {
      navigate(`/flight/${encodeURIComponent(normalized)}`);
      setFlight('');
      closeMenu(false);
    }
  }

  return (
    <div className='app-frame'>
      <RouteSeo />
      <header className='mobile-header' inert={menuOpen ? true : undefined}>
        <Button
          ref={menuButtonRef}
          variant='ghost'
          aria-label='Open navigation'
          aria-controls='primary-sidebar'
          aria-expanded={menuOpen}
          onClick={openMenu}
        >
          <Menu size={20} />
        </Button>
        <Logo compact />
        <Button variant='ghost' aria-label='Open settings' onClick={openSettings}>
          <Settings size={20} />
        </Button>
      </header>
      {menuOpen && (
        <button className='scrim' aria-label='Close navigation' onClick={() => closeMenu()} />
      )}
      <aside
        id='primary-sidebar'
        className={classNames('sidebar', menuOpen && 'sidebar-open')}
        role={menuOpen ? 'dialog' : undefined}
        aria-label={menuOpen ? 'Navigation' : undefined}
        aria-modal={menuOpen || undefined}
      >
        <div className='sidebar-top'>
          <Logo />
          <Button
            ref={menuCloseButtonRef}
            variant='ghost'
            className='mobile-only'
            aria-label='Close navigation'
            onClick={() => closeMenu()}
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
              closeMenu(false);
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
              onClick={() => closeMenu(false)}
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
              onClick={() => closeMenu(false)}
              className={({ isActive }) => classNames('fleet-link', isActive && 'active')}
            >
              {item.label}
            </NavLink>
          ))}
        </div>
        <div className='sidebar-footer'>
          <button className='settings-row' onClick={openSettings}>
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
      <main className='content' inert={menuOpen ? true : undefined}>
        <NotificationsPanel />
        <Outlet />
      </main>
      <ConsentBanner backgroundInert={menuOpen} onSettings={openSettings} />
      {settingsOpen && <SettingsDialog onClose={closeSettings} setTheme={setTheme} />}
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
  const { notificationReadMarker, markNotificationsRead } = usePreferences();
  const [expanded, setExpanded] = useState(false);
  const notifications = (query.data?.notifications ?? []).filter((item) =>
    isAfterReadMarker(item.timestamp, notificationReadMarker),
  );
  const version = query.data?.dataVersion;
  const showQueryError = Boolean(query.error && !version);

  if (!query.data && !query.error) {
    return null;
  }
  if (!notifications.length && !showQueryError) {
    return null;
  }

  const nudgeType = notifications.reduce<Notification['type']>(
    (strongest, item) =>
      notificationTypePriority[item.type] < notificationTypePriority[strongest]
        ? item.type
        : strongest,
    showQueryError ? 'error' : 'success',
  );
  const statusCount = notifications.length + (showQueryError ? 1 : 0);
  const notificationLabel = `${expanded ? 'Close' : 'Open'} notifications (${statusCount})`;

  function markAllAsRead() {
    const latestTimestamp = maxTimestamp(notifications.map((item) => item.timestamp));
    if (latestTimestamp) {
      markNotificationsRead(latestTimestamp);
      setExpanded(false);
    }
  }

  return (
    <section
      className={classNames('global-status', expanded && 'global-status-expanded')}
      aria-label='Schedule data status'
    >
      <div className='global-status-controls'>
        {expanded && notifications.length > 0 && (
          <Button
            type='button'
            variant='secondary'
            className='global-status-mark-read'
            onClick={markAllAsRead}
          >
            Mark all as read
          </Button>
        )}
        <button
          type='button'
          className={`global-status-nudge notification-${nudgeType}`}
          aria-label={notificationLabel}
          aria-expanded={expanded}
          aria-controls='global-status-panel'
          onClick={() => setExpanded((current) => !current)}
        >
          <NotificationIcon
            type={nudgeType}
            className={nudgeType === 'in-progress' ? 'spin' : ''}
          />
          <span className='global-status-count' aria-hidden='true'>
            {statusCount}
          </span>
        </button>
      </div>
      {expanded && (
        <div className='global-status-panel' id='global-status-panel'>
          {notifications.map((item) => (
            <article
              className={`global-notification notification-${item.type}`}
              key={`${item.timestamp}:${item.type}:${item.header}`}
            >
              <NotificationIcon
                type={item.type}
                className={item.type === 'in-progress' ? 'spin' : ''}
              />
              <div>
                <strong>{item.header ?? 'Information'}</strong>
                {item.content && <p>{item.content}</p>}
              </div>
            </article>
          ))}
          {showQueryError && (
            <div className='notification-query-error'>
              <AlertCircle size={14} />
              Data freshness is temporarily unavailable.
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function maxTimestamp(timestamps: ReadonlyArray<string | null>): string | null {
  let latest: { value: string; time: number } | null = null;
  for (const timestamp of timestamps) {
    if (!timestamp) {
      continue;
    }
    const time = Date.parse(timestamp);
    if (!Number.isNaN(time) && (!latest || time > latest.time)) {
      latest = { value: timestamp, time };
    }
  }
  return latest?.value ?? null;
}

function isAfterReadMarker(timestamp: string, marker: string | null) {
  if (!marker) {
    return true;
  }
  const notificationTime = Date.parse(timestamp);
  const markerTime = Date.parse(marker);
  return (
    Number.isNaN(notificationTime) || Number.isNaN(markerTime) || notificationTime > markerTime
  );
}

function NotificationIcon({ type, className }: { type: Notification['type']; className: string }) {
  switch (type) {
    case 'error':
      return <AlertCircle className={className} size={18} />;
    case 'warning':
      return <TriangleAlert className={className} size={18} />;
    case 'success':
      return <CheckCircle2 className={className} size={18} />;
    case 'in-progress':
      return <LoaderCircle className={className} size={18} />;
    case 'info':
      return <Info className={className} size={18} />;
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

function ConsentBanner({
  backgroundInert,
  onSettings,
}: {
  backgroundInert: boolean;
  onSettings: () => void;
}) {
  const { hasConsentChoice, acceptAll, acceptEssential } = usePreferences();
  if (hasConsentChoice) {
    return null;
  }
  return (
    <div
      className='consent-banner'
      role='dialog'
      aria-label='Privacy choices'
      inert={backgroundInert ? true : undefined}
    >
      <div>
        <strong>Your data, your choice</strong>
        <p>
          Essential storage keeps the site working. Functional storage remembers appearance and read
          notifications; map consent loads tiles from VersaTiles.
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
  const dialogRef = useRef<HTMLDialogElement>(null);
  const prefs = usePreferences();
  const [functional, setFunctional] = useState(prefs.consent.has(1));
  const [maps, setMaps] = useState(prefs.consent.has(5));

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) {
      return;
    }

    dialog.showModal();
    return () => {
      if (dialog.open) {
        dialog.close();
      }
    };
  }, []);

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
    <dialog
      ref={dialogRef}
      className='modal-dialog'
      aria-labelledby='settings-title'
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.preventDefault();
          onClose();
        }
      }}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <section className='dialog'>
        <header>
          <div>
            <span className='eyebrow'>Preferences</span>
            <h2 id='settings-title'>Make it yours</h2>
          </div>
          <Button variant='ghost' aria-label='Close' autoFocus onClick={onClose}>
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
                <small>Remember your theme preference and read notifications.</small>
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
    </dialog>
  );
}
