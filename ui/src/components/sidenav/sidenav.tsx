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
          title: 'Tools',
          items: [
            { type: 'link', text: 'M&M Quick Search', href: useHref('/tools/mm-quick-search') },
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
