import React, { createContext, useContext } from 'react';
import { I18N_FLIGHTS } from '../../../lib/i18n/i18n-strings';
import { I18n, I18nFormats } from '../../../lib/i18n/i18n.model';
import { EffectiveLocale, Locale } from '../../../lib/preferences.model';

const I18nContext = createContext<I18nFormats>(I18N_FLIGHTS[Locale.EN]);

export function I18nProvider({ locale, messages, children }: React.PropsWithChildren<{ locale: EffectiveLocale; messages: I18n }>) {
  return (
    <I18nContext.Provider value={messages[locale]}>
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n() {
  return useContext(I18nContext);
}
