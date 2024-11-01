import React, { useMemo } from 'react';
import {
  CabinClass,
  ComponentFeature,
  SeatMap,
  SeatMapCabin,
  SeatMapColumnComponent,
  SeatMapColumnSeat,
  SeatMapDeck,
  SeatMapRow
} from '../../lib/api/api.model';
import {
  Badge,
  BadgeProps,
  Box,
  ColumnLayout,
  Container,
  Header,
  Popover,
  SpaceBetween
} from '@cloudscape-design/components';
import classes from './seatmap.module.scss';

export function SeatMapView({ data }: { data: SeatMap }) {
  return (
    <ColumnLayout columns={1}>
      <CabinClasses cabinClasses={data.cabinClasses} />
      {...data.decks.map((deck, i) => <SeatMapDeckView deck={deck} index={i} />)}
    </ColumnLayout>
  );
}

function CabinClasses({ cabinClasses }: { cabinClasses: ReadonlyArray<CabinClass> }) {
  const order = [CabinClass.ECO, CabinClass.PRECO, CabinClass.BUSINESS, CabinClass.FIRST];
  const sorted = cabinClasses.toSorted((a, b) => order.indexOf(a) - order.indexOf(b));

  return (
    <SpaceBetween size={'xxs'} direction={'horizontal'}>
      {...sorted.map((v) => <CabinClassBadge cabinClass={v}>{v}</CabinClassBadge>)}
    </SpaceBetween>
  );
}

function SeatMapDeckView({ index, deck }: { index: number, deck: SeatMapDeck }) {
  return (
    <Container header={<Header variant={'h3'}>{index === 0 ? 'Main' : 'Upper'}</Header>}>
      {...deck.cabins.map((cabin) => <SeatMapCabinView cabin={cabin} />)}
    </Container>
  );
}

function SeatMapCabinView({ cabin }: { cabin: SeatMapCabin }) {
  return (
    <SpaceBetween size={'xxxs'} direction={'vertical'}>
      {...cabin.rows.map((row) => <SeatMapRowView cabin={cabin} row={row} />)}
    </SpaceBetween>
  );
}

function SeatMapRowView({ cabin, row }: { cabin: SeatMapCabin, row: SeatMapRow }) {
  return (
    <>
      {row.front.length > 0 && <SeatMapRowComponentsView cabin={cabin} components={row.front} />}
      <SeatMapRowSeatsView cabin={cabin} row={row.number} seats={row.seats} />
      {row.rear.length > 0 && <SeatMapRowComponentsView cabin={cabin} components={row.rear} />}
    </>
  );
}

function SeatMapRowSeatsView({ cabin, row, seats }: { cabin: SeatMapCabin, row: number, seats: ReadonlyArray<SeatMapColumnSeat | null> }) {
  const seatsAndAisle = useMemo(() => {
    const nodes: Array<React.ReactNode> = [];

    for (let i = 0; i < seats.length; i++) {
      const seat = seats[i];
      if (seat === null) {
        nodes.push(<div></div>);
      } else {
        nodes.push(<SeatMapSeatView cabin={cabin} row={row} column={i} seat={seat} />);
      }

      if (cabin.aisle.includes(i)) {
        nodes.push(<div></div>);
      }
    }

    return nodes;
  }, [cabin, row, seats]);

  return (
    <EqualSpaceRow children={seatsAndAisle} />
  );
}

function SeatMapSeatView({ cabin, row, column, seat }: { cabin: SeatMapCabin, row: number, column: number, seat: SeatMapColumnSeat }) {
  return (
    <Popover content={seat.features.join(', ')}>
      <CabinClassBadge cabinClass={cabin.cabinClass}>{`${row}${cabin.seatColumns[column]}`}</CabinClassBadge>
    </Popover>
  );
}

function SeatMapRowComponentsView({ cabin, components }: { cabin: SeatMapCabin, components: ReadonlyArray<ReadonlyArray<SeatMapColumnComponent | null>> }) {
  return (
    <>
      {...components.map((v) => <SeatMapRowComponentsSingleView cabin={cabin} components={v} />)}
    </>
  );
}

function SeatMapRowComponentsSingleView({ cabin, components }: { cabin: SeatMapCabin, components: ReadonlyArray<SeatMapColumnComponent | null> }) {
  return (
    <EqualSpaceRow>
      {...components.map((v) => v ? <SeatMapComponentView component={v.features[0]} /> : <div></div>)}
    </EqualSpaceRow>
  );
}

function SeatMapComponentView({ component }: { component: ComponentFeature }) {
  return (
    <Box textAlign={'center'}>{component}</Box>
  )
}

function EqualSpaceRow({ children }: { children: ReadonlyArray<React.ReactNode> }) {
  return (
    <div className={classes['row']}>
      {...children.map((v) => <div className={classes['row-item']}>{v}</div>)}
    </div>
  )
}

function CabinClassBadge({ cabinClass, ...props }: { cabinClass: CabinClass } & BadgeProps) {
  const color = ({
    [CabinClass.ECO]: 'green',
    [CabinClass.PRECO]: 'grey',
    [CabinClass.BUSINESS]: 'blue',
    [CabinClass.FIRST]: 'red',
  } satisfies Record<CabinClass, 'grey' | 'blue' | 'green' | 'red'>)[cabinClass];

  return (
    <Badge {...props} color={color} />
  );
}