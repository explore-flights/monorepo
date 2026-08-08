import type { SelectOption } from './types';

export function filterSelectOptions(options: readonly SelectOption[], query: string) {
  const normalized = query.trim().toLocaleUpperCase();
  if (!normalized) {
    return options;
  }
  return options
    .map((option, index) => ({ option, index, rank: matchRank(option, normalized) }))
    .filter(({ rank }) => Number.isFinite(rank))
    .sort((left, right) => left.rank - right.rank || left.index - right.index)
    .map(({ option }) => option);
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
