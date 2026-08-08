import { useMemo, useState } from 'react';
import { filterSelectOptions } from './picker/selectOptions';
import { SingleChoicePicker } from './picker/SingleChoicePicker';
import type { SelectOption } from './picker/types';
import styles from './picker/Picker.module.css';

interface SingleSelectProps {
  label: string;
  value?: string;
  options: readonly SelectOption[];
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}

export function SingleSelect({
  label,
  value,
  options,
  onChange,
  placeholder = 'Select…',
  disabled,
  className,
}: SingleSelectProps) {
  const [query, setQuery] = useState('');
  const filtered = useMemo(() => filterSelectOptions(options, query), [options, query]);
  const selected = options.find((option) => option.value === value);

  return (
    <SingleChoicePicker
      title={label}
      ariaLabel={label}
      className={className}
      query={query}
      onQueryChange={setQuery}
      items={filtered}
      getItemKey={(option) => option.value}
      selectedKey={value}
      closedValue={selected?.label ?? value ?? ''}
      onSelect={(option) => onChange(option.value)}
      renderItem={(option) => (
        <span className={styles.defaultOption}>
          <strong>{option.label}</strong>
          {option.description && <small>{option.description}</small>}
        </span>
      )}
      resetQueryOnOpen
      resetQueryOnClose
      resetQueryOnSelect
      placeholder={placeholder}
      showSearchIcon
      disabled={disabled}
    />
  );
}

export type { SelectOption } from './picker/types';
