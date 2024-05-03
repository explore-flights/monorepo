import { CodeView } from '@cloudscape-design/code-view';
import jsonHighlight from '@cloudscape-design/code-view/highlight/json';
import {
  Box, Container, ContainerProps, ContentLayout, ExpandableSection, Header, SpaceBetween,
} from '@cloudscape-design/components';
import React, { useMemo } from 'react';
import { useRouteError } from 'react-router-dom';
import { RootLayout } from '../components/root';

export function ErrorPage() {
  const error = useRouteError() as { status?: number; statusText?: string; message?: string; };


  return (
    <RootLayout headerHide={false} breadcrumbsHide={false}>
      <ContentLayout header={<Header variant={'h1'}>Oops!</Header>}>
        <Container>
          <SpaceBetween direction={'vertical'} size={'s'}>
            <Box variant={'h2'}>Sorry, an unexpected error has occurred.</Box>
            <Box variant={'span'}>{error.statusText ?? error.message}</Box>
            <ExpandableSection headerText={'Details'} variant={'footer'}>
              <CodeView content={JSON.stringify(error, null, 2)} highlight={jsonHighlight} />
            </ExpandableSection>
          </SpaceBetween>
        </Container>
      </ContentLayout>
    </RootLayout>
  );
}
