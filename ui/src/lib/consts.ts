export const AircraftConfigurationVersion = Object.freeze({
  LH_A350_900_ALLEGRIS: 'C38E24M201',
  LH_A350_900_ALLEGRIS_FIRST: 'F4C38E24M201',
  LH_A350_900_LH_CONFIG: 'C48E21M224',
  LH_A350_900_PHILIPINE_1: 'C30E26M262',
  LH_A350_900_PHILIPINE_2: 'C30E24M241',
});

export function aircraftConfigurationVersionToName(v: string): string | undefined {
  return ({
    [AircraftConfigurationVersion.LH_A350_900_ALLEGRIS]: 'Allegris',
    [AircraftConfigurationVersion.LH_A350_900_ALLEGRIS_FIRST]: 'Allegris with First',
    [AircraftConfigurationVersion.LH_A350_900_LH_CONFIG]: 'A350-900 LH Config',
    [AircraftConfigurationVersion.LH_A350_900_PHILIPINE_1]: 'LH/Philippines Config 1',
    [AircraftConfigurationVersion.LH_A350_900_PHILIPINE_2]: 'LH/Philippines Config 2',
  })[v] ?? undefined;
}