import { Search as SearchIcon } from 'lucide-react';
import { useRef } from 'react';
import { classNames } from '@/lib/format';
import { DesktopDropdown } from './DesktopDropdown';
import { MobilePickerDialog } from './MobilePickerDialog';
import { OptionList } from './OptionList';
import styles from './Picker.module.css';
import { QueryInput } from './QueryInput';
import type { PickerItemProps } from './types';
import { useMobilePicker } from './useMobilePicker';
import { usePickerSession } from './usePickerSession';

export interface SingleChoicePickerProps<Item> extends PickerItemProps<Item> {
  title: string;
  ariaLabel: string;
  query: string;
  onQueryChange: (query: string) => void;
  onSelect: (item: Item) => void;
  selectedKey?: string;
  closedValue?: string;
  inputId?: string;
  placeholder?: string;
  pending?: boolean;
  error?: boolean;
  emptyMessage?: string;
  minimumQueryLength?: number;
  minimumQueryMessage?: string;
  transformInput?: (value: string) => string;
  resetQueryOnOpen?: boolean;
  resetQueryOnClose?: boolean;
  resetQueryOnSelect?: boolean;
  compact?: boolean;
  embedded?: boolean;
  showSearchIcon?: boolean;
  autoFocus?: boolean;
  disabled?: boolean;
  className?: string;
}

export function SingleChoicePicker<Item>({
  title,
  ariaLabel,
  query,
  onQueryChange,
  items,
  getItemKey,
  renderItem,
  onSelect,
  selectedKey,
  closedValue,
  inputId,
  placeholder,
  pending,
  error,
  emptyMessage = 'No matching options',
  minimumQueryLength = 0,
  minimumQueryMessage = `Type at least ${minimumQueryLength} characters`,
  transformInput,
  resetQueryOnOpen,
  resetQueryOnClose,
  resetQueryOnSelect,
  compact,
  embedded,
  showSearchIcon,
  autoFocus,
  disabled,
  className,
}: SingleChoicePickerProps<Item>) {
  const mobile = useMobilePicker();
  const desktopInputRef = useRef<HTMLInputElement>(null);
  const mobileInputRef = useRef<HTMLInputElement>(null);
  const session = usePickerSession({
    items,
    query,
    onQueryChange,
    minimumQueryLength,
    pending,
    error,
  });
  const selectedKeys = selectedKey ? new Set([selectedKey]) : undefined;
  const desktopMenuVisible = session.open && session.queryReady;
  const activeOptionId =
    session.activeIndex >= 0 ? `${session.listboxId}-option-${session.activeIndex}` : undefined;

  function openPicker() {
    if (disabled || session.open) {
      return;
    }
    if (resetQueryOnOpen) {
      session.setQuery('');
    }
    session.openPicker();
  }

  function closePicker() {
    session.closePicker();
    if (resetQueryOnClose) {
      session.setQuery('');
    }
  }

  function select(item: Item) {
    onSelect(item);
    session.closePicker();
    if (resetQueryOnSelect) {
      session.setQuery('');
    }
  }

  const optionList = (preserveInputFocus: boolean) => (
    <OptionList
      id={session.listboxId}
      items={items}
      status={session.status}
      activeIndex={session.activeIndex}
      selectedKeys={selectedKeys}
      minimumQueryMessage={minimumQueryMessage}
      emptyMessage={emptyMessage}
      preserveInputFocus={preserveInputFocus}
      getItemKey={getItemKey}
      renderItem={renderItem}
      onActiveIndexChange={session.setActiveIndex}
      onSelect={select}
    />
  );

  const rootClassName = classNames(
    styles.root,
    !embedded && styles.field,
    compact && styles.compact,
    showSearchIcon && styles.withLeadingIcon,
    className,
  );

  if (mobile) {
    const launcherValue = closedValue ?? query;
    return (
      <div className={rootClassName}>
        <button
          id={inputId}
          type='button'
          role='combobox'
          aria-label={ariaLabel}
          aria-haspopup='listbox'
          aria-controls={session.listboxId}
          aria-expanded={session.open}
          className={styles.mobileLauncher}
          disabled={disabled}
          onClick={openPicker}
        >
          {showSearchIcon && <SearchIcon className={styles.leadingIcon} size={compact ? 15 : 17} />}
          <span className={styles.mobileLauncherValue}>
            {launcherValue || <span className={styles.placeholder}>{placeholder}</span>}
          </span>
        </button>
        <MobilePickerDialog
          open={session.open}
          title={title}
          initialFocusRef={mobileInputRef}
          onCancel={closePicker}
        >
          <div className={styles.mobileSearchControl}>
            <SearchIcon className={styles.leadingIcon} size={17} />
            <div className={styles.inputRow}>
              <QueryInput
                ref={mobileInputRef}
                aria-label={ariaLabel}
                listboxId={session.listboxId}
                expanded={session.open}
                activeOptionId={activeOptionId}
                value={query}
                onChange={(event) =>
                  session.setQuery(transformInput?.(event.target.value) ?? event.target.value)
                }
                onKeyDown={(event) => session.onInputKeyDown(event, select, closePicker)}
                placeholder={placeholder}
              />
            </div>
          </div>
          {optionList(false)}
        </MobilePickerDialog>
      </div>
    );
  }

  return (
    <div
      className={rootClassName}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          closePicker();
        }
      }}
    >
      <div
        className={styles.control}
        onPointerDown={(event) => {
          if (!(event.target as HTMLElement).closest('button')) {
            openPicker();
            desktopInputRef.current?.focus();
          }
        }}
      >
        {showSearchIcon && <SearchIcon className={styles.leadingIcon} size={compact ? 15 : 17} />}
        <div className={styles.inputRow}>
          <QueryInput
            ref={desktopInputRef}
            id={inputId}
            aria-label={ariaLabel}
            listboxId={session.listboxId}
            expanded={desktopMenuVisible}
            activeOptionId={activeOptionId}
            value={session.open ? query : (closedValue ?? query)}
            disabled={disabled}
            onChange={(event) => {
              session.setQuery(transformInput?.(event.target.value) ?? event.target.value);
              session.openPicker();
            }}
            onFocus={openPicker}
            onKeyDown={(event) => session.onInputKeyDown(event, select, closePicker)}
            placeholder={placeholder}
            autoFocus={autoFocus}
          />
        </div>
      </div>
      {desktopMenuVisible && <DesktopDropdown>{optionList(true)}</DesktopDropdown>}
    </div>
  );
}
