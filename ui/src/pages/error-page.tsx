import { CodeView } from '@cloudscape-design/code-view';
import jsonHighlight from '@cloudscape-design/code-view/highlight/json';
import {
  Box, Container, ContentLayout, ExpandableSection, Header, SpaceBetween,
} from '@cloudscape-design/components';
import React, { useEffect, useState } from 'react';
import { useRouteError, useSearchParams } from 'react-router-dom';
import { RootLayout } from '../components/root';

interface Error {
  status?: number;
  error?: string;
  message?: string;
  path?: string;
  raw: any;
}

export function ErrorPage({ backendError }: { backendError?: boolean }) {
  return (
    <RootLayout headerHide={false} breadcrumbsHide={false}>
      <ErrorLayout backendError={backendError} />
    </RootLayout>
  );
}

export function ErrorLayout({ backendError }: { backendError?: boolean }) {
  const [error, setError] = useState<Error>({
    raw: null,
  });

  if (backendError) {
    const [searchParams] = useSearchParams();
    useEffect(() => {
      const e: Error = {
        raw: searchParams.toString(),
      };

      const status = searchParams.get('status');
      const err = searchParams.get('error');
      const message = searchParams.get('message');
      const path = searchParams.get('path');

      if (status) {
        e.status = Number.parseInt(status, 10);
      }

      if (err) {
        e.error = err;
      }

      if (message) {
        e.message = message;
      }

      if (path) {
        e.path = path;
      }

      setError(e);
    }, [searchParams]);
  } else {
    const routeError = useRouteError() as { status?: number; statusText?: string; message?: string; };
    useEffect(() => setError({
      status: routeError.status,
      error: routeError.statusText,
      message: routeError.message,
      raw: routeError,
    }), [routeError]);
  }

  return (
    <RootLayout headerHide={false} breadcrumbsHide={false}>
      <ContentLayout header={<Header variant={'h1'}>Oops!</Header>}>
        <Container>
          <SpaceBetween direction={'vertical'} size={'s'}>
            <Box variant={'h2'}>{error.error ?? 'Sorry, an unexpected error has occurred.'}</Box>
            {error.message ? <Box variant={'span'}>{error.message}</Box> : undefined}
            <ExpandableSection headerText={'Details'} variant={'footer'}>
              <CodeView content={JSON.stringify(error, null, 2)} highlight={jsonHighlight} />
            </ExpandableSection>
          </SpaceBetween>
        </Container>
      </ContentLayout>
    </RootLayout>
  );
}
