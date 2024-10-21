import {
  Autosuggest,
  AutosuggestProps,
  SelectProps,
  TopNavigation,
  TopNavigationProps
} from '@cloudscape-design/components';
import React, { useMemo, useState } from 'react';
import { PreferencesModal } from '../preferences/preferences';
import classes from './header.module.scss';
import { useSearch } from '../util/state/data';
import { useDebounce } from '../util/state/use-debounce';
import { useNavigate } from 'react-router-dom';

export default function FlightsHeader() {
  const [showPreferences, setShowPreferences] = useState(false);

  /*
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
   */

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

  /*
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
   */

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
          search={<TopNavigationSearch />}
        />
      </header>
    </>
  );
}

function TopNavigationSearch() {
  const navigate = useNavigate();

  const [query, setQuery] = useState('');
  const [searchEnabled, setSearchEnabled] = useState(false);
  const results = useSearch(useDebounce(query, 250), searchEnabled);

  const options = useMemo<ReadonlyArray<AutosuggestProps.Option>>(() => {
    const opts: Array<SelectProps.Option> = [];
    if (results.data) {
      for (const flightNumber of results.data) {
        opts.push({
          label: flightNumber,
          value: flightNumber,
        });
      }
    }

    return opts;
  }, [results.data]);

  const statusType = useMemo(() => {
    return ({
      'success': 'finished',
      'error': 'error',
      'pending': 'loading',
    } satisfies Record<string, 'finished' | 'error' | 'loading'>)[results.status];
  }, [results.status]);

  return (
    <Autosuggest
      value={query}
      options={options}
      filteringType={'manual'}
      statusType={statusType}
      virtualScroll={true}
      onChange={(e) => setQuery(e.detail.value)}
      onLoadItems={(e) => setQuery(e.detail.filteringText)}
      onSelect={(e) => {
        if (e.detail.selectedOption && e.detail.selectedOption.value) {
          navigate(`/flight/${encodeURIComponent(e.detail.selectedOption.value)}`);
        } else {
          navigate(`/flight/${encodeURIComponent(e.detail.value.toUpperCase().trim())}`);
        }
      }}
      onFocus={() => setSearchEnabled(true)}
    />
  )
}
