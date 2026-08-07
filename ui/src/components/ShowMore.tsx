import { RefreshCcw } from 'lucide-react';
import { Button } from '@/components/primitives';

export function ShowMore({
  visible,
  total,
  batchSize,
  itemLabel,
  onShowMore,
}: {
  visible: number;
  total: number;
  batchSize: number;
  itemLabel: string;
  onShowMore: () => void;
}) {
  if (visible >= total) {
    return null;
  }

  const visibleCount = Math.min(visible, total);
  const nextCount = Math.min(batchSize, total - visibleCount);

  return (
    <div className='load-more'>
      <Button variant='secondary' onClick={onShowMore}>
        <RefreshCcw size={16} />
        Show {nextCount} more
      </Button>
      <span>
        {visibleCount} of {total} {itemLabel}
      </span>
    </div>
  );
}
