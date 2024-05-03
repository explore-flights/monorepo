import React from 'react';
import { Box, Container, ContentLayout, Header } from '@cloudscape-design/components';

export function Home() {
  return (
    <ContentLayout header={<Header variant={'h1'}>Welcome to explore.flights</Header>}>
      <Container>
        <Box variant={'span'}>Hello world</Box>
      </Container>
    </ContentLayout>
  );
}