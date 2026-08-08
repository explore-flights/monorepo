import type { SingleChoicePickerProps } from './picker/SingleChoicePicker';
import { SingleChoicePicker } from './picker/SingleChoicePicker';

export interface SearchProps<Item> extends Omit<
  SingleChoicePickerProps<Item>,
  | 'query'
  | 'onQueryChange'
  | 'onSelect'
  | 'selectedKey'
  | 'closedValue'
  | 'resetQueryOnOpen'
  | 'resetQueryOnClose'
  | 'resetQueryOnSelect'
> {
  value: string;
  onValueChange: (value: string) => void;
  onSelect: (item: Item) => void;
}

export function Search<Item>({ value, onValueChange, onSelect, ...props }: SearchProps<Item>) {
  return (
    <SingleChoicePicker
      {...props}
      query={value}
      onQueryChange={onValueChange}
      onSelect={onSelect}
    />
  );
}
