import { SideNavigation } from '@cloudscape-design/components';
import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useI18n } from '../util/context/i18n';

export function SideNav() {
  const i18n = useI18n();
  const location = useLocation();
  const navigate = useNavigate();

  return (
    <SideNavigation
      items={[]}
      activeHref={location.pathname}
      onFollow={(e) => {
        e.preventDefault();
        navigate(e.detail.href);
      }}
    />
  );
}
