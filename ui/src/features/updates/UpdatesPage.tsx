import { useQuery } from '@tanstack/react-query';
import { ArrowDown, ArrowUp, Database, RefreshCw, TrendingUp } from 'lucide-react';
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
  const width = 900,
    height = 280,
    pad = 28;
  const max = Math.max(...data.flatMap((d) => [d.added, d.updated, d.removed]), 1);
  const points = (key: 'added' | 'updated' | 'removed') =>
    data
      .map(
        (d, i) =>
          `${pad + (i / Math.max(data.length - 1, 1)) * (width - pad * 2)},${height - pad - (d[key] / max) * (height - pad * 2)}`,
      )
      .join(' ');
  if (!data.length) {
    return (
      <div className='empty-chart'>
        <Database />
        <span>No update reports available</span>
      </div>
    );
  }
  return (
    <div className='svg-chart'>
      <svg viewBox={`0 0 ${width} ${height}`} role='img' aria-label='Update counts over time'>
        <g className='grid-lines'>
          {[0, 0.25, 0.5, 0.75, 1].map((v) => (
            <line
              key={v}
              x1={pad}
              x2={width - pad}
              y1={pad + v * (height - pad * 2)}
              y2={pad + v * (height - pad * 2)}
            />
          ))}
        </g>
        <polyline className='line-added' points={points('added')} />
        <polyline className='line-updated' points={points('updated')} />
        <polyline className='line-removed' points={points('removed')} />
      </svg>
      <div className='chart-axis'>
        <span>{dateLabel(data[0]?.version ?? '', { month: 'short', day: 'numeric' })}</span>
        <span>{dateLabel(data.at(-1)?.version ?? '', { month: 'short', day: 'numeric' })}</span>
      </div>
    </div>
  );
}
