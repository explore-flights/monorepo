import { LineChartProps, BarChartProps, PieChartProps } from '@cloudscape-design/components';

type Primitive = string | number | boolean | bigint | symbol;
type IsEqual<A, B> =
  (<T>() => T extends A ? 1 : 2) extends
    (<T>() => T extends B ? 1 : 2)
    ? true
    : false;

export type ChartDataTypes = number | string | Date;

// region LineChart
export type LineSeries<T extends ChartDataTypes> = LineChartProps<T>['series'][number];
export type LineDataSeries<T extends ChartDataTypes> = Exclude<LineSeries<T>, { type: 'threshold' }>;
export type LineThresholdSeries<T extends ChartDataTypes> = Exclude<LineSeries<T>, { type: 'line' }>;
export type LineSeriesDatum<T extends ChartDataTypes> = LineDataSeries<T>['data'][number];
// endregion

// region BarChart
export type BarSeries<T extends ChartDataTypes> = BarChartProps<T>['series'][number];
export type BarDataSeries<T extends ChartDataTypes> = Exclude<BarSeries<T>, { type: 'threshold' }>;
export type BarThresholdSeries<T extends ChartDataTypes> = Exclude<BarSeries<T>, { type: 'line' }>;
export type BarSeriesDatum<T extends ChartDataTypes> = BarDataSeries<T>['data'][number];
// endregion

type MutableLineDataSeries<T extends ChartDataTypes> = { type: LineDataSeries<T>['type'], data: Array<LineSeriesDatum<T>> };
type RemainingLineDataSeries<T extends ChartDataTypes> = Omit<LineDataSeries<T>, keyof MutableLineDataSeries<T>>;
export class LineSeriesBuilder<ID extends Primitive, T extends ChartDataTypes, D = ID> {

  private readonly idFn: (d: D) => ID;
  private readonly dataAndSeriesById: Map<ID, [D, MutableLineDataSeries<T>]>;
  private readonly uniqueXValues: Array<T>;
  private xDomain: [T, T] | null;
  private yDomain: [number, number] | null;

  constructor(xValues?: ReadonlyArray<T>, ...idFn: IsEqual<ID, D> extends true ? [] : [(d: D) => ID]) {
    this.dataAndSeriesById = new Map();
    this.uniqueXValues = [];

    if (xValues) {
      this.uniqueXValues.push(...xValues);
    }

    if (idFn.length > 0) {
      this.idFn = idFn[0]!;
    } else {
      // @ts-ignore
      this.idFn = (v) => v;
    }

    this.xDomain = null;
    this.yDomain = null;
  }

  public add(data: D, x: T, y: number) {
    const id = this.idFn(data);

    let [_, series] = this.dataAndSeriesById.get(id) ?? [undefined, undefined];
    if (!series) {
      series = {
        type: 'line',
        data: [],
      } satisfies MutableLineDataSeries<T>;
      this.dataAndSeriesById.set(id, [data, series]);
    }

    if (series.type !== 'line') {
      throw new Error(`series with id ${id.toString()} is not a line series`);
    }

    const existingIdx = series.data.findIndex((v) => equals(v.x, x));
    if (existingIdx !== -1) {
      y += series.data[existingIdx].y;
      series.data[existingIdx].y = y;
    } else {
      series.data.push({ x, y } as LineSeriesDatum<T>);

      if (this.uniqueXValues.findIndex((v) => equals(v, x)) === -1) {
        this.uniqueXValues.push(x);
      }
    }

    if (this.xDomain) {
      const sorted = [this.xDomain[0], this.xDomain[1], x].toSorted(compare<T>);
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

  public series(finalizer: (data: D) => RemainingLineDataSeries<T>, fillMissingX?: boolean, sortX?: boolean): [ReadonlyArray<LineSeries<T>>, [T, T] | undefined, [number, number] | undefined] {
    let uniqueXValues = this.uniqueXValues;
    if (sortX) {
      uniqueXValues = uniqueXValues.toSorted(compare<T>);
    }

    const series = Array.from(this.dataAndSeriesById.values()).map(([d, series]) => {
      let data: Array<LineSeriesDatum<T>>;
      if (fillMissingX) {
        data = [];

        const remaining = [...series.data];
        for (const x of uniqueXValues) {
          const idx = remaining.findIndex((v) => equals(v.x, x));
          if (idx === -1) {
            data.push({ x: x, y: 0 } as LineSeriesDatum<T>);
          } else {
            data.push(remaining.splice(idx, 1)[0]);
          }
        }
      } else {
        data = [...series.data];
      }

      return {
        ...series,
        data: data as ReadonlyArray<LineSeriesDatum<T>>,
        ...finalizer(d),
      } as LineSeries<T>;
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
      // @ts-ignore
      this.idFn = (v) => v;
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