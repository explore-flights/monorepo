import { useMemo } from 'react';
import { ConsentLevel } from '../../../lib/consent.model';
import {
  ColorScheme,
  EffectivePreferences,
  Preferences,
  UIDensity,
} from '../../../lib/preferences.model';
import { useMediaQuery } from './common';
import { useBrowserStore } from './use-browser-store';

const STORE_CONSENT_LEVEL = ConsentLevel.FUNCTIONALITY;
const STORE_KEY = 'PREFERENCES';

export function usePreferences() {
  const [storeValue, setStoreValue] = useBrowserStore(STORE_CONSENT_LEVEL, STORE_KEY);
  const prefersLightScheme = useMediaQuery('(prefers-color-scheme: light)');

  const value = useMemo<EffectivePreferences>(() => {
    let preferences: Partial<Preferences> = {};
    if (storeValue != null) {
      preferences = JSON.parse(storeValue) as Partial<Preferences>;
    }

    const colorScheme = preferences.colorScheme ?? ColorScheme.SYSTEM;
    const systemColorScheme = prefersLightScheme ? ColorScheme.LIGHT : ColorScheme.DARK;

    return {
      colorScheme: colorScheme,
      uiDensity: preferences.uiDensity ?? UIDensity.COMFORTABLE,
      effectiveColorScheme: colorScheme === ColorScheme.SYSTEM ? systemColorScheme : colorScheme,
    };
  }, [storeValue, prefersLightScheme]);

  function handleValueChange(newValue: Partial<Preferences>) {
    const pref: Preferences = {
      colorScheme: newValue.colorScheme ?? value.colorScheme,
      uiDensity: newValue.uiDensity ?? value.uiDensity,
    };

    setStoreValue(JSON.stringify(pref));
  }
  
  return [value, handleValueChange] as const;
}
