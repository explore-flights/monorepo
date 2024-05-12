import React, { useEffect, useState } from 'react';

interface AsyncStateLoading {
  loading: true;
  error: undefined;
}

interface AsyncStateDone {
  loading: false;
  error: undefined;
}

interface AsyncStateError {
  loading: false;
  error: unknown;
}

export type AsyncState = AsyncStateLoading | AsyncStateDone | AsyncStateError;

export function useAsync<T>(initial: T, fn: () => Promise<T>, deps: React.DependencyList) {
  const [state, setState] = useState<AsyncState>({
    loading: true,
    error: undefined,
  });

  const [value, setValue] = useState(initial);

  useEffect(() => {
    setState({ loading: true, error: undefined });
    fn()
      .then((r) => setValue(r))
      .then(() => setState({ loading: false, error: undefined }))
      .catch((e) => setState({ loading: false, error: e }));
  }, deps);

  return [value, state] as const;
}