import { useCallback, useEffect, useId, useState, type KeyboardEvent } from 'react';
import type { PickerStatus } from './types';

interface PickerSessionOptions<Item> {
  items: readonly Item[];
  query?: string;
  defaultQuery?: string;
  onQueryChange?: (query: string) => void;
  minimumQueryLength?: number;
  pending?: boolean;
  error?: boolean;
}

export function usePickerSession<Item>({
  items,
  query: controlledQuery,
  defaultQuery = '',
  onQueryChange,
  minimumQueryLength = 0,
  pending = false,
  error = false,
}: PickerSessionOptions<Item>) {
  const [internalQuery, setInternalQuery] = useState(defaultQuery);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const listboxId = useId();
  const query = controlledQuery ?? internalQuery;
  const queryReady = query.trim().length >= minimumQueryLength;
  const activeItem = items[activeIndex];
  const status = getPickerStatus(queryReady, pending, error, items.length);

  useEffect(() => setActiveIndex(-1), [items, pending]);

  const setQuery = useCallback(
    (nextQuery: string) => {
      if (controlledQuery === undefined) {
        setInternalQuery(nextQuery);
      }
      onQueryChange?.(nextQuery);
      setActiveIndex(-1);
    },
    [controlledQuery, onQueryChange],
  );

  const openPicker = useCallback(() => setOpen(true), []);
  const closePicker = useCallback(() => {
    setOpen(false);
    setActiveIndex(-1);
  }, []);

  function onInputKeyDown(
    event: KeyboardEvent<HTMLInputElement>,
    onSelect: (item: Item) => void,
    onEscape: () => void = closePicker,
  ) {
    if (event.key === 'Escape' && open) {
      event.preventDefault();
      onEscape();
      return;
    }
    if (!open || status !== 'ready') {
      return;
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex((activeIndex + 1) % items.length);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex(
        activeIndex < 0 ? items.length - 1 : (activeIndex - 1 + items.length) % items.length,
      );
    } else if (event.key === 'Enter' && activeItem) {
      event.preventDefault();
      onSelect(activeItem);
    }
  }

  return {
    activeIndex,
    activeItem,
    closePicker,
    listboxId,
    onInputKeyDown,
    open,
    openPicker,
    query,
    queryReady,
    setActiveIndex,
    setQuery,
    status,
  };
}

function getPickerStatus(
  queryReady: boolean,
  pending: boolean,
  error: boolean,
  itemCount: number,
): PickerStatus {
  if (!queryReady) {
    return 'minimum-query';
  }
  if (pending) {
    return 'loading';
  }
  if (error) {
    return 'error';
  }
  return itemCount === 0 ? 'empty' : 'ready';
}
