import { LoaderCircle, Search, X } from 'lucide-react';
import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { classNames } from '@/lib/format';
import styles from './SearchCombobox.module.css';

interface RenderItemState {
  active: boolean;
  selected: boolean;
}

interface SearchComboboxProps<Item> {
  value: string;
  onValueChange: (value: string) => void;
  items: readonly Item[];
  getItemKey: (item: Item) => string;
  renderItem: (item: Item, state: RenderItemState) => ReactNode;
  onItemSelect: (item: Item) => void;
  ariaLabel: string;
  inputId?: string;
  placeholder?: string;
  tokens?: ReactNode;
  selectedKeys?: ReadonlySet<string>;
  pending?: boolean;
  error?: boolean;
  emptyMessage?: string;
  minimumQueryLength?: number;
  minimumQueryMessage?: string;
  closeOnSelect?: boolean;
  onOpenChange?: (open: boolean) => void;
  transformInput?: (value: string) => string;
  footer?: (close: () => void) => ReactNode;
  mobileTitle?: string;
  mobileFullscreen?: boolean;
  compact?: boolean;
  embedded?: boolean;
  showSearchIcon?: boolean;
  autoFocus?: boolean;
  disabled?: boolean;
  className?: string;
}

export function SearchCombobox<Item>({
  value,
  onValueChange,
  items,
  getItemKey,
  renderItem,
  onItemSelect,
  ariaLabel,
  inputId,
  placeholder,
  tokens,
  selectedKeys,
  pending,
  error,
  emptyMessage = 'No matching options',
  minimumQueryLength = 0,
  minimumQueryMessage = `Type at least ${minimumQueryLength} characters`,
  closeOnSelect = true,
  onOpenChange,
  transformInput,
  footer,
  mobileTitle = ariaLabel,
  mobileFullscreen,
  compact,
  embedded,
  showSearchIcon,
  autoFocus,
  disabled,
  className,
}: SearchComboboxProps<Item>) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [mobileViewport, setMobileViewport] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(max-width: 640px)').matches,
  );
  const listboxId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const activeItem = items[activeIndex];
  const queryReady = value.trim().length >= minimumQueryLength;
  const visible = open && (queryReady || (mobileFullscreen && mobileViewport));

  useEffect(() => setActiveIndex(-1), [items, pending]);

  useEffect(() => {
    if (!mobileFullscreen) {
      return;
    }
    const media = window.matchMedia('(max-width: 640px)');
    const updateMobileViewport = () => setMobileViewport(media.matches);
    updateMobileViewport();
    media.addEventListener('change', updateMobileViewport);
    return () => media.removeEventListener('change', updateMobileViewport);
  }, [mobileFullscreen]);

  function setOpenState(nextOpen: boolean) {
    setOpen(nextOpen);
    if (!nextOpen) {
      setActiveIndex(-1);
    }
    onOpenChange?.(nextOpen);
  }

  function close() {
    setOpenState(false);
  }

  function select(item: Item) {
    onItemSelect(item);
    setActiveIndex(-1);
    if (closeOnSelect) {
      close();
    }
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Escape' && open) {
      event.preventDefault();
      close();
      return;
    }
    if (!visible || items.length === 0) {
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
      select(activeItem);
    }
  }

  return (
    <div
      className={classNames(
        styles.root,
        embedded ? styles.embedded : styles.field,
        compact && styles.compact,
        showSearchIcon && styles.withLeadingIcon,
        mobileFullscreen && styles.mobileFullscreen,
        className,
      )}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          close();
        }
      }}
    >
      <div
        className={styles.control}
        onMouseDown={(event) => {
          if (!(event.target as HTMLElement).closest('button')) {
            inputRef.current?.focus();
            setOpenState(true);
          }
        }}
      >
        {showSearchIcon && <Search className={styles.leadingIcon} size={compact ? 15 : 17} />}
        <div className={styles.inputRow}>
          {tokens}
          <input
            ref={inputRef}
            id={inputId}
            aria-label={ariaLabel}
            aria-autocomplete='list'
            aria-controls={listboxId}
            aria-expanded={visible}
            aria-activedescendant={activeItem ? `${listboxId}-option-${activeIndex}` : undefined}
            role='combobox'
            value={value}
            disabled={disabled}
            onChange={(event) => {
              onValueChange(transformInput?.(event.target.value) ?? event.target.value);
              setOpenState(true);
              setActiveIndex(-1);
            }}
            onFocus={() => setOpenState(true)}
            onKeyDown={onKeyDown}
            placeholder={placeholder}
            autoComplete='off'
            autoFocus={autoFocus}
          />
        </div>
      </div>
      {visible && (
        <div className={styles.menu}>
          <header className={styles.mobileHeader}>
            <strong>{mobileTitle}</strong>
            <button type='button' aria-label={`Close ${mobileTitle}`} onClick={close}>
              <X size={20} />
            </button>
          </header>
          <div
            className={styles.options}
            id={listboxId}
            role='listbox'
            aria-multiselectable={selectedKeys ? true : undefined}
          >
            {!queryReady && <div className={styles.state}>{minimumQueryMessage}</div>}
            {queryReady && pending && (
              <div className={styles.loadingState} role='status' aria-label='Loading suggestions'>
                <LoaderCircle className='spin' size={18} />
              </div>
            )}
            {queryReady && !pending && error && (
              <div className={styles.state}>Suggestions unavailable</div>
            )}
            {queryReady && !pending && !error && items.length === 0 && (
              <div className={styles.state}>{emptyMessage}</div>
            )}
            {queryReady &&
              !pending &&
              items.map((item, index) => {
                const key = getItemKey(item);
                const selected = selectedKeys?.has(key) ?? false;
                const active = index === activeIndex;
                return (
                  <button
                    type='button'
                    id={`${listboxId}-option-${index}`}
                    role='option'
                    aria-selected={selected}
                    className={classNames(
                      styles.option,
                      active && styles.active,
                      selected && styles.selected,
                    )}
                    key={key}
                    onMouseDown={(event) => event.preventDefault()}
                    onMouseEnter={() => setActiveIndex(index)}
                    onClick={() => select(item)}
                  >
                    {renderItem(item, { active, selected })}
                  </button>
                );
              })}
          </div>
          {footer && <footer className={styles.footer}>{footer(close)}</footer>}
        </div>
      )}
    </div>
  );
}
