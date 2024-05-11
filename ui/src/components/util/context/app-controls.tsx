import { CodeView } from '@cloudscape-design/code-view';
import jsonHighlight from '@cloudscape-design/code-view/highlight/json';
import {
  Box, ExpandableSection, FlashbarProps, SpaceBetween, 
} from '@cloudscape-design/components';
import React, {
  createContext, Dispatch, SetStateAction, useCallback, useContext, useEffect, useMemo,
} from 'react';
import { ApiError } from '../../../lib/api/api';
import { Copy } from '../../common/copy';
import { KeyValuePairs, ValueWithLabel } from '../../common/key-value-pairs';

export interface AppControls {
  readonly tools: {
    set(value: React.SetStateAction<React.ReactNode | undefined>): void;
    open(value: React.SetStateAction<boolean>): void;
  };
  readonly splitPanel: {
    set(value: React.SetStateAction<[string, React.ReactNode] | undefined>): void;
  };
  readonly notification: {
    addOnce(base: FlashbarProps.MessageDefinition): void;
    add(base: FlashbarProps.MessageDefinition): Dispatch<SetStateAction<FlashbarProps.MessageDefinition>>;
  };
}

const AppControlsContext = createContext<AppControls>({
  tools: {
    set(_: React.SetStateAction<React.ReactNode | undefined>): void {
    },
    open(_: React.SetStateAction<boolean>): void {
    },
  },
  splitPanel: {
    set(_: React.SetStateAction<[string, React.ReactNode] | undefined>): void {
    },
  },
  notification: {
    addOnce(_: FlashbarProps.MessageDefinition): void {
    },
    add(_: FlashbarProps.MessageDefinition): React.Dispatch<React.SetStateAction<FlashbarProps.MessageDefinition>> {
      return (__) => () => {};
    },
  },
});

export interface AppControlsProviderProps {
  setTools: React.Dispatch<React.SetStateAction<React.ReactNode | undefined>>;
  setToolsOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setSplitPanel: React.Dispatch<React.SetStateAction<[string, React.ReactNode] | undefined>>;
  setNotificationMessages: React.Dispatch<React.SetStateAction<Array<FlashbarProps.MessageDefinition>>>;
}

export function AppControlsProvider(props: React.PropsWithChildren<AppControlsProviderProps>) {
  const {
    setTools,
    setToolsOpen,
    setSplitPanel,
    setNotificationMessages,
    children,
  } = props;
  
  const createNotificationMessage = useCallback((id: string, base: FlashbarProps.MessageDefinition): FlashbarProps.MessageDefinition => ({
    ...base,
    id: id,
    onDismiss: (e) => {
      if (base.onDismiss) {
        base.onDismiss(e);
      }

      if (base.dismissible && !e.defaultPrevented) {
        setNotificationMessages((items) => items.filter((item) => item.id !== id));
      }
    },
  }), []);

  const addNotification = useCallback((base: FlashbarProps.MessageDefinition): string => {
    const id = `n${Date.now()}-${Math.random()}`;
    const message = createNotificationMessage(id, base);
    setNotificationMessages((items) => [message, ...items]);

    return id;
  }, [createNotificationMessage]);
  
  const appControls = useMemo<AppControls>(() => ({
    tools: {
      set(value: React.SetStateAction<React.ReactNode | undefined>) {
        setTools(value);
      },
      open(value: React.SetStateAction<boolean>) {
        setToolsOpen(value);
      },
    },
    splitPanel: {
      set(value: React.SetStateAction<[string, React.ReactNode] | undefined>) {
        setSplitPanel(value);
      },
    },
    notification: {
      addOnce(base: FlashbarProps.MessageDefinition): void {
        addNotification(base);
      },
      add(base: FlashbarProps.MessageDefinition): React.Dispatch<React.SetStateAction<FlashbarProps.MessageDefinition>> {
        let currBase = base;
        const id = addNotification(base);

        return (update) => {
          if (typeof update === 'function') {
            currBase = update(currBase);
          } else {
            currBase = update;
          }

          const updatedNotification = createNotificationMessage(id, currBase);
          setNotificationMessages((items) => {
            const updatedItems = new Array<FlashbarProps.MessageDefinition>(items.length);
            let found = false;

            for (let i = 0; i < items.length; i++) {
              if (items[i].id === id) {
                updatedItems[i] = updatedNotification;
                found = true;
              } else {
                updatedItems[i] = items[i];
              }
            }

            if (!found) {
              updatedItems.unshift(updatedNotification);
            }

            return updatedItems;
          });
        };
      },
    },
  }), [createNotificationMessage, addNotification]);

  return (
    <AppControlsContext.Provider value={appControls}>
      {children}
    </AppControlsContext.Provider>
  );
}

export function useAppControls() {
  return useContext(AppControlsContext);
}

export function useTools(tools?: React.ReactNode) {
  const appControls = useAppControls();
  useEffect(() => {
    let restore: React.ReactNode | undefined;
    appControls.tools.set((prev) => {
      restore = prev;
      return tools;
    });

    return () => appControls.tools.set(restore);
  }, [appControls, tools]);
  
  return useCallback((value: React.SetStateAction<boolean>) => {
    appControls.tools.open(value);
  }, [appControls]);
}

export function useSplitPanel(header: string, content: React.ReactNode) {
  const appControls = useAppControls();
  useEffect(() => {
    let restore: [string, React.ReactNode] | undefined;
    appControls.splitPanel.set((prev) => {
      restore = prev;
      return [header, content];
    });

    return () => appControls.splitPanel.set(restore);
  }, [appControls, header, content]);
}

export function catchNotify(notifications: AppControls['notification'] | Dispatch<SetStateAction<FlashbarProps.MessageDefinition>>, errText?: string): (e: unknown) => void {
  return (e) => {
    const notification = {
      type: 'error',
      content: <ErrorNotificationContent errText={errText} error={e} />,
      dismissible: true,
    } satisfies FlashbarProps.MessageDefinition;

    if (typeof notifications === 'function') {
      notifications(notification);
    } else {
      notifications.addOnce(notification);
    }
  };
}

function ErrorNotificationContent({ errText, error: e }: { errText?: string, error: unknown }) {
  let errMessage: string | undefined;
  let errDetails: React.ReactNode;

  if (e instanceof ApiError) {
    errMessage = e.message;

    const requestId = e.response.headers.get('X-Amzn-Requestid');
    const parts: Array<React.ReactNode> = [
      (
        <KeyValuePairs columns={requestId !== null ? 2 : 1}>
          <ValueWithLabel label={'Status'}>{e.response.status}</ValueWithLabel>
          <ValueWithLabel label={'Request ID'}>
            {
              requestId !== null
                ? <Copy copyText={requestId}><Box variant={'samp'}>{requestId}</Box></Copy>
                : <Box variant={'samp'}>unknown</Box>
            }
          </ValueWithLabel>
        </KeyValuePairs>
      ),
    ];

    if (e.response.kind === 2) {
      parts.push(
        (
          <CodeView content={getErrorDetails(e.response.error)} highlight={jsonHighlight} />
        ),
      );
    }

    errDetails = (
      <SpaceBetween size={'s'} direction={'vertical'}>
        {...parts}
      </SpaceBetween>
    );
  } else if (e instanceof Error) {
    errMessage = e.message;
    errDetails = (
      <CodeView content={getErrorDetails(e)} highlight={jsonHighlight} />
    );
  } else {
    errDetails = (
      <CodeView content={JSON.stringify(e, null, 2)} highlight={jsonHighlight} />
    );
  }

  const errSuffix = errMessage !== undefined ? `: ${errMessage}` : '';

  return (
    <SpaceBetween size={'xs'} direction={'vertical'}>
      <Box>{(errText ?? 'Failed to perform action') + errSuffix}</Box>
      <ExpandableSection headerText={'Details'} variant={'footer'}>
        {errDetails}
      </ExpandableSection>
    </SpaceBetween>
  );
}

function getErrorDetails(e: Error): string {
  function transformError(v: unknown): unknown {
    if (v instanceof Error) {
      return {
        name: v.name,
        message: v.message,
        cause: v.cause !== undefined ? transformError(v.cause) : undefined,
      };
    }

    return v;
  }

  return JSON.stringify(transformError(e), null, 2);
}
