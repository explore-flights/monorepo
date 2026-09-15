export type Coordinate = [number, number];
type Vector = [number, number, number];
const radians = Math.PI / 180;

function vector([longitude, latitude]: Coordinate): Vector {
  const lat = latitude * radians;
  const lng = longitude * radians;
  return [Math.cos(lat) * Math.cos(lng), Math.cos(lat) * Math.sin(lng), Math.sin(lat)];
}

// A tangent basis avoids division by sin(angle), including near antipodal airports.
export function greatCirclePosition(
  from: Coordinate,
  to: Coordinate,
  progress: number,
): Coordinate {
  if (progress <= 0) {
    return from;
  }
  if (progress >= 1) {
    return to;
  }
  const a = vector(from);
  const b = vector(to);
  const dot = Math.max(
    -1,
    Math.min(
      1,
      a.reduce((sum, value, index) => sum + value * b[index], 0),
    ),
  );
  const tangent = b.map((value, index) => value - dot * a[index]);
  let length = Math.hypot(...tangent);
  if (length < 1e-12) {
    if (dot > 0) {
      return from;
    }
    const axis: Vector = Math.abs(a[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0];
    const projection = axis.reduce((sum, value, index) => sum + value * a[index], 0);
    axis.forEach((value, index) => {
      tangent[index] = value - projection * a[index];
    });
    length = Math.hypot(...tangent);
  }
  const angle = Math.acos(dot) * progress;
  const point = a.map(
    (value, index) => value * Math.cos(angle) + (tangent[index] / length) * Math.sin(angle),
  );
  return [
    Math.atan2(point[1], point[0]) / radians,
    Math.atan2(point[2], Math.hypot(point[0], point[1])) / radians,
  ];
}

export function bearing(from: Coordinate, to: Coordinate): number {
  const delta = (to[0] - from[0]) * radians;
  const a = from[1] * radians;
  const b = to[1] * radians;
  return (
    Math.atan2(
      Math.sin(delta) * Math.cos(b),
      Math.cos(a) * Math.sin(b) - Math.sin(a) * Math.cos(b) * Math.cos(delta),
    ) / radians
  );
}

export function routeGeometry(from: Coordinate, to: Coordinate, start: number, end: number) {
  const lines: Coordinate[][] = [[]];
  const steps = Math.max(1, Math.ceil((end - start) * 180));
  for (let index = 0; index <= steps; index++) {
    const point = greatCirclePosition(from, to, start + ((end - start) * index) / steps);
    const line = lines[lines.length - 1];
    const previous = line[line.length - 1];
    if (previous && Math.abs(point[0] - previous[0]) > 180) {
      const boundary = previous[0] > 0 ? 180 : -180;
      const unwrapped = point[0] + (previous[0] > 0 ? 360 : -360);
      const fraction =
        unwrapped === previous[0] ? 0 : (boundary - previous[0]) / (unwrapped - previous[0]);
      const latitude = previous[1] + fraction * (point[1] - previous[1]);
      line.push([boundary, latitude]);
      lines.push([[-boundary, latitude], point]);
    } else {
      line.push(point);
    }
  }
  return { type: 'MultiLineString' as const, coordinates: lines };
}
