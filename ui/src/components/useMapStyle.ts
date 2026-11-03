import { useQuery } from '@tanstack/react-query';
import { inlineSources, osm } from '@versatiles/style';
import { usePreferences } from '@/app/preferences';

export function useMapStyle() {
  const { canUseMaps, effectiveTheme } = usePreferences();

  return useQuery({
    queryKey: ['map-style', effectiveTheme],
    queryFn: ({ signal }) =>
      inlineSources(
        osm({
          urls: { base: 'https://tiles.versatiles.org' },
          projection: 'mercator',
          text: { language: 'en' },
          theme: effectiveTheme === 'dark' ? 'colorful-dark' : 'colorful',
        }),
        { fetch: (input, init) => fetch(input, { ...init, signal }) },
      ),
    enabled: canUseMaps,
    staleTime: Infinity,
  });
}
