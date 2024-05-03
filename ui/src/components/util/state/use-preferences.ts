import { useEffect, useMemo, useState } from 'react';
import { ConsentLevel } from '../../../lib/consent.model';
import {
  ColorScheme,
  DateFormat,
  EffectiveLocale,
  EffectivePreferences,
  Locale,
  Preferences,
  UIDensity,
} from '../../../lib/preferences.model';
import { useMediaQuery } from './common';
import { useBrowserStore } from './use-browser-store';

const STORE_CONSENT_LEVEL = ConsentLevel.FUNCTIONALITY;
const STORE_KEY = 'PREFERENCES';

function getSystemLocale(): EffectiveLocale {
  /*
  let systemPreferredLocale = Locale.EN;

  if (navigator.language) {
    if (navigator.language.startsWith('de')) {
      systemPreferredLocale = Locale.DE;
    }
  }
   */

  return Locale.EN;
}

export function resolveEffectiveLocale(loc: Locale, systemLocale: EffectiveLocale): EffectiveLocale {
  return loc === Locale.SYSTEM ? systemLocale : loc;
}

export function useSystemLocale() {
  const [systemLocale, setSystemLocale] = useState<EffectiveLocale>(getSystemLocale());

  useEffect(() => {
    const onLanguageChange = () => setSystemLocale(getSystemLocale());
    window.addEventListener('languagechange', onLanguageChange);

    return () => window.removeEventListener('languagechange', onLanguageChange);
  }, []);

  return systemLocale;
}

export function usePreferences() {
  const [storeValue, setStoreValue] = useBrowserStore(STORE_CONSENT_LEVEL, STORE_KEY);
  const systemLocale = useSystemLocale();
  const prefersLightScheme = useMediaQuery('(prefers-color-scheme: light)');

  const value = useMemo<EffectivePreferences>(() => {
    let preferences: Partial<Preferences> = {};
    if (storeValue != null) {
      preferences = JSON.parse(storeValue) as Partial<Preferences>;
    }

    const locale = preferences.locale ?? Locale.SYSTEM;
    const dateFormat = preferences.dateFormat ?? DateFormat.LOCALE;
    const colorScheme = preferences.colorScheme ?? ColorScheme.SYSTEM;
    const systemColorScheme = prefersLightScheme ? ColorScheme.LIGHT : ColorScheme.DARK;

    return {
      locale: locale,
      dateFormat: dateFormat,
      colorScheme: colorScheme,
      uiDensity: preferences.uiDensity ?? UIDensity.COMFORTABLE,
      effectiveLocale: resolveEffectiveLocale(locale, systemLocale),
      effectiveColorScheme: colorScheme === ColorScheme.SYSTEM ? systemColorScheme : colorScheme,
    };
  }, [storeValue, systemLocale, prefersLightScheme]);

  function handleValueChange(newValue: Partial<Preferences>) {
    const pref: Preferences = {
      locale: newValue.locale ?? value.locale,
      dateFormat: newValue.dateFormat ?? value.dateFormat,
      colorScheme: newValue.colorScheme ?? value.colorScheme,
      uiDensity: newValue.uiDensity ?? value.uiDensity,
    };

    setStoreValue(JSON.stringify(pref));
  }
  
  return [value, handleValueChange] as const;
}
