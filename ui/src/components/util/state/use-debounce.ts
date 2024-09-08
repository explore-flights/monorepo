import { useCallback, useState } from 'react';
import { useTimeout } from './common';

export function useDebounce<T>(value: T, ms: number): T {
  const [result, setResult] = useState<T>(value);
  const action = useCallback(() => setResult(value), [value]);

  useTimeout(action, ms);

  return result;
}