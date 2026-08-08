import { LoaderCircle } from 'lucide-react';
import { useEffect, useRef, type UIEvent } from 'react';
import { classNames } from '@/lib/format';
import styles from './Picker.module.css';
import type { PickerItemProps, PickerStatus } from './types';
import { useProgressiveList } from './useProgressiveList';

interface OptionListProps<Item> extends PickerItemProps<Item> {
  id: string;
  status: PickerStatus;
  activeIndex: number;
  selectedKeys?: ReadonlySet<string>;
  multiselect?: boolean;
  minimumQueryMessage: string;
  emptyMessage: string;
  errorMessage?: string;
  preserveInputFocus?: boolean;
  onActiveIndexChange: (index: number) => void;
  onSelect: (item: Item) => void;
}

export function OptionList<Item>({
  id,
  items,
  status,
  activeIndex,
  selectedKeys,
  multiselect,
  minimumQueryMessage,
  emptyMessage,
  errorMessage = 'Suggestions unavailable',
  preserveInputFocus,
  getItemKey,
  renderItem,
  onActiveIndexChange,
  onSelect,
}: OptionListProps<Item>) {
  const listRef = useRef<HTMLDivElement>(null);
  const { hasMore, revealMore, visibleItems } = useProgressiveList(items, { activeIndex });

  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = 0;
    }
  }, [items]);

  useEffect(() => {
    if (activeIndex < 0) {
      return;
    }
    const activeOption = listRef.current?.querySelector<HTMLElement>(
      `[data-option-index='${activeIndex}']`,
    );
    activeOption?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex, visibleItems.length]);

  function handleScroll(event: UIEvent<HTMLDivElement>) {
    if (!hasMore) {
      return;
    }
    const list = event.currentTarget;
    if (list.scrollHeight - list.scrollTop - list.clientHeight <= 160) {
      revealMore();
    }
  }

  return (
    <div
      ref={listRef}
      className={styles.options}
      id={id}
      role='listbox'
      aria-multiselectable={multiselect || undefined}
      onScroll={handleScroll}
    >
      {status === 'minimum-query' && <div className={styles.state}>{minimumQueryMessage}</div>}
      {status === 'loading' && (
        <div className={styles.loadingState} role='status' aria-label='Loading suggestions'>
          <LoaderCircle className='spin' size={18} />
        </div>
      )}
      {status === 'error' && <div className={styles.state}>{errorMessage}</div>}
      {status === 'empty' && <div className={styles.state}>{emptyMessage}</div>}
      {status === 'ready' &&
        visibleItems.map((item, index) => {
          const key = getItemKey(item);
          const selected = selectedKeys?.has(key) ?? false;
          const active = index === activeIndex;
          return (
            <button
              type='button'
              id={`${id}-option-${index}`}
              role='option'
              aria-selected={selected}
              aria-posinset={index + 1}
              aria-setsize={items.length}
              data-option-index={index}
              className={classNames(
                styles.option,
                active && styles.active,
                selected && styles.selected,
              )}
              key={key}
              onMouseDown={preserveInputFocus ? (event) => event.preventDefault() : undefined}
              onMouseEnter={() => onActiveIndexChange(index)}
              onClick={() => onSelect(item)}
            >
              {renderItem(item, { active, selected })}
            </button>
          );
        })}
    </div>
  );
}
