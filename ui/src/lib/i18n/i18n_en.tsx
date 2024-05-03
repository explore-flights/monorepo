import { Locale } from '../preferences.model';
import { I18nFormats } from './i18n.model';

export const I18N_EN = ({
  locale: Locale.EN,
  routes: {
    home: 'Home',
    legal: 'Legal',
    privacyPolicy: 'Privacy Policy',
  },
} as const) satisfies I18nFormats;
