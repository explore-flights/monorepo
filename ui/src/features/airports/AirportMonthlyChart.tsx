import type { AirportSummary } from '@/api/types';
import { barY, defineChart, group } from '@tanstack/charts';
import { Chart } from '@tanstack/charts/react';
import { scaleBand } from '@tanstack/charts/scales/band';
import { scaleLinear } from '@tanstack/charts/scales/linear';
import { tooltip } from '@tanstack/charts/tooltip';
import { useMemo } from 'react';
import { monthlyActivity } from './airportData';
import styles from './AirportMonthlyChart.module.css';

const monthFormatter = new Intl.DateTimeFormat(undefined, { month: 'short', timeZone: 'UTC' });
const countFormatter = new Intl.NumberFormat(undefined, { notation: 'compact' });

export function AirportMonthlyChart({ summary }: { summary: AirportSummary }) {
  const activity = useMemo(() => monthlyActivity(summary), [summary]);
  const definition = useMemo(() => {
    const rows = activity.flatMap((month) => {
      const label = monthFormatter.format(new Date(Date.UTC(2020, month.month, 1)));

      return [
        { month: label, movement: 'Departures', flights: month.departures },
        { month: label, movement: 'Arrivals', flights: month.arrivals },
      ];
    });

    return defineChart({
      marks: [
        barY(rows, {
          x: 'month',
          y: 'flights',
          z: 'movement',
          color: 'movement',
          layout: group({ padding: 0.16 }),
          inset: 1,
          maxThickness: 14,
          radius: 2,
        }),
      ],
      x: {
        scale: () =>
          scaleBand<string>()
            .domain(rows.filter((row) => row.movement === 'Departures').map((row) => row.month))
            .padding(0.16),
      },
      y: {
        scale: scaleLinear,
        nice: true,
        grid: true,
        axis: { ticks: { count: 4, format: (value) => countFormatter.format(value) } },
      },
      color: {
        domain: ['Departures', 'Arrivals'],
        range: ['var(--primary)', 'var(--green)'],
      },
      focus: 'group-x',
      maxFocusDistance: Number.POSITIVE_INFINITY,
      svgAnimation: true,
      tooltip,
    });
  }, [activity]);

  return (
    <div className={styles.chart}>
      <div className={styles.legend} aria-hidden='true'>
        <span>
          <i className={styles.departure} /> Departures
        </span>
        <span>
          <i className={styles.arrival} /> Arrivals
        </span>
      </div>
      <Chart
        definition={definition}
        height={190}
        className={styles.plot}
        ariaLabel='Monthly departures and arrivals'
        ariaDescription='Grouped bars compare scheduled departures and arrivals for each month.'
      />
    </div>
  );
}
