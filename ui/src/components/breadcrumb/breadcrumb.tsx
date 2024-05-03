import { BreadcrumbGroup } from '@cloudscape-design/components';
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useBreadcrumbItems } from '../util/state/use-route-context';

export function Breadcrumb() {
  const navigate = useNavigate();
  const items = useBreadcrumbItems();

  if (items.length < 2) {
    return undefined;
  }

  return (
    <BreadcrumbGroup
      items={items}
      onFollow={(e) => {
        e.preventDefault();
        navigate(e.detail.href);
      }}
    />
  );
}
