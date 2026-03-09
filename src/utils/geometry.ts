import type { Point } from '../types/index.js';

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
 * Convert radar millimeter coordinates to canvas pixel coordinates.
 * The sensor sits at the bottom-center of the canvas.
 * X: negative = left, positive = right
 * Y: 0 at sensor, increases away (up on screen)
 */
export function mmToCanvas(
  mmX: number,
  mmY: number,
  canvasWidth: number,
  canvasHeight: number,
  maxRangeMm: number,
  sensorMargin = 40
): Point {
  const sensorX = canvasWidth / 2;
  const sensorY = canvasHeight - sensorMargin;
  const usableHeight = canvasHeight - sensorMargin;
  const scale = usableHeight / maxRangeMm;
  return {
    x: sensorX + mmX * scale,
    y: sensorY - mmY * scale,
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
  sensorMargin = 40
): Point {
  const sensorX = canvasWidth / 2;
  const sensorY = canvasHeight - sensorMargin;
  const usableHeight = canvasHeight - sensorMargin;
  const scale = usableHeight / maxRangeMm;
  return {
    x: (px - sensorX) / scale,
    y: (sensorY - py) / scale,
  };
}

/**
 * Get scale factor (pixels per mm) for current canvas size.
 */
export function getScale(canvasHeight: number, maxRangeMm: number, sensorMargin = 40): number {
  return (canvasHeight - sensorMargin) / maxRangeMm;
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
