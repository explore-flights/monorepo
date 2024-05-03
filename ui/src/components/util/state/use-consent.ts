import { useEffect, useState } from 'react';
import { ConsentLevel } from '../../../lib/consent.model';
import { useBrowserStore } from '../context/browser-store';

export function useConsent() {
  const store = useBrowserStore();
  const [consentLevels, setConsentLevels] = useState(store.getConsentLevels());

  useEffect(() => {
    setConsentLevels(store.getConsentLevels());
    return store.subscribeConsent((e) => setConsentLevels(e[1]));
  }, [store]);

  function handleValueChange(newValue: Iterable<ConsentLevel>) {
    store.setConsentLevels(newValue);
  }
  
  return [consentLevels, handleValueChange] as const;
}

export function useHasConsent() {
  const store = useBrowserStore();
  const [hasConsent, setHasConsent] = useState(store.hasConsent());

  useEffect(() => {
    setHasConsent(store.hasConsent());
    return store.subscribeConsent((e) => setHasConsent(e[0]));
  }, [store]);

  return hasConsent;
}
