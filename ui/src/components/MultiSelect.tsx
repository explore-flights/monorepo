import { Check, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { SearchCombobox } from './SearchCombobox';
import styles from './MultiSelect.module.css';

export interface SelectOption {
  value: string;
  label: string;
  description?: string;
  keywords?: string;
}

interface ValueFieldProps {
  label: string;
  values: readonly string[];
  onChange: (values: string[]) => void;
  placeholder?: string;
  disabled?: boolean;
}

interface MultiSelectProps extends ValueFieldProps {
  options: readonly SelectOption[];
  className?: string;
}

export function MultiSelect({
  label,
  values,
  options,
  onChange,
  placeholder = 'Select…',
  disabled,
  className,
}: MultiSelectProps) {
  const [query, setQuery] = useState('');
  const selected = useMemo(() => new Set(values), [values]);
  const byValue = useMemo(
    () => new Map(options.map((option) => [option.value, option])),
    [options],
  );
  const filtered = useMemo(() => {
    const normalized = query.trim().toLocaleUpperCase();
    if (!normalized) {
      return options.slice(0, 100);
    }
    return options
      .map((option, index) => ({ option, index, rank: matchRank(option, normalized) }))
      .filter(({ rank }) => Number.isFinite(rank))
      .sort((left, right) => left.rank - right.rank || left.index - right.index)
      .slice(0, 100)
      .map(({ option }) => option);
  }, [options, query]);

  function toggle(value: string) {
    if (selected.has(value)) {
      onChange(values.filter((item) => item !== value));
      return;
    }

    onChange([...values, value]);
  }

  return (
    <SearchCombobox
      className={className}
      ariaLabel={label}
      value={query}
      onValueChange={setQuery}
      items={filtered}
      getItemKey={(option) => option.value}
      selectedKeys={selected}
      onItemSelect={(option) => {
        toggle(option.value);
        setQuery('');
      }}
      renderItem={(option, { selected: optionSelected }) => (
        <span className={styles.optionContent}>
          <span className={styles.checkbox}>{optionSelected && <Check size={13} />}</span>
          <span className={styles.optionText}>
            <strong>{option.label}</strong>
            {option.description && <small>{option.description}</small>}
          </span>
        </span>
      )}
      tokens={
        <>
          {values.slice(0, 3).map((value) => (
            <span className={styles.chip} key={value}>
              {byValue.get(value)?.label ?? value}
              <button
                type='button'
                aria-label={`Remove ${byValue.get(value)?.label ?? value}`}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => toggle(value)}
              >
                <X size={11} />
              </button>
            </span>
          ))}
          {values.length > 3 && <span className={styles.more}>+{values.length - 3}</span>}
        </>
      }
      placeholder={values.length === 0 ? placeholder : undefined}
      closeOnSelect={false}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) {
          setQuery('');
        }
      }}
      footer={(close) => (
        <>
          <span>{values.length} selected</span>
          <button type='button' onClick={close}>
            Done
          </button>
        </>
      )}
      mobileTitle={label}
      mobileFullscreen
      showSearchIcon
      disabled={disabled}
    />
  );
}

function matchRank(option: SelectOption, query: string) {
  const label = option.label.toLocaleUpperCase();
  const description = (option.description ?? '').toLocaleUpperCase();
  const keywords = (option.keywords ?? '').toLocaleUpperCase();
  const keywordTokens = keywords.split(/\s+/).filter(Boolean);
  if (label === query) {
    return 0;
  }
  if (keywordTokens.includes(query)) {
    return 1;
  }
  if (label.startsWith(query)) {
    return 2;
  }
  if (keywordTokens.some((value) => value.startsWith(query))) {
    return 3;
  }
  if (description === query) {
    return 4;
  }
  if (description.startsWith(query)) {
    return 5;
  }
  if (description.split(/\s+/).some((value) => value.startsWith(query))) {
    return 6;
  }
  if (label.includes(query)) {
    return 7;
  }
  if (description.includes(query)) {
    return 8;
  }
  if (keywords.includes(query)) {
    return 9;
  }
  return Number.POSITIVE_INFINITY;
}

export function TagInput({ label, values, onChange, placeholder, disabled }: ValueFieldProps) {
  const [draft, setDraft] = useState('');
  function commit() {
    const additions = draft
      .split(/[\n,]+/)
      .map((value) => value.trim().toUpperCase())
      .filter(Boolean);
    if (additions.length) {
      onChange([...new Set([...values, ...additions])]);
    }
    setDraft('');
  }
  return (
    <div className={styles.tagInput} aria-label={label}>
      <div className={styles.tagValues}>
        {values.map((value) => (
          <span key={value}>
            {value}
            <button
              type='button'
              aria-label={`Remove ${value}`}
              onClick={() => onChange(values.filter((item) => item !== value))}
            >
              <X size={11} />
            </button>
          </span>
        ))}
      </div>
      <input
        disabled={disabled}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ',') {
            event.preventDefault();
            commit();
          }
        }}
        placeholder={placeholder}
      />
    </div>
  );
}
