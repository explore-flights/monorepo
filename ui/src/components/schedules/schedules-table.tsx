import React, { useMemo, useState } from 'react';
import {
  Box, Calendar, DateInput, FormField,
  Header,
  Pagination,
  PropertyFilter,
  PropertyFilterProps,
  Table,
  TableProps
} from '@cloudscape-design/components';
import {
  Aircraft, Airline,
  Airport,
  FlightNumberAndScheduleItems, FlightScheduleItem,
  FlightScheduleVariant,
  QuerySchedulesResponseV2
} from '../../lib/api/api.model';
import {
  PropertyFilterOperator,
  PropertyFilterOperatorExtended,
  useCollection
} from '@cloudscape-design/collection-hooks';
import { FlightLink } from '../common/flight-link';
import { AircraftConfigurationVersionText, AircraftText, AirportInlineText } from '../common/text';
import { flightNumberToString } from '../../lib/util/flight';
import { DateTime, FixedOffsetZone } from 'luxon';

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
  readonly departureTime: DateTime<true>;
}

export type ScheduleTableItem = ScheduleTableParentItem | ScheduleTableChildItem;

export interface SchedulesTableProps extends Omit<TableProps<ScheduleTableItem>, 'items' | 'columnDefinitions'> {
  title: string;
  result?: QuerySchedulesResponseV2;
  flightLinkQuery?: (item: ScheduleTableItem) => URLSearchParams;
  columnDefinitions?: ReadonlyArray<TableProps.ColumnDefinition<ScheduleTableItem>>;
}

export function SchedulesTable({ title, result, flightLinkQuery, columnDefinitions: providedColumnDefinitions, ...tableProps }: SchedulesTableProps) {
  const [filterQuery, setFilterQuery] = useState<PropertyFilterProps.Query>({
    operation: 'and',
    tokens: [
      {
        propertyKey: 'departure_time',
        value: DateTime.now().toFormat('yyyy-MM-dd'),
        operator: '>=',
      },
    ],
  });

  const transformedItems = useMemo(
    () => result ? transformSchedules(result, filterQuery) : [],
    [result, filterQuery],
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
      header={<Header counter={`(${transformedItems.length})`}>{title}</Header>}
      pagination={<Pagination {...paginationProps}  />}
      filter={<SchedulesTableFilter query={filterQuery} setQuery={setFilterQuery} />}
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

function SchedulesTableFilter({ query, setQuery }: { query: PropertyFilterProps.Query, setQuery: (query: PropertyFilterProps.Query) => void }) {
  function buildDateOperator(op: PropertyFilterOperator): PropertyFilterOperatorExtended<string> {
    return {
      operator: op,
      form: ({ value, onChange }) => (
        <div className={'date-form'}>
          <FormField>
            <DateInput
              value={value ?? ''}
              onChange={(event) => onChange(event.detail.value)}
              placeholder={'YYYY-MM-DD'}
            />
          </FormField>
          <Calendar value={value ?? ''} onChange={(event) => onChange(event.detail.value)} />
        </div>
      ),
      format: (v) => v,
    } satisfies PropertyFilterOperatorExtended<string>;
  }

  return (
    <PropertyFilter
      query={query}
      onChange={(e) => setQuery(e.detail)}
      filteringProperties={[
        {
          key: 'departure_time',
          operators: ['=', '>=', '>', '<=', '<'].map((op) => buildDateOperator(op)),
          propertyLabel: 'Departure Time',
          groupValuesLabel: 'Departure Time values',
        },
      ]}
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
      cell: (v) => <AirportInlineText airport={v.departureAirport} />,
      sortingComparator: (a, b) => a.departureAirport.id.localeCompare(b.departureAirport.id),
    },
    {
      id: 'arrival_airport',
      header: 'Arrival Airport',
      cell: (v) => <AirportInlineText airport={v.arrivalAirport} />,
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

function transformSchedules(result: QuerySchedulesResponseV2, filterQuery: PropertyFilterProps.Query): ReadonlyArray<ScheduleTableItem> {
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
      const departureZone = FixedOffsetZone.instance(variant.departureUtcOffsetSeconds / 60);
      const departureTime = DateTime.fromISO(`${item.departureDateLocal}T${variant.departureTimeLocal}.000`).setZone(departureZone, { keepLocalTime: true });
      const airline = result.airlines[schedule.flightNumber.airlineId];
      const departureAirport = result.airports[item.departureAirportId];
      const arrivalAirport = result.airports[variant.arrivalAirportId];
      const aircraft = result.aircraft[variant.aircraftId];
      const parentIdentifier = `${departureAirport.id}-${arrivalAirport.id}`;

      if (!departureTime.isValid) {
        continue;
      }

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
        departureTime: departureTime,
      });
    }
  }

  return evaluateFilterQuery(items, filterQuery);
}

function evaluateFilterQuery(items: ReadonlyArray<ScheduleTableItem>, query: PropertyFilterProps.Query): ReadonlyArray<ScheduleTableItem> {
  interface MutableParent extends ScheduleTableParentItem {
    children: Array<ScheduleTableChildItem>;
  }

  if (query.tokens.length < 1) {
    return items;
  }

  return items.flatMap((v) => {
    const result: Array<ScheduleTableItem> = [];

    if (v.type === 'parent') {
      const filteredParent: MutableParent = {
        type: 'parent',
        departureAirport: v.departureAirport,
        arrivalAirport: v.arrivalAirport,
        operatingRange: ['', '', 0],
        children: [],
        airline: v.airline,
        schedule: v.schedule,
      };

      for (const child of v.children) {
        if (evaluateFilter(child, query)) {
          filteredParent.children.push(child);
          expandOperatingRange(filteredParent.operatingRange, child.operatingRange);
        }
      }

      if (filteredParent.children.length > 0) {
        result.push(filteredParent);
      }
    } else if (evaluateFilter(v, query)) {
      result.push(v);
    }

    return result;
  });
}

function evaluateFilter(item: ScheduleTableChildItem, query: PropertyFilterProps.Query): boolean {
  if (query.tokens.length < 1) {
    return true;
  }

  for (const token of query.tokens) {
    const result = evaluateToken(item, token);
    if (query.operation === 'and' && !result) {
      return false;
    } else if (query.operation === 'or' && result) {
      return true;
    }
  }

  return query.operation === 'and';
}

function evaluateToken(item: ScheduleTableChildItem, token: PropertyFilterProps.Token): boolean {
  if (!token.propertyKey) {
    return false;
  }

  if (Array.isArray(token.value)) {
    const values = token.value as Array<string>;
    const ifMatch = token.operator === '=';

    for (const value of values) {
      if (evaluateTokenSingle(item, token.propertyKey, '=', value)) {
        return ifMatch;
      }
    }

    return !ifMatch;
  } else {
    return evaluateTokenSingle(item, token.propertyKey, token.operator, `${token.value}`);
  }
}

function evaluateTokenSingle(item: ScheduleTableChildItem, propertyKey: string, operator: string, filterValue: string) {
  let cmpResult = 0;

  switch (propertyKey) {
    case 'departure_time':
      cmpResult = item.departureTime.toFormat('yyyy-MM-dd').localeCompare(filterValue);
      break;
  }

  if (Number.isNaN(cmpResult)) {
    return operator !== '!=';
  }

  switch (operator) {
    case '<':
      return cmpResult < 0;

    case '<=':
      return cmpResult <= 0;

    case '=':
      return cmpResult === 0;

    case '>':
      return cmpResult > 0;

    case '>=':
      return cmpResult >= 0;

    case '!=':
      return cmpResult !== 0;
  }

  return false;
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