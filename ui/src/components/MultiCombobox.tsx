import { Check } from 'lucide-react';
import { useMemo } from 'react';
import { MultiChoicePicker } from './picker/MultiChoicePicker';
import { filterSelectOptions } from './picker/selectOptions';
import type { SelectOption } from './picker/types';
import styles from './MultiCombobox.module.css';

interface MultiComboboxProps {
  label: string;
  values: readonly string[];
  options: readonly SelectOption[];
  onChange: (values: string[]) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}

export function MultiCombobox({
  label,
  values,
  options,
  onChange,
  placeholder,
  disabled,
  className,
}: MultiComboboxProps) {
  const byValue = useMemo(
    () => new Map(options.map((option) => [option.value, option])),
    [options],
  );

  return (
    <MultiChoicePicker
      title={label}
      ariaLabel={label}
      values={values}
      onCommit={onChange}
      items={options}
      filterItems={filterSelectOptions}
      getItemKey={(option) => option.value}
      getItemLabel={(key) => byValue.get(key)?.label ?? key}
      renderItem={(option, { selected }) => (
        <span className={styles.optionContent}>
          <span className={styles.checkbox}>{selected && <Check size={13} />}</span>
          <span className={styles.optionText}>
            <strong>{option.label}</strong>
            {option.description && <small>{option.description}</small>}
          </span>
        </span>
      )}
      placeholder={placeholder}
      disabled={disabled}
      className={className}
    />
  );
}

export type { SelectOption } from './picker/types';
