import { LineChartProps, BarChartProps, PieChartProps, AreaChartProps } from '@cloudscape-design/components';

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
export type ThresholdSeries<S extends Series<ChartDataTypes>> = Extract<S, { type: 'threshold' }>;
type SeriesDatum<S extends Series<T>, T extends ChartDataTypes> = DataSeries<S, T>['data'][number];
type DataType<S extends Series<T>, T extends ChartDataTypes> = SeriesDatum<S, T>['x'];

type MutableSeriesDataArray<S extends Series<T>, T extends ChartDataTypes> = Array<SeriesDatum<S, T>>;
type MutableDataSeries<S extends Series<T>, T extends ChartDataTypes> = { readonly type: SeriesType<S>, readonly data: MutableSeriesDataArray<S, T> };

type RemainingDataSeries<S extends Series<T>, T extends ChartDataTypes> = Omit<DataSeries<S, T>, keyof MutableDataSeries<S, T>>;

export class SeriesBuilder<ID extends Primitive, S extends Series<T>, D = ID, T extends ChartDataTypes = ChartDataTypes> {

  private readonly type: SeriesType<S>;
  private readonly idFn: (d: D) => ID;
  private readonly dataAndSeriesById: Map<ID, [D, MutableDataSeries<S, T>]>;
  private readonly uniqueXValues: Array<DataType<S, T>>;
  private xDomain: [DataType<S, T>, DataType<S, T>] | null;
  private yDomain: [number, number] | null;

  constructor(type: SeriesType<S>, xValues?: ReadonlyArray<DataType<S, T>>, ...idFn: IsEqual<ID, D> extends true ? [] : [(d: D) => ID]) {
    this.type = type;
    this.dataAndSeriesById = new Map();
    this.uniqueXValues = [];

    if (xValues) {
      this.uniqueXValues.push(...xValues);
    }

    if (idFn.length > 0) {
      this.idFn = idFn[0]!;
    } else {
      this.idFn = (v) => v as unknown as ID;
    }

    this.xDomain = null;
    this.yDomain = null;
  }

  public add(data: D, x: DataType<S, T>, y: number) {
    const id = this.idFn(data);

    let [, series] = this.dataAndSeriesById.get(id) ?? [undefined, undefined];
    if (!series) {
      series = {
        type: this.type,
        data: [],
      };
      this.dataAndSeriesById.set(id, [data, series]);
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

    if (this.xDomain) {
      const sorted = [this.xDomain[0], this.xDomain[1], x].toSorted(compare<DataType<S, T>>);
      this.xDomain = [sorted[0], sorted[2]];
    } else {
      this.xDomain = [x, x];
    }

    if (this.yDomain) {
      const sorted = [this.yDomain[0], this.yDomain[1], y].toSorted(compare<number>);
      this.yDomain = [sorted[0], sorted[2]];
    } else {
      this.yDomain = [y, y];
    }
  }

  public series(finalizer: (data: D) => RemainingDataSeries<S, T>, fillMissingX?: boolean, sortX?: boolean): [ReadonlyArray<S>, [DataType<S, T>, DataType<S, T>] | undefined, [number, number] | undefined] {
    let uniqueXValues = this.uniqueXValues;
    if (sortX) {
      uniqueXValues = uniqueXValues.toSorted(compare<DataType<S, T>>);
    }

    const series = Array.from(this.dataAndSeriesById.values()).map(([d, series]) => {
      const remaining = [...series.data];
      let data: MutableSeriesDataArray<S, T>;
      
      if (fillMissingX) {
        data = [];
        
        for (const x of uniqueXValues) {
          const idx = remaining.findIndex((v) => equals(v.x, x));
          if (idx === -1) {
            data.push({ x, y: 0 } as SeriesDatum<S, T>);
          } else {
            data.push(remaining.splice(idx, 1)[0]);
          }
        }
      } else {
        data = remaining;
      }

      return {
        ...series,
        data: data,
        ...finalizer(d),
      } as unknown as S;
    });

    return [series, this.xDomain ?? undefined, this.yDomain ?? undefined];
  }
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
