import { useQuery } from '@tanstack/react-query';
import { defineChart, lineY } from '@tanstack/charts';
import { Chart } from '@tanstack/charts/react';
import { scaleLinear } from '@tanstack/charts/scales/linear';
import { scalePoint } from '@tanstack/charts/scales/point';
import { tooltip } from '@tanstack/charts/tooltip';
import { ArrowDown, ArrowUp, Database, RefreshCw, TrendingUp } from 'lucide-react';
import { useMemo } from 'react';
import { api } from '@/api/client';
import type { UpdateReportItem } from '@/api/types';
import { Badge, Card, ErrorState, Loading, PageHeader, Stat } from '@/components/primitives';
import { dateLabel } from '@/lib/format';

export function UpdatesPage() {
  const query = useQuery({ queryKey: ['updates'], queryFn: api.updates });
  const data = query.data ?? [];
  const recent = data.slice(-30);
  const totals = recent.reduce(
    (sum, item) => ({
      added: sum.added + item.added,
      updated: sum.updated + item.updated,
      removed: sum.removed + item.removed,
    }),
    { added: 0, updated: 0, removed: 0 },
  );
  return (
    <div className='page updates-page'>
      <PageHeader
        eyebrow='Data activity'
        title='Schedule updates'
        description='A transparent view of how the underlying schedule dataset changes between imports.'
        actions={
          <Badge tone='green'>
            <RefreshCw size={13} />
            Import history
          </Badge>
        }
      />
      {query.isLoading && <Loading label='Loading update history…' />}
      {query.error && <ErrorState error={query.error} />}{' '}
      {query.data && (
        <>
          <div className='stats-grid'>
            <Stat label='Imports shown' value={recent.length} hint='Latest reports' />
            <Stat
              label='Flights added'
              value={totals.added.toLocaleString()}
              hint='Last 30 imports'
            />
            <Stat
              label='Flights changed'
              value={totals.updated.toLocaleString()}
              hint='Last 30 imports'
            />
            <Stat
              label='Flights removed'
              value={totals.removed.toLocaleString()}
              hint='Last 30 imports'
            />
          </div>
          <Card className='updates-chart-card'>
            <div className='card-heading'>
              <TrendingUp />
              <div>
                <h2>Changes per import</h2>
                <p>Added, updated and removed schedule records</p>
              </div>
              <div className='chart-legend'>
                <span>
                  <i className='legend-add' />
                  Added
                </span>
                <span>
                  <i className='legend-update' />
                  Updated
                </span>
                <span>
                  <i className='legend-remove' />
                  Removed
                </span>
              </div>
            </div>
            <UpdateChart data={recent} />
          </Card>
          <section className='minor-section'>
            <div className='section-heading'>
              <div>
                <span className='eyebrow'>Import log</span>
                <h2>Recent reports</h2>
              </div>
            </div>
            <Card className='table-card'>
              <div className='table-scroll'>
                <table className='data-table updates-table'>
                  <thead>
                    <tr>
                      <th>Imported</th>
                      <th>Added</th>
                      <th>Updated</th>
                      <th>Removed</th>
                      <th>Total changes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...data]
                      .reverse()
                      .slice(0, 100)
                      .map((item) => (
                        <tr key={item.version}>
                          <td>
                            <strong>
                              {dateLabel(item.version, { dateStyle: 'medium', timeStyle: 'short' })}
                            </strong>
                            <small>{item.version}</small>
                          </td>
                          <td>
                            <span className='change-number added'>
                              <ArrowUp size={14} />
                              {item.added.toLocaleString()}
                            </span>
                          </td>
                          <td>
                            <span className='change-number updated'>
                              <RefreshCw size={14} />
                              {item.updated.toLocaleString()}
                            </span>
                          </td>
                          <td>
                            <span className='change-number removed'>
                              <ArrowDown size={14} />
                              {item.removed.toLocaleString()}
                            </span>
                          </td>
                          <td>
                            <strong>
                              {(item.added + item.updated + item.removed).toLocaleString()}
                            </strong>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </Card>
          </section>
        </>
      )}
    </div>
  );
}
function UpdateChart({ data }: { data: UpdateReportItem[] }) {
  const definition = useMemo(() => {
    const rows = data.flatMap((report) => [
      { version: report.version, change: 'Added', records: report.added },
      { version: report.version, change: 'Updated', records: report.updated },
      { version: report.version, change: 'Removed', records: report.removed },
    ]);

    return defineChart({
      marks: [
        lineY(rows, {
          x: 'version',
          y: 'records',
          z: 'change',
          color: 'change',
          key: (row) => `${row.version}-${row.change}`,
          points: true,
          strokeWidth: 2.4,
        }),
      ],
      x: {
        scale: () =>
          scalePoint<string>()
            .domain(data.map((report) => report.version))
            .padding(0.1),
        axis: {
          ticks: {
            count: 5,
            format: (value) => dateLabel(value, { month: 'short', day: 'numeric' }),
          },
        },
      },
      y: {
        scale: scaleLinear,
        nice: true,
        grid: true,
        axis: {
          ticks: {
            count: 5,
            format: (value) =>
              new Intl.NumberFormat(undefined, { notation: 'compact' }).format(value),
          },
        },
      },
      color: {
        domain: ['Added', 'Updated', 'Removed'],
        range: ['var(--green)', 'var(--amber)', 'var(--red)'],
      },
      focus: 'group-x',
      maxFocusDistance: Number.POSITIVE_INFINITY,
      svgAnimation: true,
      tooltip,
    });
  }, [data]);

  if (!data.length) {
    return (
      <div className='empty-chart'>
        <Database />
        <span>No update reports available</span>
      </div>
    );
  }
  return (
    <Chart
      definition={definition}
      height={280}
      className='updates-chart'
      ariaLabel='Schedule records changed per import'
      ariaDescription='Three lines compare added, updated, and removed schedule records across the latest imports.'
    />
  );
}
