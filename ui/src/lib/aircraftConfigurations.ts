import configurationCatalogJson from './data/configurations.json';
import type { FlightReferenceData, FlightScheduleVariant } from '@/api/types';

export interface AircraftConfigurationNames {
  name: string;
  shortName: string;
}

interface ConfigurationCatalogEntry {
  name: string;
  short_name: string;
}

type ConfigurationCatalog = Record<
  string,
  Record<string, Record<string, ConfigurationCatalogEntry>>
>;

const configurationCatalog: ConfigurationCatalog = configurationCatalogJson;

export function aircraftConfigurationNames(
  operatingAirlineId: string,
  aircraftId: string,
  configuration: string,
): AircraftConfigurationNames | undefined {
  const names = configurationCatalog[operatingAirlineId]?.[aircraftId]?.[configuration];
  return names ? { name: names.name, shortName: names.short_name } : undefined;
}

export function aircraftConfigurationLabel(
  variant: FlightScheduleVariant,
  data: FlightReferenceData,
  includeIdentifier = false,
) {
  const configuration = variant.aircraftConfigurationVersion;
  if (!configuration) {
    return 'No configuration';
  }
  const operatingAirlineId =
    data.airlines[variant.operatedAs.airlineId]?.iataCode ?? variant.operatedAs.airlineId;
  const aircraftId = data.aircraft[variant.aircraftId]?.iataCode ?? variant.aircraftId;
  const names = aircraftConfigurationNames(operatingAirlineId, aircraftId, configuration);
  if (!names) {
    return configuration;
  }
  const name = includeIdentifier ? names.name : names.shortName;
  return includeIdentifier && name !== configuration ? `${name} (${configuration})` : name;
}
