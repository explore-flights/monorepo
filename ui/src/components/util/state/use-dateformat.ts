import { useMemo } from 'react';
import { I18nFormats } from '../../../lib/i18n/i18n.model';
import { DateFormat, Locale } from '../../../lib/preferences.model';
import { useI18n } from '../context/i18n';
import { usePreferences } from './use-preferences';

interface DateFormatter {
  formatDate: (v: string | Date) => string;
  formatTime: (v: string | Date) => string;
  formatDateTime: (v: string | Date) => string;
}

export function localeDateFormatter(i18n: I18nFormats): DateFormatter {
  const localeStr = ({
    [Locale.EN]: 'en-US',
  })[i18n.locale] ?? 'en-US';

  return {
    formatDate: (v) => safeDate(v).toLocaleDateString(localeStr),
    formatTime: (v) => safeDate(v).toLocaleTimeString(localeStr),
    formatDateTime: (v) => safeDate(v).toLocaleString(localeStr),
  } as const;
}

export const ISO8601DateFormatter: DateFormatter = {
  formatDate: (v) => safeDate(v).toISOString().split('T')[0],
  formatTime: (v) => safeDate(v).toISOString().split('T')[1],
  formatDateTime: (v) => safeDate(v).toISOString(),
} as const;

export const SystemDateFormatter: DateFormatter = {
  formatDate: (v) => safeDate(v).toLocaleDateString(),
  formatTime: (v) => safeDate(v).toLocaleTimeString(),
  formatDateTime: (v) => safeDate(v).toLocaleString(),
} as const;

export function useDateFormat() {
  const i18n = useI18n();
  const [preferences] = usePreferences();

  return useMemo<DateFormatter>(() => {
    switch (preferences.dateFormat) {
      case DateFormat.LOCALE:
        return localeDateFormatter(i18n);

      case DateFormat.ISO_8601:
        return ISO8601DateFormatter;

      case DateFormat.SYSTEM:
      default:
        return SystemDateFormatter;
    }
  }, [i18n, preferences]);
}

function safeDate(v: string | Date) {
  if (typeof v === 'string') {
    return new Date(v);
  }

  return v;
}
