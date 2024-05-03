import { EffectiveLocale } from '../preferences.model';

interface I18nRouteExplicit {
  title: string,
  breadcrumb: string,
}

export type I18nRoute = string | I18nRouteExplicit;

export interface I18nFormats {
  locale: EffectiveLocale,
  routes: {
    home: I18nRoute,
    legal: I18nRoute,
    privacyPolicy: I18nRoute,
  },
}

export type I18n = Record<EffectiveLocale, I18nFormats>;
