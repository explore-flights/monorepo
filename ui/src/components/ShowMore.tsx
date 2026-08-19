import { ChevronDown } from 'lucide-react';
import { Button } from '@/components/primitives';
import { numberLabel } from '@/lib/format';

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
        <ChevronDown size={16} />
        Show {numberLabel(nextCount)} more
      </Button>
      <span>
        {numberLabel(visibleCount)} of {numberLabel(total)} {itemLabel}
      </span>
    </div>
  );
}
