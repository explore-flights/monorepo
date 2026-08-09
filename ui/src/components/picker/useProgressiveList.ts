import { useCallback, useMemo, useState } from 'react';

interface ProgressiveListOptions {
  activeIndex?: number;
  batchSize?: number;
}

interface ProgressiveListState<Item> {
  source: readonly Item[];
  visibleCount: number;
}

export function useProgressiveList<Item>(
  items: readonly Item[],
  { activeIndex = -1, batchSize = 100 }: ProgressiveListOptions = {},
) {
  const initialCount = Math.min(batchSize, items.length);
  const [state, setState] = useState<ProgressiveListState<Item>>(() => ({
    source: items,
    visibleCount: initialCount,
  }));
  const storedVisibleCount =
    state.source === items ? Math.min(state.visibleCount, items.length) : initialCount;
  const activeVisibleCount =
    activeIndex < 0
      ? initialCount
      : Math.min(items.length, Math.ceil((activeIndex + 2) / batchSize) * batchSize);
  const visibleCount = Math.max(storedVisibleCount, activeVisibleCount);
  const hasMore = visibleCount < items.length;

  const revealThrough = useCallback(
    (index: number) => {
      setState((current) => {
        const currentCount =
          current.source === items ? Math.min(current.visibleCount, items.length) : initialCount;
        const requestedCount = Math.ceil((index + 1) / batchSize) * batchSize;
        const nextCount = Math.min(items.length, Math.max(currentCount, requestedCount));
        if (current.source === items && nextCount === currentCount) {
          return current;
        }
        return { source: items, visibleCount: nextCount };
      });
    },
    [batchSize, initialCount, items],
  );

  const revealMore = useCallback(
    () => revealThrough(visibleCount + batchSize - 1),
    [batchSize, revealThrough, visibleCount],
  );

  const visibleItems = useMemo(() => items.slice(0, visibleCount), [items, visibleCount]);

  return { hasMore, revealMore, visibleItems };
}
