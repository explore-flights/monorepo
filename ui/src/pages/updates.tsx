import {
  Container,
  ContentLayout,
  ExpandableSection,
  Header,
  Pagination, Popover,
  Spinner, StatusIndicator, Table
} from '@cloudscape-design/components';
import React, { useCallback, useMemo, useState } from 'react';
import { useUpdatesForVersion, useVersions } from '../components/util/state/data';
import { Airline, Airport, FlightNumber } from '../lib/api/api.model';
import { useCollection } from '@cloudscape-design/collection-hooks';
import { flightNumberToString } from '../lib/util/flight';
import { RouterLink } from '../components/common/router-link';
import { ErrorNotificationContent } from '../components/util/context/app-controls';

export function Updates() {
  const versionsQuery = useVersions();

  return (
    <ContentLayout header={<Header variant={'h1'} counter={`(${versionsQuery.data?.length ?? '?'})`}>Versions</Header>}>
      {
        versionsQuery.isLoading
          ? <Container><Spinner size={'large'} /></Container>
          : versionsQuery.isError
            ? <Container><ErrorNotificationContent error={versionsQuery.error}/></Container>
            : <Versions versions={versionsQuery.data ?? []} />
      }
    </ContentLayout>
  );
}

function Versions({ versions }: { versions: ReadonlyArray<string> }) {
  const elements = useMemo(() => {
    const elements: Array<React.ReactNode> = [];
    for (const version of versions) {
      elements.push(<VersionExpandable version={version} />);
    }

    return elements;
  }, [versions]);

  return (
    <>
      {...elements}
    </>
  );
}

function VersionExpandable({ version }: { version: string }) {
  const [expandedAndActive, setExpandedAndActive] = useState<[boolean, boolean]>([false, false]);
  function setExpanded(v: boolean) {
    setExpandedAndActive((prev) => [v, prev[1] || v]);
  }

  return (
    <ExpandableSection headerText={version} variant={'stacked'} expanded={expandedAndActive[0]} onChange={(e) => setExpanded(e.detail.expanded)}>
      <Version version={version} active={expandedAndActive[1]} />
    </ExpandableSection>
  );
}

interface VersionTableItem {
  flightNumber: [Airline, FlightNumber];
  departureDateLocal: string;
  departureAirport: Airport;
  isRemoved: boolean;
}

function Version({ version, active }: { version: string, active: boolean }) {
  const versionQuery = useUpdatesForVersion(version, active);
  const rawItems = useMemo(() => {
    const data = versionQuery.data;
    const items: Array<VersionTableItem> = [];

    if (data) {
      for (const item of data.updates) {
        items.push({
          flightNumber: [data.airlines[item.flightNumber.airlineId], item.flightNumber],
          departureDateLocal: item.departureDateLocal,
          departureAirport: data.airports[item.departureAirportId],
          isRemoved: item.isRemoved,
        });
      }
    }

    return items;
  }, [versionQuery.data]);

  const { items, collectionProps, paginationProps } = useCollection(rawItems, {
    sorting: {
      defaultState: {
        isDescending: false,
        sortingColumn: {
          sortingField: 'departureDateLocal',
        },
      },
    },
    pagination: { pageSize: 25 },
  });

  return (
    <Table
      {...collectionProps}
      variant={'embedded'}
      loading={versionQuery.isLoading}
      header={<Header counter={`(${rawItems.length})`}>Updates</Header>}
      pagination={<Pagination {...paginationProps}  />}
      items={items}
      columnDefinitions={[
        {
          id: 'flight_number',
          header: 'Flight Number',
          cell: useCallback((v: VersionTableItem) => {
            const airportRef = v.departureAirport.iataCode;
            const flightNumber = flightNumberToString(v.flightNumber[1], v.flightNumber[0]);
            const historyLink = `/flight/${encodeURIComponent(flightNumber)}/versions/${encodeURIComponent(airportRef)}/${encodeURIComponent(v.departureDateLocal)}`;

            return <RouterLink to={historyLink} target={'_blank'} rel={'nofollow'}>{flightNumber}</RouterLink>;
          }, []),
          sortingComparator: useCallback((a: VersionTableItem, b: VersionTableItem) => compareFlightNumbers(a.flightNumber, b.flightNumber), []),
        },
        {
          id: 'departure_date_local',
          header: 'Departure Date (Local)',
          cell: useCallback((v: VersionTableItem) => v.departureDateLocal, []),
          sortingField: 'departureDateLocal',
        },
        {
          id: 'departure_airport',
          header: 'Departure Airport',
          cell: useCallback((v: VersionTableItem) => v.departureAirport.iataCode, []),
          sortingComparator: useCallback((a: VersionTableItem, b: VersionTableItem) => a.departureAirport.iataCode.localeCompare(b.departureAirport.iataCode), []),
        },
        {
          id: 'is_removed',
          header: 'Update Kind',
          cell: useCallback((v: VersionTableItem) => {
            return v.isRemoved
              ? (
                <Popover content={'This flight was no longer present in the Lufthansa API. This usually means that the flight has been cancelled.'}>
                  <StatusIndicator type={'warning'}>CANCELLED</StatusIndicator>
                </Popover>
              )
              : <StatusIndicator type={'info'}>UPDATED</StatusIndicator>
          }, []),
          sortingField: 'isRemoved',
        },
      ]}
    />
  );
}

function compareFlightNumbers(v1: [Airline, FlightNumber], v2: [Airline, FlightNumber]) {
  return compareFlightNumbersPlain(v1[1], v2[1]);
}

function compareFlightNumbersPlain(v1: FlightNumber, v2: FlightNumber) {
  let cmpResult = v1.airlineId.localeCompare(v2.airlineId);
  if (cmpResult != 0) {
    return cmpResult;
  }

  cmpResult = v1.number - v2.number;
  if (cmpResult != 0) {
    return cmpResult;
  }

  return (v1.suffix ?? '').localeCompare(v2.suffix ?? '');
}