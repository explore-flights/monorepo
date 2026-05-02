import configurations from './data/configurations.json';

export interface AircraftConfigurationVersionNames {
  name: string;
  short_name: string;
}

const typedConfigurations = configurations as unknown as Record<string, Record<string, Record<string, AircraftConfigurationVersionNames>>>;

export function aircraftConfigurationVersionToName(v: string): string | undefined {
  return findAnyAircraftConfigurationVersionNames(v)?.short_name ?? undefined;
}

export function findAircraftConfigurationVersionNames(airlineIataCode: string, aircraftIataCode: string, configuration: string): AircraftConfigurationVersionNames | null {
  const configsByAircraft = typedConfigurations[airlineIataCode];
  if (!configsByAircraft) {
    return null;
  }

  const namesByConfig = configsByAircraft[aircraftIataCode];
  if (!namesByConfig) {
    return null;
  }

  return namesByConfig[configuration] ?? null;
}

export function findAnyAircraftConfigurationVersionNames(v: string): AircraftConfigurationVersionNames | null {
  for (const configsByAircraft of Object.values(typedConfigurations)) {
    for (const namesByConfig of Object.values(configsByAircraft)) {
      for (const [config, names] of Object.entries(namesByConfig)) {
        if (config === v) {
          return names;
        }
      }
    }
  }

  return null;
}

export const ALL_ALLEGRIS = Object.values(configurations['LH']).flatMap((namesByConfig) => {
  return Object.entries(namesByConfig).flatMap(([config, names]) => {
    if (names.short_name === 'Allegris') {
      return [config];
    }

    return [];
  });
});