import {
  AppLayout,
  AppLayoutProps,
  Flashbar,
  FlashbarProps,
  LinkProps,
  NonCancelableCustomEvent,
  SplitPanel,
} from '@cloudscape-design/components';
import { I18nProvider as CSI18nProvider } from '@cloudscape-design/components/i18n';
import enMessages from '@cloudscape-design/components/i18n/messages/all.en';
import {
  applyDensity, applyMode, Density, Mode,
} from '@cloudscape-design/global-styles';
import React, {
  createContext, useContext, useEffect, useMemo, useState,
} from 'react';
import { AuthInfo } from '../lib/api/api.model';
import { customI18nMessages } from '../lib/i18n/i18n-strings';
import { ColorScheme, UIDensity } from '../lib/preferences.model';
import { Breadcrumb } from './breadcrumb/breadcrumb';
import CookiePreferences from './cookie-preferences/cookie-preferences';
import FlightsFooter from './footer/footer';
import FlightsHeader from './header/header';
import { SideNav } from './sidenav/sidenav';
import { AppControlsProvider } from './util/context/app-controls';
import { AuthInfoProvider, useAuthInfo } from './util/context/auth-info';
import { BrowserStoreProvider } from './util/context/browser-store';
import { HttpClientProvider, useHttpClient } from './util/context/http-client';
import { useMobile } from './util/state/common';
import { useHasConsent } from './util/state/use-consent';
import { usePreferences } from './util/state/use-preferences';
import { useDocumentTitle } from './util/state/use-route-context';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { CookieBanner } from './cookie-banner/cookie-banner';

interface AppControlsState {
  tools: {
    element: React.ReactNode | undefined;
    open: boolean;
    onChange: (e: NonCancelableCustomEvent<AppLayoutProps.ChangeDetail>) => void;
  };
  splitPanel: [string, React.ReactNode] | undefined;
  notification: {
    messages: Array<FlashbarProps.MessageDefinition>;
  };
}

const AppControlsStateContext = createContext<AppControlsState>({
  tools: {
    element: undefined,
    open: false,
    onChange: () => {},
  },
  splitPanel: undefined,
  notification: {
    messages: [],
  },
});

export interface RootLayoutProps extends Omit<AppLayoutProps, 'content'> {
  headerHide: boolean;
  breadcrumbsHide: boolean;
}

export function RootLayout({
  headerHide, breadcrumbsHide, children, ...appLayoutProps 
}: React.PropsWithChildren<RootLayoutProps>) {
  const documentTitle = useDocumentTitle();
  const [authInfo] = useAuthInfo();
  const hasConsent = useHasConsent();
  const [cookiePrefVisible, setCookiePrefVisible] = useState(false);
  const isMobile = useMobile();
  const [splitPanelOpen, setSplitPanelOpen] = useState(true);
  const [isNavigationOpen, setNavigationOpen] = useState(!isMobile && (authInfo !== undefined && authInfo !== null));
  const appControlsState = useContext(AppControlsStateContext);

  useEffect(() => {
    const restore = document.title;
    document.title = documentTitle;
    return () => { document.title = restore; };
  }, [documentTitle]);

  useEffect(() => {
    setNavigationOpen(!isMobile && (authInfo !== undefined && authInfo !== null));
  }, [isMobile, authInfo]);

  function onCookiePreferencesClick(e: CustomEvent<LinkProps.FollowDetail>) {
    e.preventDefault();
    setCookiePrefVisible(true);
  }

  return (
    <>
      {!headerHide && <FlightsHeader />}
      <HeaderSelectorFixAppLayout
        toolsHide={appControlsState.tools.element === undefined}
        tools={appControlsState.tools.element}
        toolsOpen={appControlsState.tools.element !== undefined && appControlsState.tools.open}
        onToolsChange={appControlsState.tools.onChange}
        splitPanel={
          appControlsState.splitPanel !== undefined
            ? <SplitPanel header={appControlsState.splitPanel[0]} hidePreferencesButton={true}>{appControlsState.splitPanel[1]}</SplitPanel>
            : undefined
        }
        splitPanelOpen={appControlsState.splitPanel !== undefined && splitPanelOpen}
        splitPanelPreferences={{ position: 'side' }}
        onSplitPanelToggle={(e) => setSplitPanelOpen(e.detail.open)}
        headerSelector={headerHide ? undefined : '#flights-custom-header'}
        stickyNotifications={true}
        notifications={<Flashbar stackItems={true} items={appControlsState.notification.messages} />}
        breadcrumbs={breadcrumbsHide ? undefined : <Breadcrumb />}
        navigation={<SideNav />}
        navigationOpen={isNavigationOpen}
        onNavigationChange={(e) => setNavigationOpen(e.detail.open)}
        content={children}
        {...appLayoutProps}
      />
      <CookiePreferences onDismiss={() => setCookiePrefVisible(false)} visible={cookiePrefVisible} />
      {!hasConsent && <CookieBanner onCustomizeClick={() => setCookiePrefVisible(true)} />}
      <FlightsFooter onCookiePreferencesClick={onCookiePreferencesClick} />
    </>
  );
}

function HeaderSelectorFixAppLayout(props: AppLayoutProps) {
  const { headerSelector, ...appLayoutProps } = props;
  const [key, setKey] = useState(`a${Date.now()}-${Math.random()}`);

  useEffect(() => {
    setKey(`a${Date.now()}-${Math.random()}`);
  }, [headerSelector]);

  return (
    <AppLayout key={key} headerSelector={headerSelector} {...appLayoutProps} />
  );
}

export function BaseProviders({ children }: React.PropsWithChildren) {
  return (
    <BrowserStoreProvider storage={window.localStorage}>
      <HttpClientProvider>
        <InternalBaseProviders>
          {children}
        </InternalBaseProviders>
      </HttpClientProvider>
    </BrowserStoreProvider>
  );
}

function InternalBaseProviders({ children }: React.PropsWithChildren) {
  const queryClient = new QueryClient();

  const { apiClient } = useHttpClient();
  const [preferences] = usePreferences();
  const [authInfo, setAuthInfo] = useState<AuthInfo | null | undefined>(undefined);
  const [tools, setTools] = useState<React.ReactNode>();
  const [toolsOpen, setToolsOpen] = useState(false);
  const [splitPanel, setSplitPanel] = useState<[string, React.ReactNode]>();
  const [notificationMessages, setNotificationMessages] = useState<Array<FlashbarProps.MessageDefinition>>([]);

  function setAuthInfoInternal(newValue: (AuthInfo | null) | ((prevState: (AuthInfo | null | undefined)) => (AuthInfo | null))) {
    setAuthInfo(newValue);
  }

  useEffect(() => {
    document.getElementById('temp_style')?.remove();
  }, []);

  useEffect(() => {
    applyMode(preferences.effectiveColorScheme === ColorScheme.LIGHT ? Mode.Light : Mode.Dark, document.documentElement);
    applyDensity(preferences.uiDensity === UIDensity.COMFORTABLE ? Density.Comfortable : Density.Compact, document.documentElement);
  }, [preferences]);

  useEffect(() => {
    (async () => {
      const resp = await apiClient.getAuthInfo();
      if (resp.body !== undefined) {
        setAuthInfo(resp.body);
      } else {
        setAuthInfo(null);
      }
    })().catch(() => setAuthInfo(null));
  }, [apiClient]);


  const appControlsState = useMemo<AppControlsState>(() => ({
    tools: {
      element: tools,
      open: toolsOpen,
      onChange(e): void {
        setToolsOpen(e.detail.open);
      },
    },
    splitPanel: splitPanel,
    notification: {
      messages: notificationMessages,
    },
  }), [tools, toolsOpen, splitPanel, notificationMessages]);

  return (
    <QueryClientProvider client={queryClient}>
      <CSI18nProvider locale={'en'} messages={[enMessages, customI18nMessages]}>
        <AuthInfoProvider value={[authInfo, setAuthInfoInternal]}>
          <AppControlsProvider
            setTools={setTools}
            setToolsOpen={setToolsOpen}
            setSplitPanel={setSplitPanel}
            setNotificationMessages={setNotificationMessages}
          >
            <AppControlsStateContext.Provider value={appControlsState}>
              {children}
            </AppControlsStateContext.Provider>
          </AppControlsProvider>
        </AuthInfoProvider>
      </CSI18nProvider>
    </QueryClientProvider>
  );
}
