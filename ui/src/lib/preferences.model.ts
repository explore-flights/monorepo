export enum Locale {
  SYSTEM = 'system',
  EN = 'en',
}

export enum DateFormat {
  SYSTEM = 'system',
  LOCALE = 'locale',
  ISO_8601 = 'iso',
}

export enum ColorScheme {
  SYSTEM = 'system',
  LIGHT = 'light',
  DARK = 'dark',
}

export enum UIDensity {
  COMFORTABLE = 'comfortable',
  COMPACT = 'compact',
}

export interface Preferences {
  locale: Locale;
  dateFormat: DateFormat;
  colorScheme: ColorScheme;
  uiDensity: UIDensity;
}

export type EffectiveLocale = Exclude<Locale, Locale.SYSTEM>;
export type EffectiveColorScheme = Exclude<ColorScheme, ColorScheme.SYSTEM>;

export interface EffectivePreferences extends Preferences {
  effectiveLocale: EffectiveLocale;
  effectiveColorScheme: EffectiveColorScheme;
}
