import type { InputHTMLAttributes, Ref } from 'react';

interface QueryInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'role'> {
  listboxId: string;
  expanded: boolean;
  activeOptionId?: string;
  ref?: Ref<HTMLInputElement>;
}

export function QueryInput({
  listboxId,
  expanded,
  activeOptionId,
  ref,
  ...props
}: QueryInputProps) {
  return (
    <input
      {...props}
      ref={ref}
      role='combobox'
      aria-autocomplete='list'
      aria-controls={listboxId}
      aria-expanded={expanded}
      aria-activedescendant={activeOptionId}
      autoComplete='off'
    />
  );
}
