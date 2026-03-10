import type { Point, SensorPosition, SensorLayout } from '../types/index.js';

/**
 * Ray-casting algorithm for point-in-polygon test.
 * Works for any simple (non-self-intersecting) polygon.
 */
export function pointInPolygon(point: Point, polygon: Point[]): boolean {
  if (polygon.length < 3) return false;
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].x;
    const yi = polygon[i].y;
    const xj = polygon[j].x;
    const yj = polygon[j].y;
    const intersect =
      yi > point.y !== yj > point.y &&
      point.x < ((xj - xi) * (point.y - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

/**
 * Distance between two points.
 */
export function distance(a: Point, b: Point): number {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
}

/**
 * Compute the sensor layout for a given position, canvas dimensions, and range.
 *
 * The sensor's local coordinate system:
 *   Y+ = forward (away from sensor)
 *   X+ = to the right of the sensor
 *
 * Returns pixel position, direction vectors, scale, and facing angle.
 */
export function getSensorLayout(
  position: SensorPosition,
  canvasWidth: number,
  canvasHeight: number,
  sensorMargin: number,
  maxRangeMm: number
): SensorLayout {
  let sx: number, sy: number, facingAngle: number, usable: number;

  switch (position) {
    case 'top':
      sx = canvasWidth / 2;
      sy = sensorMargin;
      facingAngle = Math.PI / 2; // down
      usable = canvasHeight - sensorMargin;
      break;
    case 'left':
      sx = sensorMargin;
      sy = canvasHeight / 2;
      facingAngle = 0; // right
      usable = canvasWidth - sensorMargin;
      break;
    case 'right':
      sx = canvasWidth - sensorMargin;
      sy = canvasHeight / 2;
      facingAngle = Math.PI; // left
      usable = canvasWidth - sensorMargin;
      break;
    case 'bottom-left':
      sx = sensorMargin;
      sy = canvasHeight - sensorMargin;
      facingAngle = -Math.PI / 4; // up-right 45°
      usable = Math.min(canvasWidth - sensorMargin, canvasHeight - sensorMargin);
      break;
    case 'bottom-right':
      sx = canvasWidth - sensorMargin;
      sy = canvasHeight - sensorMargin;
      facingAngle = -3 * Math.PI / 4; // up-left 45°
      usable = Math.min(canvasWidth - sensorMargin, canvasHeight - sensorMargin);
      break;
    case 'top-left':
      sx = sensorMargin;
      sy = sensorMargin;
      facingAngle = Math.PI / 4; // down-right 45°
      usable = Math.min(canvasWidth - sensorMargin, canvasHeight - sensorMargin);
      break;
    case 'top-right':
      sx = canvasWidth - sensorMargin;
      sy = sensorMargin;
      facingAngle = 3 * Math.PI / 4; // down-left 45°
      usable = Math.min(canvasWidth - sensorMargin, canvasHeight - sensorMargin);
      break;
    case 'bottom':
    default:
      sx = canvasWidth / 2;
      sy = canvasHeight - sensorMargin;
      facingAngle = -Math.PI / 2; // up
      usable = canvasHeight - sensorMargin;
      break;
  }

  const scale = usable / maxRangeMm;

  // Forward direction (where sensor Y+ maps to on canvas)
  const forwardX = Math.cos(facingAngle);
  const forwardY = Math.sin(facingAngle);

  // Right direction (where sensor X+ maps to on canvas) — perpendicular clockwise
  const rightX = -Math.sin(facingAngle);
  const rightY = Math.cos(facingAngle);

  return { sx, sy, forwardX, forwardY, rightX, rightY, scale, facingAngle };
}

/**
 * Convert radar millimeter coordinates to canvas pixel coordinates.
 * The sensor position on the canvas depends on the sensor_position config.
 * X: to the right of the sensor in its local frame
 * Y: away from the sensor (forward) in its local frame
 */
export function mmToCanvas(
  mmX: number,
  mmY: number,
  canvasWidth: number,
  canvasHeight: number,
  maxRangeMm: number,
  sensorMargin = 40,
  sensorPosition: SensorPosition = 'bottom'
): Point {
  const layout = getSensorLayout(sensorPosition, canvasWidth, canvasHeight, sensorMargin, maxRangeMm);
  return {
    x: layout.sx + (mmX * layout.rightX + mmY * layout.forwardX) * layout.scale,
    y: layout.sy + (mmX * layout.rightY + mmY * layout.forwardY) * layout.scale,
  };
}

/**
 * Convert canvas pixel coordinates back to radar mm coordinates.
 */
export function canvasToMm(
  px: number,
  py: number,
  canvasWidth: number,
  canvasHeight: number,
  maxRangeMm: number,
  sensorMargin = 40,
  sensorPosition: SensorPosition = 'bottom'
): Point {
  const layout = getSensorLayout(sensorPosition, canvasWidth, canvasHeight, sensorMargin, maxRangeMm);
  const dx = (px - layout.sx) / layout.scale;
  const dy = (py - layout.sy) / layout.scale;
  // Inverse of the orthogonal rotation matrix (transpose)
  return {
    x: dx * layout.rightX + dy * layout.rightY,
    y: dx * layout.forwardX + dy * layout.forwardY,
  };
}

/**
 * Get scale factor (pixels per mm) for current canvas size and sensor position.
 */
export function getScale(
  canvasHeight: number,
  maxRangeMm: number,
  sensorMargin = 40,
  sensorPosition: SensorPosition = 'bottom',
  canvasWidth = 0
): number {
  const layout = getSensorLayout(sensorPosition, canvasWidth, canvasHeight, sensorMargin, maxRangeMm);
  return layout.scale;
}

/**
 * Compute the centroid of a polygon.
 */
export function polygonCentroid(vertices: Point[]): Point {
  if (vertices.length === 0) return { x: 0, y: 0 };
  const sum = vertices.reduce((acc, v) => ({ x: acc.x + v.x, y: acc.y + v.y }), { x: 0, y: 0 });
  return { x: sum.x / vertices.length, y: sum.y / vertices.length };
}

/**
 * Snap a value to a grid.
 */
export function snapToGrid(value: number, gridSize: number): number {
  return Math.round(value / gridSize) * gridSize;
}

/**
 * Clamp a value between min and max.
 */
export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Translate a polygon's vertices by a delta.
 */
export function translatePolygon(vertices: Point[], dx: number, dy: number): Point[] {
  return vertices.map(v => ({ x: v.x + dx, y: v.y + dy }));
}

/**
 * Check if a point is near another point within a given radius.
 */
export function pointNear(a: Point, b: Point, radius: number): boolean {
  return distance(a, b) <= radius;
}

/**
 * Find the closest point on a line segment to a given point.
 * Returns the t parameter (0-1) along the segment and the closest point.
 */
export function closestPointOnSegment(
  p: Point,
  a: Point,
  b: Point
): { t: number; point: Point; dist: number } {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return { t: 0, point: a, dist: distance(p, a) };
  const t = clamp(((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq, 0, 1);
  const point = { x: a.x + t * dx, y: a.y + t * dy };
  return { t, point, dist: distance(p, point) };
}

/**
 * Convert degrees to radians.
 */
export function degToRad(deg: number): number {
  return (deg * Math.PI) / 180;
}
