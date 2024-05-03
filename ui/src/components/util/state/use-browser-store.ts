import { useEffect, useState } from 'react';
import { ConsentLevel } from '../../../lib/consent.model';
import { useBrowserStore as useBrowserStoreBase } from '../context/browser-store';

export function useBrowserStore(consentLevel: ConsentLevel, key: string) {
  const store = useBrowserStoreBase();
  const [value, setValue] = useState(store.get(consentLevel, key));

  useEffect(() => {
    setValue(store.get(consentLevel, key));
    return store.subscribe(consentLevel, key, (v) => setValue(v[2]));
  }, [store, consentLevel, key]);

  function handleValueChange(newValue: string | null) {
    if (newValue !== null) {
      store.set(consentLevel, key, newValue);
    } else {
      store.remove(key);
    }
  }

  return [value, handleValueChange] as const;
}
