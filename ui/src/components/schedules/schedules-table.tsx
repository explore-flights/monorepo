import React, { useMemo, useState } from 'react';
import { Box, Header, Pagination, Table, TableProps } from '@cloudscape-design/components';
import { Aircraft, Airport, Airports, FlightSchedule, FlightScheduleVariant } from '../../lib/api/api.model';
import { useCollection } from '@cloudscape-design/collection-hooks';
import { FlightLink } from '../common/flight-link';
import { DateTime } from 'luxon';
import { useAircraft, useAirports } from '../util/state/data';
import { AircraftConfigurationVersionText, AircraftText, AirportText } from '../common/text';

interface Maybe<T> {
  raw: string;
  value?: T;
}

type OperatingRange = [string, string, number];

interface ScheduleTableBaseItem {
  readonly type: 'parent' | 'child';
  readonly departureAirport: Maybe<Airport>;
  readonly arrivalAirport: Maybe<Airport>;
  readonly operatingRange: OperatingRange;
  readonly schedule: FlightSchedule;
}

export interface ScheduleTableParentItem extends ScheduleTableBaseItem {
  readonly type: 'parent';
  readonly children: ReadonlyArray<ScheduleTableChildItem>;
}

export interface ScheduleTableChildItem extends ScheduleTableBaseItem {
  readonly type: 'child';
  readonly aircraft: Maybe<Aircraft>;
  readonly aircraftConfigurationVersion: string;
  readonly variant: FlightScheduleVariant;
}

export type ScheduleTableItem = ScheduleTableParentItem | ScheduleTableChildItem;

export interface SchedulesTableProps extends Omit<TableProps<ScheduleTableItem>, 'items' | 'columnDefinitions'> {
  title: string;
  items: ReadonlyArray<FlightSchedule>;
  flightLinkQuery?: (item: ScheduleTableItem) => URLSearchParams;
  columnDefinitions?: ReadonlyArray<TableProps.ColumnDefinition<ScheduleTableItem>>;
}

export function SchedulesTable({ title, items: rawItems, flightLinkQuery, columnDefinitions: providedColumnDefinitions, ...tableProps }: SchedulesTableProps) {
  const airportsQuery = useAirports();
  const aircraftQuery = useAircraft();

  const transformedItems = useMemo(
    () => transformSchedules(rawItems, airportsQuery.data, aircraftQuery.data),
    [rawItems, airportsQuery.data, aircraftQuery.data],
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
        const fn = `${v.schedule.airline}${v.schedule.flightNumber}${v.schedule.suffix}`;
        const query = flightLinkQuery ? flightLinkQuery(v) : undefined

        return <FlightLink flightNumber={fn} query={query} target={'_blank'} />;
      },
      sortingComparator: (a, b) => {
        return compareAll(
          a.schedule.airline.localeCompare(b.schedule.airline),
          a.schedule.flightNumber - b.schedule.flightNumber,
          a.schedule.suffix.localeCompare(b.schedule.suffix),
        );
      },
    },
    {
      id: 'departure_airport',
      header: 'Departure Airport',
      cell: (v) => <AirportText code={v.departureAirport.raw} airport={v.departureAirport.value} />,
      sortingComparator: (a, b) => a.departureAirport.raw.localeCompare(b.departureAirport.raw),
    },
    {
      id: 'arrival_airport',
      header: 'Arrival Airport',
      cell: (v) => <AirportText code={v.arrivalAirport.raw} airport={v.arrivalAirport.value} />,
      sortingComparator: (a, b) => a.arrivalAirport.raw.localeCompare(b.arrivalAirport.raw),
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

        return <AircraftText code={v.aircraft.raw} aircraft={v.aircraft.value} />;
      },
      sortingComparator: (a, b) => {
        const aircraftA = a.type === 'child' ? a.aircraft.raw : '';
        const aircraftB = b.type === 'child' ? b.aircraft.raw : '';

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
        const aircraftA = a.type === 'child' ? a.aircraft.raw : '';
        const aircraftB = b.type === 'child' ? b.aircraft.raw : '';

        return aircraftA.localeCompare(aircraftB);
      },
    },
  ];
}

function transformSchedules(schedules: ReadonlyArray<FlightSchedule>, airports: Airports, aircraft: ReadonlyArray<Aircraft>): ReadonlyArray<ScheduleTableItem> {
  const airportLookup = buildAirportLookup(airports);
  const aircraftLookup = buildAircraftLookup(aircraft);

  const items: Array<ScheduleTableParentItem> = [];

  for (const schedule of schedules) {
    interface MutableParent extends ScheduleTableParentItem {
      children: Array<ScheduleTableChildItem>;
    }

    const parents = new Map<string, MutableParent>();

    for (const variant of schedule.variants) {
      const parentIdentifier = `${variant.data.departureAirport}-${variant.data.arrivalAirport}`;
      const departureAirport = { raw: variant.data.departureAirport, value: airportLookup.get(variant.data.departureAirport) };
      const arrivalAirport = { raw: variant.data.arrivalAirport, value: airportLookup.get(variant.data.arrivalAirport) };

      let parent = parents.get(parentIdentifier);
      if (!parent) {
        parent = {
          type: 'parent',
          departureAirport: departureAirport,
          arrivalAirport: arrivalAirport,
          operatingRange: ['', '', 0],
          children: [],
          schedule: schedule,
        };

        parents.set(parentIdentifier, parent);
        items.push(parent);
      }

      for (const range of variant.ranges) {
        const operatingRange = buildOperatingRange(range);
        expandOperatingRange(parent.operatingRange, operatingRange);

        parent.children.push({
          type: 'child',
          departureAirport: departureAirport,
          arrivalAirport: arrivalAirport,
          operatingRange: operatingRange,
          aircraft: { raw: variant.data.aircraftType, value: aircraftLookup.get(variant.data.aircraftType) },
          aircraftConfigurationVersion: variant.data.aircraftConfigurationVersion,
          schedule: schedule,
          variant: variant,
        });
      }
    }
  }

  return items;
}

function buildOperatingRange(range: [string, string]): OperatingRange {
  const start = DateTime.fromISO(range[0]);
  const end = DateTime.fromISO(range[1]);
  const span = end.diff(start, 'days');

  return [range[0], range[1], span.days + 1];
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

function buildAirportLookup(airports: Airports): Map<string, Airport> {
  const lookup = new Map<string, Airport>();

  for (const airport of airports.airports) {
    lookup.set(airport.code, airport);
  }

  for (const metroArea of airports.metropolitanAreas) {
    for (const airport of metroArea.airports) {
      lookup.set(airport.code, airport);
    }
  }

  return lookup;
}

function buildAircraftLookup(aircraft: ReadonlyArray<Aircraft>): Map<string, Aircraft> {
  const lookup = new Map<string, Aircraft>();

  for (const a of aircraft) {
    lookup.set(a.code, a);
  }

  return lookup;
}

function compareAll(...values: Array<number>): number {
  for (const value of values) {
    if (value !== 0) {
      return value;
    }
  }

  return 0;
}