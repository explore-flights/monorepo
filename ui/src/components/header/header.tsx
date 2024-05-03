import { TopNavigation, TopNavigationProps } from '@cloudscape-design/components';
import React, { useState } from 'react';
import { PreferencesModal } from '../preferences/preferences';
import classes from './header.module.scss';

export default function FlightsHeader() {
  const [showPreferences, setShowPreferences] = useState(false)
  const utilities: TopNavigationProps.Utility[] = [
    {
      type: 'button',
      text: 'GitHub',
      href: 'https://github.com/explore-flights',
      external: true,
      externalIconAriaLabel: '(opens in a new tab)',
    },
    {
      type: 'button',
      text: 'Preferences',
      iconName: 'settings',
      onClick: () => setShowPreferences(true),
    },
  ];

  return (
    <>
      <PreferencesModal visible={showPreferences} onDismiss={() => setShowPreferences(false)} />
      <header id="flights-custom-header" className={classes['flights-header']}>
        <TopNavigation
          identity={{
            href: '/',
            title: 'explore.flights',
            logo: {
              src: '/favicon.svg',
              alt: 'explore.flights Logo',
            },
          }}
          utilities={utilities}
        />
      </header>
    </>
  );
}
