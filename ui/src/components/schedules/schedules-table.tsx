import React, { useMemo, useState } from 'react';
import { Box, Header, Pagination, Table, TableProps } from '@cloudscape-design/components';
import {
  Aircraft, Airline,
  Airport,
  FlightNumberAndScheduleItems, FlightScheduleItem,
  FlightScheduleVariant,
  QuerySchedulesResponseV2
} from '../../lib/api/api.model';
import { useCollection } from '@cloudscape-design/collection-hooks';
import { FlightLink } from '../common/flight-link';
import { AircraftConfigurationVersionText, AircraftText, AirportText } from '../common/text';
import { flightNumberToString } from '../../lib/util/flight';

type OperatingRange = [string, string, number];

interface ScheduleTableBaseItem {
  readonly type: 'parent' | 'child';
  readonly departureAirport: Airport;
  readonly arrivalAirport: Airport;
  readonly operatingRange: OperatingRange;
  readonly airline: Airline;
  readonly schedule: FlightNumberAndScheduleItems;
}

export interface ScheduleTableParentItem extends ScheduleTableBaseItem {
  readonly type: 'parent';
  readonly children: ReadonlyArray<ScheduleTableChildItem>;
}

export interface ScheduleTableChildItem extends ScheduleTableBaseItem {
  readonly type: 'child';
  readonly aircraft: Aircraft;
  readonly aircraftConfigurationVersion: string;
  readonly item: FlightScheduleItem;
  readonly variant: FlightScheduleVariant;
}

export type ScheduleTableItem = ScheduleTableParentItem | ScheduleTableChildItem;

export interface SchedulesTableProps extends Omit<TableProps<ScheduleTableItem>, 'items' | 'columnDefinitions'> {
  title: string;
  result?: QuerySchedulesResponseV2;
  flightLinkQuery?: (item: ScheduleTableItem) => URLSearchParams;
  columnDefinitions?: ReadonlyArray<TableProps.ColumnDefinition<ScheduleTableItem>>;
}

export function SchedulesTable({ title, result, flightLinkQuery, columnDefinitions: providedColumnDefinitions, ...tableProps }: SchedulesTableProps) {
  const transformedItems = useMemo(
    () => result ? transformSchedules(result) : [],
    [result],
  );

  const columnDefinitions = useMemo(() => {
    if (providedColumnDefinitions) {
      return providedColumnDefinitions;
    }

    return buildColumnDefinitions(flightLinkQuery);
  }, [flightLinkQuery, providedColumnDefinitions]);

  const { items, collectionProps, paginationProps } = useCollection(transformedItems, {
    sorting: {
      defaultState: {
        isDescending: false,
        sortingColumn: {
          sortingField: 'rangeStart',
        },
      },
    },
    pagination: { pageSize: 25 },
  });

  const [expandedItems, setExpandedItems] = useState<ReadonlyArray<ScheduleTableItem>>([]);

  return (
    <Table
      empty={<Box>No flights found</Box>}
      {...tableProps}
      {...collectionProps}
      filter={<Header counter={`(${transformedItems.length})`}>{title}</Header>}
      pagination={<Pagination {...paginationProps}  />}
      columnDefinitions={columnDefinitions}
      items={items}
      expandableRows={{
        getItemChildren: (item) => {
          if (item.type !== 'parent') {
            return [];
          }

          return item.children;
        },
        isItemExpandable: (item) => item.type === 'parent',
        expandedItems: expandedItems,
        onExpandableItemToggle: (e) => {
          const item = e.detail.item;
          const expand = e.detail.expanded;

          setExpandedItems((prev) => {
            if (expand) {
              return [...prev, item];
            }

            const index = prev.indexOf(item);
            if (index === -1) {
              return prev;
            }

            return prev.toSpliced(index, 1);
          });
        },
      }}
    />
  );
}

function buildColumnDefinitions(flightLinkQuery?: (item: ScheduleTableItem) => URLSearchParams): ReadonlyArray<TableProps.ColumnDefinition<ScheduleTableItem>> {
  return [
    {
      id: 'flight_number',
      header: 'Flight Number',
      cell: (v) => {
        const fn = flightNumberToString(v.schedule.flightNumber, v.airline);
        const query = flightLinkQuery ? flightLinkQuery(v) : undefined

        return <FlightLink flightNumber={fn} query={query} target={'_blank'} />;
      },
      sortingComparator: (a, b) => {
        return compareAll(
          a.schedule.flightNumber.airlineId.localeCompare(b.schedule.flightNumber.airlineId),
          a.schedule.flightNumber.number - b.schedule.flightNumber.number,
          (a.schedule.flightNumber.suffix ?? '').localeCompare(b.schedule.flightNumber.suffix ?? ''),
        );
      },
    },
    {
      id: 'departure_airport',
      header: 'Departure Airport',
      cell: (v) => <AirportText code={v.departureAirport.iataCode} airport={v.departureAirport} />,
      sortingComparator: (a, b) => a.departureAirport.id.localeCompare(b.departureAirport.id),
    },
    {
      id: 'arrival_airport',
      header: 'Arrival Airport',
      cell: (v) => <AirportText code={v.arrivalAirport.iataCode} airport={v.arrivalAirport} />,
      sortingComparator: (a, b) => a.arrivalAirport.id.localeCompare(b.arrivalAirport.id),
    },
    {
      id: 'operating_start',
      header: 'Operating Start',
      cell: (v) => v.operatingRange[0],
      sortingComparator: (a, b) => a.operatingRange[0].localeCompare(b.operatingRange[0]),
    },
    {
      id: 'operating_end',
      header: 'Operating End',
      cell: (v) => v.operatingRange[1],
      sortingComparator: (a, b) => a.operatingRange[1].localeCompare(b.operatingRange[1]),
    },
    {
      id: 'operating_days',
      header: 'Operating Days',
      cell: (v) => v.operatingRange[2],
      sortingComparator: (a, b) => a.operatingRange[2] - b.operatingRange[2],
    },
    {
      id: 'aircraft',
      header: 'Aircraft',
      cell: (v) => {
        if (v.type !== 'child') {
          return <></>;
        }

        return <AircraftText code={v.aircraft.icaoCode ?? v.aircraft.iataCode ?? v.aircraft.id} aircraft={v.aircraft} />;
      },
      sortingComparator: (a, b) => {
        const aircraftA = a.type === 'child' ? a.aircraft.id : '';
        const aircraftB = b.type === 'child' ? b.aircraft.id : '';

        return aircraftA.localeCompare(aircraftB);
      },
    },
    {
      id: 'aircraft_configuration_version',
      header: 'Aircraft Configuration Version',
      cell: (v) => {
        if (v.type !== 'child') {
          return <></>;
        }

        return <AircraftConfigurationVersionText value={v.aircraftConfigurationVersion} />;
      },
      sortingComparator: (a, b) => {
        const aircraftA = a.type === 'child' ? a.aircraft.id : '';
        const aircraftB = b.type === 'child' ? b.aircraft.id : '';

        return aircraftA.localeCompare(aircraftB);
      },
    },
  ];
}

function transformSchedules(result: QuerySchedulesResponseV2): ReadonlyArray<ScheduleTableItem> {
  const items: Array<ScheduleTableParentItem> = [];

  for (const schedule of result.schedules) {
    interface MutableParent extends ScheduleTableParentItem {
      children: Array<ScheduleTableChildItem>;
    }

    const parents = new Map<string, MutableParent>();

    for (const item of schedule.items) {
      if (!item.flightVariantId) {
        continue;
      }

      const variant = result.variants[item.flightVariantId];
      const airline = result.airlines[schedule.flightNumber.airlineId];
      const departureAirport = result.airports[item.departureAirportId];
      const arrivalAirport = result.airports[variant.arrivalAirportId];
      const aircraft = result.aircraft[variant.aircraftId];
      const parentIdentifier = `${departureAirport.id}-${arrivalAirport.id}`;

      let parent = parents.get(parentIdentifier);
      if (!parent) {
        parent = {
          type: 'parent',
          departureAirport: departureAirport,
          arrivalAirport: arrivalAirport,
          operatingRange: ['', '', 0],
          children: [],
          airline: airline,
          schedule: schedule,
        };

        parents.set(parentIdentifier, parent);
        items.push(parent);
      }

      const operatingRange = buildOperatingRange(item.departureDateLocal);
      expandOperatingRange(parent.operatingRange, operatingRange);

      parent.children.push({
        type: 'child',
        departureAirport: departureAirport,
        arrivalAirport: arrivalAirport,
        operatingRange: operatingRange,
        aircraft: aircraft,
        aircraftConfigurationVersion: variant.aircraftConfigurationVersion,
        airline: airline,
        schedule: schedule,
        item: item,
        variant: variant,
      });
    }
  }

  return items;
}

function buildOperatingRange(date: string): OperatingRange {
  return [date, date, 1];
}

function expandOperatingRange(acc: OperatingRange, other: OperatingRange) {
  if (acc[0] === '' || acc[0] > other[0]) {
    acc[0] = other[0];
  }

  if (acc[1] === '' || acc[1] < other[1]) {
    acc[1] = other[1];
  }

  acc[2] += other[2];
}

function compareAll(...values: Array<number>): number {
  for (const value of values) {
    if (value !== 0) {
      return value;
    }
  }

  return 0;
}