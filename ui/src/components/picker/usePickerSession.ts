import { useCallback, useId, useState, type KeyboardEvent } from 'react';
import type { PickerStatus } from './types';

interface PickerSessionOptions<Item> {
  items: readonly Item[];
  query: string;
  onQueryChange: (query: string) => void;
  minimumQueryLength?: number;
  pending?: boolean;
  error?: boolean;
}

interface PickerActiveState<Item> {
  items: readonly Item[];
  pending: boolean;
  index: number;
}

export function usePickerSession<Item>({
  items,
  query,
  onQueryChange,
  minimumQueryLength = 0,
  pending = false,
  error = false,
}: PickerSessionOptions<Item>) {
  const [open, setOpen] = useState(false);
  const [activeState, setActiveState] = useState<PickerActiveState<Item>>(() => ({
    items,
    pending,
    index: -1,
  }));
  const activeIndex =
    activeState.items === items && activeState.pending === pending ? activeState.index : -1;
  const listboxId = useId();
  const queryReady = query.trim().length >= minimumQueryLength;
  const activeItem = items[activeIndex];
  const status = getPickerStatus(queryReady, pending, error, items.length);

  const setActiveIndex = useCallback(
    (index: number) => setActiveState({ items, pending, index }),
    [items, pending],
  );

  const setQuery = useCallback(
    (nextQuery: string) => {
      onQueryChange(nextQuery);
      setActiveIndex(-1);
    },
    [onQueryChange, setActiveIndex],
  );

  const openPicker = useCallback(() => setOpen(true), []);
  const closePicker = useCallback(() => {
    setOpen(false);
    setActiveIndex(-1);
  }, [setActiveIndex]);

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
