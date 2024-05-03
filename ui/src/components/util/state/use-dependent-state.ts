import { useEffect, useState } from 'react';

export function useDependentState<T>(dep: T) {
  const [value, setValue] = useState(dep);
  useEffect(() => {
    setValue(dep);
  }, [dep]);

  return [value, setValue] as const;
}
