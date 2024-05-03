import { useEffect, useMemo, useState } from 'react';

export function useMediaQuery(query: string) {
  const mql = useMemo(() => window.matchMedia(query), [query]);
  const [matches, setMatches] = useState(mql.matches);

  useEffect(() => {
    setMatches(mql.matches);

    const listener = (e: MediaQueryListEvent) => setMatches(e.matches);

    if (mql.addEventListener === undefined) {
      mql.addListener(listener);
      return () => mql.removeListener(listener);
    }

    mql.addEventListener('change', listener);
    return () => mql.removeEventListener('change', listener);
  }, [mql]);

  return matches;
}

export function useBreakpoint(breakpoint: number) {
  return useMediaQuery(`(max-width: ${breakpoint}px)`);
}

export function useMobile() {
  // https://github.com/cloudscape-design/components/blob/main/src/internal/breakpoints.ts
  return useBreakpoint(688);
}

export function useInterval(action: () => void, ms: number) {
  useEffect(() => {
    const intervalId = setInterval(action, ms);
    return () => clearInterval(intervalId);
  }, [action, ms]);
}

export function useTimeout(action: () => void, ms: number) {
  useEffect(() => {
    const intervalId = setTimeout(action, ms);
    return () => clearTimeout(intervalId);
  }, [action, ms]);
}

export function useClipboard() {
  const [loading, setLoading] = useState(false);
  const [value, setValue] = useState<string | null>(null);

  function copyToClipboard(data: string) {
    setLoading(false);

    navigator.clipboard.writeText(data)
      .then(() => setValue(data))
      .catch(() => setValue(null))
      .finally(() => setLoading(false));
  }

  return [loading, value, copyToClipboard] as const;
}
