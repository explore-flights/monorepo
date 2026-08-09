import { Search as SearchIcon } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { classNames } from '@/lib/format';
import { DesktopDropdown } from './DesktopDropdown';
import { MobilePickerDialog } from './MobilePickerDialog';
import { OptionList } from './OptionList';
import styles from './Picker.module.css';
import { QueryInput } from './QueryInput';
import { TokenInput, TokenList } from './TokenInput';
import type { PickerItemProps } from './types';
import { useMobilePicker } from './useMobilePicker';
import { usePickerSession } from './usePickerSession';

interface MultiChoicePickerProps<Item> extends PickerItemProps<Item> {
  title: string;
  ariaLabel: string;
  values: readonly string[];
  onCommit: (values: string[]) => void;
  getItemLabel: (key: string) => string;
  filterItems?: (items: readonly Item[], query: string) => readonly Item[];
  transformInput?: (value: string) => string;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}

export function MultiChoicePicker<Item>({
  title,
  ariaLabel,
  values,
  onCommit,
  items: sourceItems,
  getItemKey,
  getItemLabel,
  renderItem,
  filterItems,
  transformInput,
  placeholder = 'Select…',
  disabled,
  className,
}: MultiChoicePickerProps<Item>) {
  const mobile = useMobilePicker();
  const [query, setQuery] = useState('');
  const items = useMemo(
    () => (filterItems ? filterItems(sourceItems, query) : sourceItems),
    [filterItems, query, sourceItems],
  );
  const [draftValues, setDraftValues] = useState<string[]>([...values]);
  const draftRef = useRef<string[]>([...values]);
  const desktopInputRef = useRef<HTMLInputElement>(null);
  const mobileInputRef = useRef<HTMLInputElement>(null);
  const session = usePickerSession({ items, query, onQueryChange: setQuery });
  const selectedKeys = useMemo(() => new Set(draftValues), [draftValues]);
  const activeOptionId =
    session.activeIndex >= 0 ? `${session.listboxId}-option-${session.activeIndex}` : undefined;

  function replaceDraft(nextValues: string[]) {
    draftRef.current = nextValues;
    setDraftValues(nextValues);
  }

  function beginSession() {
    if (disabled || session.open) {
      return;
    }
    replaceDraft([...values]);
    session.setQuery('');
    session.openPicker();
  }

  function toggleDraft(key: string) {
    const current = draftRef.current;
    replaceDraft(
      current.includes(key) ? current.filter((value) => value !== key) : [...current, key],
    );
  }

  function selectDraftItem(item: Item) {
    toggleDraft(getItemKey(item));
    session.setQuery('');
  }

  function commitSession() {
    if (!session.open) {
      return;
    }
    onCommit([...draftRef.current]);
    session.setQuery('');
    session.closePicker();
  }

  function cancelSession() {
    replaceDraft([...values]);
    session.setQuery('');
    session.closePicker();
  }

  function removeCommitted(key: string) {
    onCommit(values.filter((value) => value !== key));
  }

  function tokens(tokenValues: readonly string[]) {
    return tokenValues.map((value) => ({ key: value, label: getItemLabel(value) }));
  }

  const optionList = ({
    preserveInputFocus,
    onSelect,
  }: {
    preserveInputFocus?: boolean;
    onSelect: (item: Item) => void;
  }) => (
    <OptionList
      id={session.listboxId}
      items={items}
      status={session.status}
      activeIndex={session.activeIndex}
      selectedKeys={selectedKeys}
      multiselect
      minimumQueryMessage='Start typing to filter options'
      emptyMessage='No matching options'
      preserveInputFocus={preserveInputFocus}
      getItemKey={getItemKey}
      renderItem={renderItem}
      onActiveIndexChange={session.setActiveIndex}
      onSelect={onSelect}
    />
  );

  const footer = (
    <>
      <span>{draftValues.length} selected</span>
      <button type='button' onClick={commitSession}>
        Done
      </button>
    </>
  );

  if (mobile) {
    return (
      <div className={classNames(styles.root, styles.field, styles.withLeadingIcon, className)}>
        <button
          type='button'
          role='combobox'
          aria-label={ariaLabel}
          aria-haspopup='listbox'
          aria-controls={session.listboxId}
          aria-expanded={session.open}
          className={styles.mobileLauncher}
          disabled={disabled}
          onClick={beginSession}
        >
          <SearchIcon className={styles.leadingIcon} size={17} />
          <span className={styles.mobileLauncherValue}>
            {values.length ? (
              <TokenList tokens={tokens(values)} maxVisible={3} />
            ) : (
              <span className={styles.placeholder}>{placeholder}</span>
            )}
          </span>
        </button>
        <MobilePickerDialog
          open={session.open}
          title={title}
          initialFocusRef={mobileInputRef}
          footer={footer}
          onCancel={cancelSession}
        >
          <div className={styles.mobileSearchControl}>
            <SearchIcon className={styles.leadingIcon} size={17} />
            <TokenInput
              layout='mobile'
              tokens={tokens(draftValues)}
              maxVisible={3}
              inputValue={query}
              onInputValueChange={(value) => session.setQuery(transformInput?.(value) ?? value)}
              onRemove={toggleDraft}
              inputRef={mobileInputRef}
              inputProps={{
                'aria-label': ariaLabel,
                onKeyDown: (event) => session.onInputKeyDown(event, selectDraftItem, cancelSession),
                placeholder: draftValues.length === 0 ? placeholder : undefined,
              }}
              renderInput={(inputProps, ref) => (
                <QueryInput
                  {...inputProps}
                  ref={ref}
                  listboxId={session.listboxId}
                  expanded={session.open}
                  activeOptionId={activeOptionId}
                />
              )}
            />
          </div>
          {optionList({ onSelect: selectDraftItem })}
        </MobilePickerDialog>
      </div>
    );
  }

  const visibleValues = session.open ? draftValues : values;
  return (
    <div
      className={classNames(styles.root, styles.field, styles.withLeadingIcon, className)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          commitSession();
        }
      }}
    >
      <div
        className={styles.control}
        onPointerDown={(event) => {
          if (!(event.target instanceof Element && event.target.closest('button'))) {
            beginSession();
            desktopInputRef.current?.focus();
          }
        }}
      >
        <SearchIcon className={styles.leadingIcon} size={17} />
        <TokenInput
          tokens={tokens(visibleValues)}
          maxVisible={3}
          inputValue={query}
          onInputValueChange={(value) => {
            session.setQuery(transformInput?.(value) ?? value);
            session.openPicker();
          }}
          onRemove={(value) => (session.open ? toggleDraft(value) : removeCommitted(value))}
          inputRef={desktopInputRef}
          inputProps={{
            'aria-label': ariaLabel,
            disabled,
            onFocus: beginSession,
            onKeyDown: (event) => session.onInputKeyDown(event, selectDraftItem, cancelSession),
            placeholder: visibleValues.length === 0 ? placeholder : undefined,
          }}
          renderInput={(inputProps, ref) => (
            <QueryInput
              {...inputProps}
              ref={ref}
              listboxId={session.listboxId}
              expanded={session.open}
              activeOptionId={activeOptionId}
            />
          )}
        />
      </div>
      {session.open && (
        <DesktopDropdown footer={footer}>
          {optionList({
            preserveInputFocus: true,
            onSelect: selectDraftItem,
          })}
        </DesktopDropdown>
      )}
    </div>
  );
}
