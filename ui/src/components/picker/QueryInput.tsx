import { forwardRef, type InputHTMLAttributes } from 'react';

interface QueryInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'role'> {
  listboxId: string;
  expanded: boolean;
  activeOptionId?: string;
}

export const QueryInput = forwardRef<HTMLInputElement, QueryInputProps>(function QueryInput(
  { listboxId, expanded, activeOptionId, ...props },
  ref,
) {
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
});
