import { TopNavigation, TopNavigationProps } from '@cloudscape-design/components';
import React, { useState } from 'react';
import { PreferencesModal } from '../preferences/preferences';
import classes from './header.module.scss';
import { useAuthInfo } from '../util/context/auth-info';
import { catchNotify, useAppControls } from '../util/context/app-controls';
import { useHttpClient } from '../util/context/http-client';
import { expectSuccess } from '../../lib/api/api';

export default function FlightsHeader() {
  const { apiClient } = useHttpClient();
  const { notification } = useAppControls();

  const [showPreferences, setShowPreferences] = useState(false);
  const [authInfo, setAuthInfo] = useAuthInfo();

  function logout() {
    (async () => {
      const resp = await apiClient.logout();
      if (resp.status >= 500) {
        expectSuccess(resp);
        return;
      }

      setAuthInfo(null);
    })()
      .catch(catchNotify(notification));
  }

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

  if (authInfo === undefined) {
    utilities.push({
      type: 'button',
      iconName: 'status-in-progress',
      text: 'Loading...',
    });
  } else if (authInfo === null) {
    utilities.push(
      {
        type: 'menu-dropdown',
        text: 'Login/Register',
        items: [
          {
            id: 'login',
            text: 'Login',
            href: '/auth/oauth2/login/google',
          },
          {
            id: 'register',
            text: 'Register',
            href: '/auth/oauth2/register/google',
          },
        ],
      },
    )
  } else {
    utilities.push({
      type: 'button',
      text: 'Logout',
      iconName: 'undo',
      onClick: logout,
    });
  }

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
