import { useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { isOneOf } from './collections';

export function useHashView<View extends string>(defaultView: View, views: readonly View[]) {
  const location = useLocation();
  const navigate = useNavigate();
  const hashView = location.hash.slice(1);
  const view = isOneOf(hashView, views) ? hashView : defaultView;

  const hrefFor = useCallback(
    (nextView: View) => ({
      pathname: location.pathname,
      search: location.search,
      hash: nextView === defaultView ? '' : `#${nextView}`,
    }),
    [defaultView, location.pathname, location.search],
  );

  const selectView = useCallback(
    (nextView: View) => {
      void navigate(hrefFor(nextView));
    },
    [hrefFor, navigate],
  );

  return { view, hrefFor, selectView };
}
