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
import PrivacyPreferences from './privacy-preferences/privacy-preferences';
import FlightsFooter from './footer/footer';
import FlightsHeader from './header/header';
import { SideNav } from './sidenav/sidenav';
import { AppControlsProvider, catchNotify, useAppControls } from './util/context/app-controls';
import { AuthInfoProvider } from './util/context/auth-info';
import { BrowserStoreProvider } from './util/context/browser-store';
import { HttpClientProvider, useHttpClient } from './util/context/http-client';
import { useHasConsent } from './util/state/use-consent';
import { usePreferences } from './util/state/use-preferences';
import { useDocumentTitle } from './util/state/use-route-context';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { CookieBanner } from './cookie-banner/cookie-banner';
import { expectSuccess } from '../lib/api/api';
import { Markdown } from './markdown/markdown';

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
  const { apiClient } = useHttpClient();
  const { notification } = useAppControls();

  const documentTitle = useDocumentTitle();
  const hasConsent = useHasConsent();
  const [cookiePrefVisible, setCookiePrefVisible] = useState(false);
  const [splitPanelOpen, setSplitPanelOpen] = useState(true);
  const [isNavigationOpen, setNavigationOpen] = useState(false);
  const appControlsState = useContext(AppControlsStateContext);

  useEffect(() => {
    const restore = document.title;
    document.title = documentTitle;
    return () => { document.title = restore; };
  }, [documentTitle]);

  useEffect(() => {
    (async () => {
      const { body } = expectSuccess(await apiClient.getNotifications());
      body.forEach((v) => notification.addOnce({
        type: v.type,
        header: v.header,
        content: <Markdown md={v.content} />,
        dismissible: true,
      }));
    })().catch(catchNotify(notification, 'Failed to load notifications'));
  }, [apiClient, notification]);

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
      <PrivacyPreferences onDismiss={() => setCookiePrefVisible(false)} visible={cookiePrefVisible} />
      {!hasConsent && <CookieBanner onCustomizeClick={() => setCookiePrefVisible(true)} />}
      <FlightsFooter onPrivacyPreferencesClick={onCookiePreferencesClick} />
    </>
  );
}

function HeaderSelectorFixAppLayout(props: AppLayoutProps) {
  const { headerSelector, ...appLayoutProps } = props;
  const key = useMemo(() => `a${Date.now()}-${Math.random()}`, [headerSelector]);

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

  /*
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
   */

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
