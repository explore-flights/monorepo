export const AircraftConfigurationVersion = Object.freeze({
  LH_A350_900_ALLEGRIS: 'C38E24M201',
  LH_A350_900_ALLEGRIS_FIRST_AS_BUSINESS: 'C42E24M201',
  LH_A350_900_ALLEGRIS_FIRST: 'F4C38E24M201',
  LH_A350_900_LH_CONFIG: 'C48E21M224',
  LH_A350_900_LG_CONFIG_SHORTHAUL: 'C48M245',
  LH_A350_900_PHILIPINE_1: 'C30E26M262',
  LH_A350_900_PHILIPINE_1_SHORTHAUL: 'C30M288',
  LH_A350_900_PHILIPINE_2: 'C30E24M241',

  LH_787_9_ALLEGRIS_4BC: 'C4E28M231',
});

export function aircraftConfigurationVersionToName(v: string): string | undefined {
  return ({
    [AircraftConfigurationVersion.LH_A350_900_ALLEGRIS]: 'Allegris (without FC)',
    [AircraftConfigurationVersion.LH_A350_900_ALLEGRIS_FIRST_AS_BUSINESS]: 'Allegris (with FC as BC)',
    [AircraftConfigurationVersion.LH_A350_900_ALLEGRIS_FIRST]: 'Allegris',
    [AircraftConfigurationVersion.LH_A350_900_LH_CONFIG]: 'A350-900 LH Config',
    [AircraftConfigurationVersion.LH_A350_900_LG_CONFIG_SHORTHAUL]: 'A350-900 LH Config (Shorthaul)',
    [AircraftConfigurationVersion.LH_A350_900_PHILIPINE_1]: 'LH/Philippines Config 1',
    [AircraftConfigurationVersion.LH_A350_900_PHILIPINE_1_SHORTHAUL]: 'LH/Philippines Config 1 (Shorthaul)',
    [AircraftConfigurationVersion.LH_A350_900_PHILIPINE_2]: 'LH/Philippines Config 2',
    [AircraftConfigurationVersion.LH_787_9_ALLEGRIS_4BC]: 'Allegris (without FC, 4 BC)',
  })[v] ?? undefined;
}

export const ALL_ALLEGRIS = [
  AircraftConfigurationVersion.LH_A350_900_ALLEGRIS,
  AircraftConfigurationVersion.LH_A350_900_ALLEGRIS_FIRST_AS_BUSINESS,
  AircraftConfigurationVersion.LH_A350_900_ALLEGRIS_FIRST,
  AircraftConfigurationVersion.LH_787_9_ALLEGRIS_4BC,
] as const;