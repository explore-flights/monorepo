export type MapCoordinate = [number, number];

export const mapFitPadding = 70;

export function geometryCoordinates(coordinates: number[][] | number[][][]): MapCoordinate[] {
  const lines = isLineCoordinates(coordinates) ? [coordinates] : coordinates;
  return lines.flatMap((line) => line.map(([lng, lat]): MapCoordinate => [lng, lat]));
}

export function getMapBounds(
  coordinates: MapCoordinate[],
): [[number, number], [number, number]] | undefined {
  if (!coordinates.length) {
    return;
  }
  const [minLng, maxLng] = longitudeBounds(coordinates.map(([lng]) => lng));
  const lats = coordinates.map(([, lat]) => lat);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  return [
    [minLng === maxLng ? minLng - 1 : minLng, minLat === maxLat ? minLat - 1 : minLat],
    [minLng === maxLng ? maxLng + 1 : maxLng, maxLat === minLat ? maxLat + 1 : maxLat],
  ];
}

function isLineCoordinates(coordinates: number[][] | number[][][]): coordinates is number[][] {
  return typeof coordinates[0]?.[0] === 'number';
}

function longitudeBounds(longitudes: number[]): [number, number] {
  const sorted = longitudes
    .map((value) => ((value % 360) + 360) % 360)
    .sort((left, right) => left - right);
  if (sorted.length === 1) {
    return [sorted[0], sorted[0]];
  }
  let largestGap = -1;
  let gapIndex = 0;
  for (let index = 0; index < sorted.length; index++) {
    const next = index === sorted.length - 1 ? sorted[0] + 360 : sorted[index + 1];
    const gap = next - sorted[index];
    if (gap > largestGap) {
      largestGap = gap;
      gapIndex = index;
    }
  }
  let min = sorted[(gapIndex + 1) % sorted.length];
  let max = sorted[gapIndex];
  if (max < min) {
    max += 360;
  }
  while ((min + max) / 2 > 180) {
    min -= 360;
    max -= 360;
  }
  while ((min + max) / 2 < -180) {
    min += 360;
    max += 360;
  }
  return [min, max];
}
