import configurations from './data/configurations.json';

export function aircraftConfigurationVersionToName(v: string): string | undefined {
  for (const configsByAircraft of Object.values(configurations)) {
    for (const namesByConfig of Object.values(configsByAircraft)) {
      for (const [config, names] of Object.entries(namesByConfig)) {
        if (config === v) {
          return names.short_name;
        }
      }
    }
  }

  return undefined;
}

export const ALL_ALLEGRIS = Object.values(configurations['LH']).flatMap((namesByConfig) => {
  return Object.entries(namesByConfig).flatMap(([config, names]) => {
    if (names.short_name === 'Allegris') {
      return [config];
    }

    return [];
  });
});