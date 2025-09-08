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
          type: 'section-group',
          title: 'Special Aircraft',
          items: [
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
              text: 'LH A380',
              href: useHref('/lh380'),
            },
            {
              type: 'link',
              text: 'LH A340',
              href: useHref('/lh340'),
            },
            {
              type: 'link',
              text: 'LH 747',
              href: useHref('/lh747'),
            },
          ],
        },
        { type: 'divider' },
        {
          type: 'section-group',
          title: 'Tools',
          items: [
            { type: 'link', text: 'Flight Search', href: useHref('/tools/flight-search') },
            { type: 'link', text: 'Links', href: useHref('/tools/links') },
            { type: 'link', text: 'Airports', href: useHref('/airport') },
          ],
        },
        { type: 'divider' },
        {
          type: 'link',
          text: 'Updates',
          href: useHref('/updates'),
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
