import { ArrowDown, ArrowUp, ChevronDown, ChevronRight } from 'lucide-react';
import { Fragment, useState, type ReactNode } from 'react';
import { Button, Card } from '@/components/primitives';

export interface ScheduleTableColumn<Row, SortKey extends string> {
  label: string;
  sortKey?: SortKey;
  render: (row: Row) => ReactNode;
}

export function ScheduleTable<Row, SortKey extends string>({
  rows,
  columns,
  defaultSort,
  compareRows,
  rowKey,
  expandedLabel,
  renderDetails,
  eyebrow,
  title,
  itemLabel,
  ariaLabel,
  pageSize = 50,
}: {
  rows: readonly Row[];
  columns: readonly ScheduleTableColumn<Row, SortKey>[];
  defaultSort: SortKey;
  compareRows: (left: Row, right: Row, sort: SortKey) => number;
  rowKey: (row: Row) => string;
  expandedLabel: (row: Row) => string;
  renderDetails: (row: Row) => ReactNode;
  eyebrow: string;
  title: ReactNode;
  itemLabel: string;
  ariaLabel: string;
  pageSize?: number;
}) {
  const [sort, setSort] = useState<SortKey>(defaultSort);
  const [descending, setDescending] = useState(false);
  const [page, setPage] = useState(1);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const sorted = [...rows].sort(
    (left, right) => compareRows(left, right, sort) * (descending ? -1 : 1),
  );
  const pages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const currentPage = Math.min(page, pages);
  const visible = sorted.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  function changeSort(key: SortKey) {
    if (sort === key) {
      setDescending(!descending);
    } else {
      setSort(key);
      setDescending(false);
    }

    setPage(1);
  }

  function toggleExpanded(key: string) {
    setExpanded((previous) => {
      const next = new Set(previous);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }

      return next;
    });
  }

  return (
    <Card className='table-card workspace-date-table schedule-data-table'>
      <div className='schedule-table-header'>
        <div>
          <span className='eyebrow'>{eyebrow}</span>
          <h2>{title}</h2>
        </div>
        <div className='pagination' aria-label={`${itemLabel} pagination`}>
          <Button
            variant='ghost'
            aria-label='Previous page'
            disabled={currentPage <= 1}
            onClick={() => setPage(currentPage - 1)}
          >
            ←
          </Button>
          <span>
            Page {currentPage} of {pages}
          </span>
          <Button
            variant='ghost'
            aria-label='Next page'
            disabled={currentPage >= pages}
            onClick={() => setPage(currentPage + 1)}
          >
            →
          </Button>
        </div>
      </div>
      <div className='table-scroll'>
        <table className='data-table rich-schedule-table' aria-label={ariaLabel}>
          <thead>
            <tr>
              <th aria-label='Expand details' />
              {columns.map((column) => {
                const sortKey = column.sortKey;
                if (sortKey === undefined) {
                  return <th key={column.label}>{column.label}</th>;
                }

                return (
                  <SortableTableHeading
                    key={column.label}
                    label={column.label}
                    active={sort === sortKey}
                    descending={descending}
                    onClick={() => changeSort(sortKey)}
                  />
                );
              })}
            </tr>
          </thead>
          <tbody>
            {visible.map((row) => {
              const key = rowKey(row);
              const isOpen = expanded.has(key);

              return (
                <Fragment key={key}>
                  <tr>
                    <td>
                      <button
                        type='button'
                        className='row-expand'
                        aria-expanded={isOpen}
                        aria-label={`${isOpen ? 'Collapse' : 'Expand'} ${expandedLabel(row)} details`}
                        onClick={() => toggleExpanded(key)}
                      >
                        {isOpen ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
                      </button>
                    </td>
                    {columns.map((column) => (
                      <td key={column.label}>{column.render(row)}</td>
                    ))}
                  </tr>
                  {isOpen && (
                    <tr className='expanded-table-row'>
                      <td colSpan={columns.length + 1}>{renderDetails(row)}</td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

export function SortableTableHeading({
  label,
  active,
  descending,
  onClick,
}: {
  label: string;
  active: boolean;
  descending: boolean;
  onClick: () => void;
}) {
  let ariaSort: 'ascending' | 'descending' | 'none' = 'none';
  if (active) {
    ariaSort = descending ? 'descending' : 'ascending';
  }

  return (
    <th aria-sort={ariaSort}>
      <button type='button' className='sort-button' onClick={onClick}>
        {label}
        {active && (descending ? <ArrowDown size={12} /> : <ArrowUp size={12} />)}
      </button>
    </th>
  );
}
