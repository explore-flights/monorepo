import { useState } from 'react';
import { TokenInput } from './picker/TokenInput';
import styles from './TagInput.module.css';

interface TagInputProps {
  label: string;
  values: readonly string[];
  onChange: (values: string[]) => void;
  placeholder?: string;
  disabled?: boolean;
}

export function TagInput({ label, values, onChange, placeholder, disabled }: TagInputProps) {
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
    <div className={styles.tagInput}>
      <TokenInput
        layout='stacked'
        tokens={values.map((value) => ({ key: value, label: value }))}
        inputValue={draft}
        onInputValueChange={setDraft}
        onRemove={(value) => onChange(values.filter((item) => item !== value))}
        inputProps={{
          'aria-label': label,
          disabled,
          onBlur: commit,
          onKeyDown: (event) => {
            if (event.key === 'Enter' || event.key === ',') {
              event.preventDefault();
              commit();
            }
          },
          placeholder,
        }}
      />
    </div>
  );
}
