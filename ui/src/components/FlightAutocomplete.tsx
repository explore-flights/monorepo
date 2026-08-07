import { useQuery } from '@tanstack/react-query';
import { Plane } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { api } from '@/api/client';
import { flightName } from '@/lib/format';
import { SearchCombobox } from './SearchCombobox';
import styles from './FlightAutocomplete.module.css';

interface FlightAutocompleteProps {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  onSelect: (flightNumber: string) => void;
  placeholder?: string;
  ariaLabel?: string;
  autoFocus?: boolean;
  compact?: boolean;
  showSearchIcon?: boolean;
  mobileFullscreen?: boolean;
}

export function FlightAutocomplete({
  id,
  value,
  onChange,
  onSelect,
  placeholder = 'e.g. LH400',
  ariaLabel = 'Flight number',
  autoFocus,
  compact,
  showSearchIcon,
  mobileFullscreen,
}: FlightAutocompleteProps) {
  const normalizedValue = value.trim();
  const [debounced, setDebounced] = useState(normalizedValue);

  useEffect(() => {
    const timeout = window.setTimeout(() => setDebounced(normalizedValue), 300);
    return () => window.clearTimeout(timeout);
  }, [normalizedValue]);

  const query = useQuery({
    queryKey: ['flight-search', debounced],
    queryFn: () => api.search(debounced),
    enabled: debounced.length >= 2,
    staleTime: 60_000,
  });
  const suggestionsPending =
    normalizedValue.length >= 2 && (debounced !== normalizedValue || query.isFetching);
  const suggestions = useMemo(() => {
    if (!query.data || suggestionsPending) {
      return [];
    }
    const airlines = Object.fromEntries(
      query.data.airlines.map((airline) => [airline.id, airline]),
    );
    return query.data.flightNumbers.slice(0, 8).map((flight) => ({
      flight,
      code: flightName(flight, airlines),
      airline: airlines[flight.airlineId],
    }));
  }, [query.data, suggestionsPending]);

  return (
    <SearchCombobox
      embedded
      compact={compact}
      showSearchIcon={showSearchIcon}
      ariaLabel={ariaLabel}
      inputId={id}
      value={value}
      onValueChange={onChange}
      transformInput={(input) => input.toUpperCase()}
      items={suggestions}
      getItemKey={(suggestion) => suggestion.code}
      onItemSelect={(suggestion) => {
        onChange(suggestion.code);
        onSelect(suggestion.code);
      }}
      renderItem={(suggestion) => (
        <span className={styles.suggestion}>
          <span className={styles.suggestionIcon}>
            <Plane size={15} />
          </span>
          <span className={styles.suggestionText}>
            <strong>{suggestion.code}</strong>
            <small>{suggestion.airline?.name ?? suggestion.flight.airlineId}</small>
          </span>
        </span>
      )}
      pending={suggestionsPending}
      error={query.isError}
      emptyMessage='No matching flight numbers'
      minimumQueryLength={2}
      minimumQueryMessage='Type at least 2 characters to search flights'
      mobileTitle='Search flights'
      mobileFullscreen={mobileFullscreen ?? compact}
      placeholder={placeholder}
      autoFocus={autoFocus}
    />
  );
}
