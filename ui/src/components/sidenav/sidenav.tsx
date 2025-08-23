import { SideNavigation } from '@cloudscape-design/components';
import React from 'react';
import { useHref, useLocation, useNavigate } from 'react-router-dom';

export function SideNav() {
  const location = useLocation();
  const navigate = useNavigate();

  return (
    <SideNavigation
      items={[
        {
          type: 'link',
          text: 'Airports',
          href: useHref('/airport'),
        },
        {
          type: 'link',
          text: 'Allegris',
          href: useHref('/allegris'),
        },
        {
          type: 'link',
          text: 'Swiss A350',
          href: useHref('/swiss350'),
        },
        {
          type: 'link',
          text: 'Updates',
          href: useHref('/updates'),
        },
        { type: 'divider' },
        {
          type: 'section-group',
          title: 'Tools',
          items: [
            { type: 'link', text: 'Flight Search', href: useHref('/tools/flight-search') },
            { type: 'link', text: 'Links', href: useHref('/tools/links') },
          ],
        },
      ]}
      activeHref={location.pathname}
      onFollow={(e) => {
        e.preventDefault();
        navigate(e.detail.href);
      }}
    />
  );
}
