import { BreadcrumbGroupProps } from '@cloudscape-design/components';
import { useMemo } from 'react';
import { useLocation } from 'react-router-dom';

interface RouteElement {
  path: string | RegExp;
  title?: string | ((part: string) => string);
  breadcrumb?: string | ((part: string) => string);
  children?: readonly RouteElement[];
}

const ROUTES = [{
  path: '',
  breadcrumb: 'Home',
  children: [
    // region general
    {
      path: 'legal',
      title: 'Legal',
      breadcrumb: 'Legal',
    },
    {
      path: 'privacy-policy',
      title: 'Privacy Policy',
      breadcrumb: 'Privacy Policy',
    },
    {
      path: 'tools',
      children: [
        {
          path: 'mm-quick-search',
          title: 'M&M Quick Search',
          breadcrumb: 'M&M Quick Search',
        },
      ],
    },
    // endregion
  ],
}] satisfies readonly RouteElement[];

export function useRouteContext() {
  const location = useLocation();
  
  return useMemo(() => {
    let titlePrefix: string | undefined;
    const breadcrumbItems: BreadcrumbGroupProps.Item[] = [];

    if (location.pathname !== '/') {
      const parts = location.pathname.split('/').map(decodeURIComponent);

      let href = '';
      let routes: readonly RouteElement[] | undefined = ROUTES;

      for (const part of parts) {
        if (!href.endsWith('/')) {
          href += '/';
        }

        const currentHref = `${href}${encodeURIComponent(part)}`;
        let ignorePart = false;

        if (routes !== undefined) {
          let matchedRoute: RouteElement | undefined;

          for (const route of routes) {
            if ((route.path instanceof RegExp && route.path.test(part)) || route.path === part) {
              matchedRoute = route;
              break;
            }
          }

          if (matchedRoute !== undefined) {
            if (matchedRoute.title !== undefined) {
              if (typeof matchedRoute.title === 'function') {
                titlePrefix = matchedRoute.title(part);
              } else {
                titlePrefix = matchedRoute.title;
              }
            }

            if (matchedRoute.breadcrumb !== undefined) {
              let text: string;
              if (typeof matchedRoute.breadcrumb === 'function') {
                text = matchedRoute.breadcrumb(part);
              } else {
                text = matchedRoute.breadcrumb;
              }

              breadcrumbItems.push({
                text: text,
                href: currentHref,
              });
            }

            ignorePart = true;
          }

          routes = matchedRoute?.children;
        }

        if (!ignorePart) {
          breadcrumbItems.push({
            text: part,
            href: currentHref,
          });
        }

        href = currentHref;
      }
    }

    return {
      documentTitle: titlePrefix !== undefined ? `${titlePrefix} • explore.flights` : 'explore.flights',
      breadcrumbItems: breadcrumbItems,
    } as const;
  }, [location]);
}

export function useDocumentTitle() {
  const { documentTitle } = useRouteContext();
  return documentTitle;
}

export function useBreadcrumbItems() {
  const { breadcrumbItems } = useRouteContext();
  return breadcrumbItems;
}
