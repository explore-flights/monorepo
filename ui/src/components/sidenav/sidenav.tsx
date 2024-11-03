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
          text: 'Allegris',
          href: useHref('/allegris'),
        },
        { type: 'divider' },
        {
          type: 'section-group',
          title: 'Tools',
          items: [
            { type: 'link', text: 'M&M Quick Search', href: useHref('/tools/mm-quick-search') },
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
