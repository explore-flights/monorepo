import configurationCatalogJson from './data/configurations.json';

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

const configurationCatalog = configurationCatalogJson as ConfigurationCatalog;

export function aircraftConfigurationNames(
  operatingAirlineId: string,
  aircraftId: string,
  configuration: string,
): AircraftConfigurationNames | undefined {
  const names = configurationCatalog[operatingAirlineId]?.[aircraftId]?.[configuration];
  return names ? { name: names.name, shortName: names.short_name } : undefined;
}
