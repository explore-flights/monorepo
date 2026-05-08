import { LineChartProps, BarChartProps, PieChartProps, AreaChartProps } from '@cloudscape-design/components';
import { DateTime, WeekdayNumbers } from 'luxon';

type Primitive = string | number | boolean | bigint | symbol;
type IsEqual<A, B> =
  (<T>() => T extends A ? 1 : 2) extends
    (<T>() => T extends B ? 1 : 2)
    ? true
    : false;

export type ChartDataTypes = number | string | Date;

export type LineSeries<T extends ChartDataTypes> = LineChartProps<T>['series'][number];
export type AreaSeries<T extends ChartDataTypes> = AreaChartProps<T>['series'][number];
export type BarSeries<T extends ChartDataTypes> = BarChartProps<T>['series'][number];

export type Series<T extends ChartDataTypes> = LineSeries<T> | AreaSeries<T> | BarSeries<T>;
type SeriesType<S> = S extends { type: infer U } ? U : never;
type DataSeries<S extends Series<T>, T extends ChartDataTypes> = Exclude<S, { type: 'threshold' }>;
type SeriesDatum<S extends Series<T>, T extends ChartDataTypes> = DataSeries<S, T>['data'][number];
type DataType<S extends Series<T>, T extends ChartDataTypes> = SeriesDatum<S, T>['x'];

type MutableSeriesDataArray<S extends Series<T>, T extends ChartDataTypes> = Array<SeriesDatum<S, T>>;
type MutableDataSeries<S extends Series<T>, T extends ChartDataTypes> = { readonly type: SeriesType<S>, readonly data: MutableSeriesDataArray<S, T> };

type RemainingDataSeries<S extends Series<T>, T extends ChartDataTypes> = Omit<DataSeries<S, T>, keyof MutableDataSeries<S, T>>;

export interface DateThresholdSeries {
  type: 'threshold';
  title: string;
  x: Date;
  color?: string;
}

export type Domain<T> = [T, T];

export class SeriesBuilder<ID extends Primitive, S extends Series<T>, D = ID, T extends ChartDataTypes = ChartDataTypes> {

  private readonly type: SeriesType<S>;
  private readonly idFn: (d: D) => ID;
  private readonly finalizer: (data: D, xDomain: Domain<DataType<S, T>>, yDomain: Domain<number>) => RemainingDataSeries<S, T>;
  private readonly dataAndSeriesById: Map<ID, [D, MutableDataSeries<S, T>, Domain<DataType<S, T>>, Domain<number>]>;
  private readonly uniqueXValues: Array<DataType<S, T>>;
  private globalXDomain: Domain<DataType<S, T>> | null;
  private globalYDomain: [number, number] | null;

  constructor(type: SeriesType<S>,
              finalizer: (data: D, xDomain: Domain<DataType<S, T>>, yDomain: Domain<number>) => RemainingDataSeries<S, T>,
              ...idFn: IsEqual<ID, D> extends true ? [] : [(d: D) => ID]) {

    this.type = type;
    this.finalizer = finalizer;
    this.dataAndSeriesById = new Map();
    this.uniqueXValues = [];

    if (idFn.length > 0) {
      this.idFn = idFn[0]!;
    } else {
      this.idFn = (v) => v as unknown as ID;
    }

    this.globalXDomain = null;
    this.globalYDomain = null;
  }

  public add(data: D, x: DataType<S, T>, y: number) {
    const id = this.idFn(data);

    let series: MutableDataSeries<S, T>;
    let xDomain: Domain<DataType<S, T>>;
    let yDomain: Domain<number>;
    {
      let values = this.dataAndSeriesById.get(id);
      if (!values) {
        values = [
          data,
          {
            type: this.type,
            data: [],
          },
          [x, x],
          [y, y]
        ];

        this.dataAndSeriesById.set(id, values);
      }

      [, series, xDomain, yDomain] = values;
    }

    if (series.type !== this.type) {
      throw new Error(`series with id ${id.toString()} is not a ${this.type} series`);
    }

    const existingIdx = series.data.findIndex((v) => equals(v.x, x));
    if (existingIdx !== -1) {
      y += series.data[existingIdx].y;
      series.data[existingIdx].y = y;
    } else {
      series.data.push({ x, y } as SeriesDatum<S, T>);

      if (this.uniqueXValues.findIndex((v) => equals(v, x)) === -1) {
        this.uniqueXValues.push(x);
      }
    }

    {
      const sorted = [xDomain[0], xDomain[1], x].toSorted(compare<DataType<S, T>>);
      xDomain[0] = sorted[0];
      xDomain[1] = sorted[2];
    }

    {
      const sorted = [yDomain[0], yDomain[1], y].toSorted(compare<number>);
      yDomain[0] = sorted[0];
      yDomain[1] = sorted[2];
    }

    if (this.globalXDomain) {
      const sorted = [this.globalXDomain[0], this.globalXDomain[1], x].toSorted(compare<DataType<S, T>>);
      this.globalXDomain = [sorted[0], sorted[2]];
    } else {
      this.globalXDomain = [x, x];
    }

    if (this.globalYDomain) {
      const sorted = [this.globalYDomain[0], this.globalYDomain[1], y].toSorted(compare<number>);
      this.globalYDomain = [sorted[0], sorted[2]];
    } else {
      this.globalYDomain = [y, y];
    }
  }

  public series(fillMissingX?: boolean, sortX?: boolean): [ReadonlyArray<S>, Domain<DataType<S, T>> | undefined, Domain<number> | undefined] {
    let uniqueXValues = this.uniqueXValues;
    if (sortX) {
      uniqueXValues = uniqueXValues.toSorted(compare<DataType<S, T>>);
    }

    const series = Array.from(this.dataAndSeriesById.values()).map(([d, series, xDomain, yDomain]) => {
      let data: MutableSeriesDataArray<S, T>;
      
      if (fillMissingX) {
        const remaining = [...series.data];
        data = [];
        
        for (const x of uniqueXValues) {
          const idx = remaining.findIndex((v) => equals(v.x, x));
          if (idx === -1) {
            data.push({ x, y: 0 } as SeriesDatum<S, T>);
          } else {
            data.push(remaining.splice(idx, 1)[0]);
          }
        }
      } else if (sortX) {
        data = series.data.toSorted((a, b) => compare(a.x, b.x));
      } else {
        data = [...series.data];
      }

      return {
        ...series,
        data: data,
        ...this.finalizer(d, xDomain, yDomain),
      } as unknown as S;
    });

    return [series, this.globalXDomain ?? undefined, this.globalYDomain ?? undefined];
  }
}

export function nextScheduleChange(dt: DateTime): [DateTime, number, boolean, string] {
  dt = dt.toUTC();

  if (isSummerSchedule(dt)) {
    const lastSundayOfOct = lastWeekdayOfMonth(dt, 10, 7).startOf('day');
    return [
      lastSundayOfOct,
      lastSundayOfOct.year,
      false,
      `Winter ${lastSundayOfOct.year}/${lastSundayOfOct.year+1}`,
    ];
  } else {
    if (dt.month >= 10) {
      dt = dt.set({ year: dt.year + 1 });
    }

    const lastSundayOfMar = lastWeekdayOfMonth(dt, 3, 7).startOf('day');
    return [
      lastSundayOfMar,
      lastSundayOfMar.year,
      true,
      `Summer ${lastSundayOfMar.year}`,
    ];
  }
}

export function isSummerSchedule(dt: DateTime): boolean {
  dt = dt.toUTC();

  const summerScheduleStart = lastWeekdayOfMonth(dt, 3, 7).startOf('day').toMillis();
  const winterScheduleStart = lastWeekdayOfMonth(dt, 10, 7).startOf('day').toMillis();
  const millis = dt.toMillis();

  return millis >= summerScheduleStart && millis < winterScheduleStart;
}

export function lastWeekdayOfMonth(dt: DateTime, month: number, weekday: WeekdayNumbers): DateTime {
  dt = dt.set({ month: month }).endOf('month');
  if (dt.weekday === weekday) {
    return dt;
  }

  return dt.minus({ day: ((dt.weekday - weekday + 7) % 7) });
}

export function generateThresholds(xDomain?: [Date, Date]): ReadonlyArray<DateThresholdSeries> {
  const today = DateTime.now().toUTC().startOf('day');
  const series: Array<DateThresholdSeries> = [
    {
      type: 'threshold',
      title: 'Today',
      x: today.toJSDate(),
      color: '#00FF00',
    }
  ];

  if (!xDomain || xDomain[0].getTime() === xDomain[1].getTime()) {
    return series;
  } else if (xDomain[0].getTime() > xDomain[1].getTime()) {
    throw new Error('xDomain[0] must be before xDomain[1]');
  }

  let [nextScheduleChangeDT, _, isSummer, nextScheduleChangeName] = nextScheduleChange(DateTime.fromJSDate(xDomain[0]));
  while (nextScheduleChangeDT.toMillis() < xDomain[1].getTime()) {
    series.push({
      type: 'threshold',
      title: nextScheduleChangeName,
      x: nextScheduleChangeDT.toJSDate(),
      color: isSummer ? '#FFFF00' : '#00FFFF',
    });

    [nextScheduleChangeDT, _, isSummer, nextScheduleChangeName] = nextScheduleChange(nextScheduleChangeDT);
  }

  return series;
}

type RemainingPieChartDatum = Omit<PieChartProps.Datum, 'value'>;
export class PieChartDataBuilder<ID extends Primitive, D = ID> {

  private readonly idFn: (d: D) => ID;
  private readonly dataAndValueById: Map<ID, [D, number]>;

  constructor(values?: ReadonlyArray<D>, ...idFn: IsEqual<ID, D> extends true ? [] : [(d: D) => ID]) {
    if (idFn.length > 0) {
      this.idFn = idFn[0]!;
    } else {
      this.idFn = (v) => v as unknown as ID;
    }

    this.dataAndValueById = new Map();

    if (values) {
      for (const value of values) {
        this.dataAndValueById.set(this.idFn(value), [value, 0]);
      }
    }
  }

  public add(data: D, v: number) {
    const id = this.idFn(data);
    let dataAndValue = this.dataAndValueById.get(id);
    if (!dataAndValue) {
      dataAndValue = [data, v];
      this.dataAndValueById.set(id, dataAndValue);
    } else {
      dataAndValue[1] += v;
    }
  }

  public data(finalizer: (data: D) => RemainingPieChartDatum): ReadonlyArray<PieChartProps.Datum> {
    return Array.from(this.dataAndValueById.values()).map(([d, value]) => ({
      value: value,
      ...finalizer(d),
    }));
  }
}

function compare<T extends ChartDataTypes>(a: T, b: T): number {
  if (a === b) {
    return 0;
  } else if (typeof a === 'number' && typeof b === 'number') {
    return a - b;
  } else if (a instanceof Date && b instanceof Date) {
    return a.getTime() - b.getTime();
  }

  return a.toString().localeCompare(b.toString());
}

function equals<T extends ChartDataTypes>(a: T, b: T): boolean {
  return compare<T>(a, b) === 0;
}
