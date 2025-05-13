import React from 'react';
import { ExpandableSection } from '@cloudscape-design/components';
import { ConnectionsTable } from './connections-table';
import { ConnectionsMap } from './connections-map';
import { ConnectionsGraphTabs } from './connections-graph-tabs';
import { ConnectionsResponse } from '../../lib/api/api.model';

export interface ConnectionsResultsProps {
  connections?: ConnectionsResponse;
}

export function ConnectionsResults({ connections }: ConnectionsResultsProps) {
  if (connections === undefined) {
    return undefined;
  }

  return (
    <>
      <ExpandableSection headerText={'Graph'} defaultExpanded={true} variant={'stacked'}>
        <ConnectionsGraphTabs connections={connections} />
      </ExpandableSection>
      <ExpandableSection headerText={'Map'} defaultExpanded={false} variant={'stacked'} disableContentPaddings={true}>
        <ConnectionsMap connections={connections} />
      </ExpandableSection>
      <ExpandableSection headerText={'Table'} defaultExpanded={false} variant={'stacked'}>
        <ConnectionsTable connections={connections} />
      </ExpandableSection>
    </>
  );
}
