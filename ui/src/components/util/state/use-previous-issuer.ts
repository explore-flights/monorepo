import { useMemo } from 'react';
import { Issuer } from '../../../lib/api/api.model';
import { ConsentLevel } from '../../../lib/consent.model';
import { useBrowserStore } from './use-browser-store';

export function usePreviousIssuer() {
  const [storeValue, setStoreValue] = useBrowserStore(ConsentLevel.STRICTLY_NECESSARY, 'PREVIOUS_ISSUER');
  const issuer = useMemo(() => {
    if (storeValue === null) {
      return null;
    }

    return storeValue as Issuer;
  }, [storeValue]);

  function handleValueChange(newValue: Issuer) {
    setStoreValue(newValue);
  }

  return [issuer, handleValueChange] as const;
}
