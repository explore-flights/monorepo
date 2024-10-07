import { Aircraft, Airports, Connections } from '../../lib/api/api.model';
import React, { useMemo } from 'react';
import { ExpandableSection } from '@cloudscape-design/components';
import { ConnectionsTable } from './connections-table';
import { ConnectionsMap } from './connections-map';
import { ConnectionsGraphTabs } from './connections-graph-tabs';

export interface ConnectionsResultsProps {
  connections?: Connections;
  airports: Airports;
  aircraft: ReadonlyArray<Aircraft>;
}

export function ConnectionsResults({ connections, airports, aircraft }: ConnectionsResultsProps) {
  if (connections === undefined) {
    return undefined;
  }

  const aircraftLookup = useMemo(() => {
    const lookup: Record<string, Aircraft> = {};
    for (const a of aircraft) {
      lookup[a.code] = a;
    }

    return lookup;
  }, [aircraft]);

  return (
    <>
      <ExpandableSection headerText={'Graph'} defaultExpanded={true} variant={'stacked'}>
        <ConnectionsGraphTabs connections={connections} aircraftLookup={aircraftLookup} />
      </ExpandableSection>
      <ExpandableSection headerText={'Map'} defaultExpanded={false} variant={'stacked'} disableContentPaddings={true}>
        <ConnectionsMap connections={connections} airports={airports} aircraftLookup={aircraftLookup} />
      </ExpandableSection>
      <ExpandableSection headerText={'Table'} defaultExpanded={false} variant={'stacked'}>
        <ConnectionsTable connections={connections} aircraftLookup={aircraftLookup} />
      </ExpandableSection>
    </>
  );
}
