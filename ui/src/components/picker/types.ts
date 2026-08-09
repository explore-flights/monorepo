import type { ReactNode } from 'react';

export type PickerStatus = 'minimum-query' | 'loading' | 'error' | 'empty' | 'ready';

interface PickerRenderState {
  active: boolean;
  selected: boolean;
}

export interface PickerItemProps<Item> {
  items: readonly Item[];
  getItemKey: (item: Item) => string;
  renderItem: (item: Item, state: PickerRenderState) => ReactNode;
}

export interface SelectOption {
  value: string;
  label: string;
  description?: string;
  keywords?: string;
}
