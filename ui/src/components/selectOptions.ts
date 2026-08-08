import type { Aircraft, Airline, Airport } from '@/api/types';
import type { SelectOption } from './picker/types';

export function airportSelectOptions(airports: readonly Airport[]): SelectOption[] {
  return sortOptions(
    airports.map((airport) => ({
      value: airport.id,
      label: airport.iataCode,
      description: airport.name,
      keywords: [airport.icaoCode, airport.cityCode, airport.countryCode].filter(Boolean).join(' '),
    })),
  );
}

export function aircraftSelectOptions(aircraft: readonly Aircraft[]): SelectOption[] {
  return sortOptions(
    aircraft.map((item) => ({
      value: item.id,
      label: item.name || item.iataCode,
      description: [item.iataCode, item.icaoCode].filter(Boolean).join(' · '),
    })),
  );
}

export function airlineSelectOptions(airlines: readonly Airline[]): SelectOption[] {
  return sortOptions(
    airlines.map((airline) => ({
      value: airline.id,
      label: airline.iataCode,
      description: airline.name,
      keywords: airline.icaoCode,
    })),
  );
}

function sortOptions(options: SelectOption[]) {
  return options.sort((left, right) => left.label.localeCompare(right.label));
}
