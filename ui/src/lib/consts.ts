import configurations from './data/configurations.json';

export interface AircraftConfigurationVersionNames {
  name: string;
  short_name: string;
}

const typedConfigurations = configurations as unknown as Record<string, Record<string, Record<string, AircraftConfigurationVersionNames>>>;

export function aircraftConfigurationVersionToName(configuration: string,
                                                   airlineIataCode?: string,
                                                   aircraftIataCode?: string,
                                                   displayOptions?: { style: 'full' | 'long' | 'short' }): string {

  const names = findAnyAircraftConfigurationVersionNames(configuration, airlineIataCode, aircraftIataCode);
  if (!names) {
    return configuration;
  }

  switch (displayOptions?.style ?? 'short') {
    case 'full':
      return `${names.name} (${configuration})`;

    case 'long':
      return names.name;

    case 'short':
      return names.short_name;
  }
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

export function findAnyAircraftConfigurationVersionNames(v: string, airlineIataCode?: string, aircraftIataCode?: string): AircraftConfigurationVersionNames | null {
  let lastMatchAny: AircraftConfigurationVersionNames | null = null;
  let lastMatchSingle: AircraftConfigurationVersionNames | null = null;

  for (const [airline, configsByAircraft] of Object.entries(typedConfigurations)) {
    for (const [aircraft, namesByConfig] of Object.entries(configsByAircraft)) {
      for (const [config, names] of Object.entries(namesByConfig)) {
        if (config === v) {
          let match = 0;
          if (airline === airlineIataCode) {
            match += 1;
          }

          if (aircraft === aircraftIataCode) {
            match += 1;
          }

          switch (match) {
            case 2:
              return names;

            case 1:
              lastMatchSingle = names;
              lastMatchAny = names;
              break;

            default:
              lastMatchAny = names;
              break;
          }
        }
      }
    }
  }

  return lastMatchSingle ?? lastMatchAny ?? null;
}

export const ALL_ALLEGRIS = Object.values(configurations['LH']).flatMap((namesByConfig) => {
  return Object.entries(namesByConfig).flatMap(([config, names]) => {
    if (names.short_name === 'Allegris') {
      return [config];
    }

    return [];
  });
});