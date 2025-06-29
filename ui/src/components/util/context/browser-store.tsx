import React, {
  createContext, useContext, useEffect, useState,
} from 'react';
import { BrowserStore } from '../../../lib/store/browser-store';

const DEFAULT = new BrowserStore(window.localStorage, true);
const BrowserStoreContext = createContext<BrowserStore>(DEFAULT);

export function BrowserStoreProvider({ storage, children }: React.PropsWithChildren<{ storage: Storage; }>) {
  const [store, setStore] = useState<BrowserStore>(DEFAULT);
  useEffect(() => {
    const v = new BrowserStore(storage, false);
    setStore(v);
    return () => v.close();
  }, [storage]);

  return (
    <BrowserStoreContext.Provider value={store}>
      {children}
    </BrowserStoreContext.Provider>
  );
}

export function useBrowserStore() {
  return useContext(BrowserStoreContext);
}
