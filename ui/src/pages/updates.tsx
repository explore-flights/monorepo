import {
  Container,
  ContentLayout,
  Header,
} from '@cloudscape-design/components';
import React from 'react';
import { useGlobalUpdates } from '../components/util/state/data';
import { UpdateReportLineChart } from '../components/updates/updates-line-chart';

export function Updates() {
  const { data: items, isPending } = useGlobalUpdates();
  return (
    <ContentLayout header={<Header variant={'h1'}>Updates</Header>}>
      <Container>
        <UpdateReportLineChart items={items ?? []} loading={isPending} />
      </Container>
    </ContentLayout>
  );
}
