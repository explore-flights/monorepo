import { createContext, use, useEffect, useMemo, useState, type ReactNode } from 'react';
import { isOneOf } from '@/lib/collections';

export const themeModes = ['system', 'light', 'dark'] as const;
export type ThemeMode = (typeof themeModes)[number];
export type ConsentLevel = 0 | 1 | 2 | 3 | 4 | 5;
type UiDensity = 'comfortable' | 'compact';

interface StoredPreferences {
  colorScheme?: string;
  uiDensity?: UiDensity;
}

interface PreferencesValue {
  theme: ThemeMode;
  effectiveTheme: 'light' | 'dark';
  setTheme: (theme: ThemeMode) => void;
  hasConsentChoice: boolean;
  consent: Set<ConsentLevel>;
  acceptEssential: () => void;
  acceptAll: () => void;
  saveConsent: (levels: Set<ConsentLevel>) => void;
  canUseMaps: boolean;
  notificationReadMarker: string | null;
  markNotificationsRead: (timestamp: string) => void;
}

const CONSENT_KEY = 'FLIGHTS:CONSENT';
const PREFERENCES_KEY = 'FLIGHTS:PREFERENCES';
export const NOTIFICATION_READ_MARKER_KEY = 'FLIGHTS:NOTIFICATION_READ_MARKER';
const PreferencesContext = createContext<PreferencesValue | null>(null);

function readConsent(): { chosen: boolean; levels: Set<ConsentLevel> } {
  const raw = localStorage.getItem(CONSENT_KEY);
  if (raw === null) {
    return { chosen: false, levels: new Set([0]) };
  }
  try {
    const levels: number[] = JSON.parse(raw);
    return { chosen: true, levels: new Set([0, ...levels.filter(isConsentLevel)]) };
  } catch {
    return { chosen: false, levels: new Set([0]) };
  }
}

function readTheme(): ThemeMode {
  try {
    const value: StoredPreferences = JSON.parse(localStorage.getItem(PREFERENCES_KEY) ?? '{}');
    if (isThemeMode(value.colorScheme)) {
      return value.colorScheme;
    }

    return 'system';
  } catch {
    return 'system';
  }
}

function isThemeMode(value: string | undefined): value is ThemeMode {
  return value !== undefined && isOneOf(value, themeModes);
}

function isConsentLevel(value: number): value is ConsentLevel {
  return Number.isInteger(value) && value >= 0 && value <= 5;
}

export function PreferencesProvider({ children }: { children: ReactNode }) {
  const initialConsent = useMemo(readConsent, []);
  const [storedTheme, setStoredTheme] = useState<ThemeMode>(readTheme);
  const [systemDark, setSystemDark] = useState(
    () => matchMedia('(prefers-color-scheme: dark)').matches,
  );
  const [hasConsentChoice, setHasConsentChoice] = useState(initialConsent.chosen);
  const [consent, setConsent] = useState(initialConsent.levels);
  const [notificationReadMarker, setNotificationReadMarker] = useState<string | null>(() =>
    initialConsent.levels.has(1) ? localStorage.getItem(NOTIFICATION_READ_MARKER_KEY) : null,
  );
  const effectiveTheme = resolveTheme(storedTheme, systemDark);

  useEffect(() => {
    const media = matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => setSystemDark(media.matches);
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = effectiveTheme;
    document.documentElement.style.colorScheme = effectiveTheme;
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute('content', effectiveTheme === 'dark' ? '#0b1019' : '#f5f7fb');
  }, [effectiveTheme]);

  function persistPreferences(nextTheme: ThemeMode, allowed = consent.has(1)) {
    if (!allowed) {
      return;
    }
    let previous: StoredPreferences = {};
    try {
      previous = JSON.parse(localStorage.getItem(PREFERENCES_KEY) ?? '{}');
    } catch {
      /* empty */
    }
    localStorage.setItem(
      PREFERENCES_KEY,
      JSON.stringify({
        ...previous,
        colorScheme: nextTheme,
        uiDensity: previous.uiDensity ?? 'comfortable',
      }),
    );
  }

  function setTheme(next: ThemeMode) {
    setStoredTheme(next);
    persistPreferences(next);
  }
  function markNotificationsRead(timestamp: string) {
    setNotificationReadMarker(timestamp);
    if (consent.has(1)) {
      localStorage.setItem(NOTIFICATION_READ_MARKER_KEY, timestamp);
    }
  }
  function saveConsent(levels: Set<ConsentLevel>) {
    const next = new Set<ConsentLevel>([0, ...levels]);
    localStorage.setItem(CONSENT_KEY, JSON.stringify([...next]));
    setConsent(next);
    setHasConsentChoice(true);
    if (next.has(1)) {
      persistPreferences(storedTheme, true);
    } else {
      localStorage.removeItem(PREFERENCES_KEY);
      localStorage.removeItem(NOTIFICATION_READ_MARKER_KEY);
      setNotificationReadMarker(null);
    }
  }

  return (
    <PreferencesContext
      value={{
        theme: storedTheme,
        effectiveTheme,
        setTheme,
        hasConsentChoice,
        consent,
        acceptEssential: () => saveConsent(new Set([0])),
        acceptAll: () => saveConsent(new Set([0, 1, 2, 3, 5])),
        saveConsent,
        canUseMaps: consent.has(5),
        notificationReadMarker,
        markNotificationsRead,
      }}
    >
      {children}
    </PreferencesContext>
  );
}

function resolveTheme(theme: ThemeMode, systemDark: boolean): Exclude<ThemeMode, 'system'> {
  if (theme !== 'system') {
    return theme;
  }

  return systemDark ? 'dark' : 'light';
}

export function usePreferences() {
  const value = use(PreferencesContext);
  if (!value) {
    throw new Error('usePreferences must be used inside PreferencesProvider');
  }
  return value;
}
