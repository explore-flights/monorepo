import React, { createContext, useContext, useMemo } from 'react';
import { ApiClient } from '../../../lib/api/api';
import { HTTPClient } from '../../../lib/http';

export interface HttpClientContextType {
  httpClient: HTTPClient;
  apiClient: ApiClient;
}

const globalHttpClient = new HTTPClient();
const HttpClientContext = createContext<HttpClientContextType>({
  httpClient: globalHttpClient,
  apiClient: new ApiClient(globalHttpClient),
});

export function HttpClientProvider({ children }: React.PropsWithChildren) {
  const httpClient = useMemo(() => new HTTPClient(), []);
  const apiClient = useMemo(() => new ApiClient(httpClient), [httpClient]);

  return (
    <HttpClientContext.Provider value={{ httpClient: httpClient, apiClient: apiClient }}>
      {children}
    </HttpClientContext.Provider>
  );
}

export function useHttpClient() {
  return useContext(HttpClientContext);
}
