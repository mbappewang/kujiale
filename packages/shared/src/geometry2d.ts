export interface Point2D {
  x: number;
  z: number;
}

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface BoundingBox2D {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  width: number;
  depth: number;
}

export interface OrientedBox2D {
  center: Point2D;
  halfWidth: number;
  halfDepth: number;
  rotationY: number; // radians around Y axis
}

export function mmToMetres(mm: number): number {
  return mm / 1000;
}

export function metresToMm(metres: number): number {
  return Math.round(metres * 1000);
}

export function pixelsToMetres(px: number, pixelsPerMeter: number): number {
  if (pixelsPerMeter <= 0) throw new Error('pixelsPerMeter must be positive');
  return px / pixelsPerMeter;
}

export function metresToPixels(metres: number, pixelsPerMeter: number): number {
  if (pixelsPerMeter <= 0) throw new Error('pixelsPerMeter must be positive');
  return metres * pixelsPerMeter;
}

export function degToRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

export function radToDeg(rad: number): number {
  return (rad * 180) / Math.PI;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function distance2D(a: Point2D, b: Point2D): number {
  return Math.hypot(b.x - a.x, b.z - a.z);
}

export function lerpPoint2D(a: Point2D, b: Point2D, t: number): Point2D {
  return {
    x: a.x + (b.x - a.x) * t,
    z: a.z + (b.z - a.z) * t,
  };
}

export function wallDirection(start: Point2D, end: Point2D): Point2D {
  const len = distance2D(start, end);
  if (len < 1e-6) return { x: 1, z: 0 };
  return { x: (end.x - start.x) / len, z: (end.z - start.z) / len };
}

/**
 * Left-hand perpendicular normal in XZ plane (for consistent wall offset sides).
 */
export function wallNormal(start: Point2D, end: Point2D): Point2D {
  const dir = wallDirection(start, end);
  return { x: -dir.z, z: dir.x };
}

export function projectPointOnSegment(p: Point2D, a: Point2D, b: Point2D): {
  point: Point2D;
  t: number;
  distance: number;
} {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const lenSq = dx * dx + dz * dz;
  if (lenSq < 1e-9) {
    return { point: { ...a }, t: 0, distance: distance2D(p, a) };
  }
  const t = clamp(((p.x - a.x) * dx + (p.z - a.z) * dz) / lenSq, 0, 1);
  const point = { x: a.x + dx * t, z: a.z + dz * t };
  return { point, t, distance: distance2D(p, point) };
}

/**
 * Infinite 2D line-line intersection (p1 + u*d1 = p2 + v*d2).
 * Returns null when parallel or nearly parallel.
 */
export function lineIntersection2D(
  p1: Point2D,
  d1: Point2D,
  p2: Point2D,
  d2: Point2D,
): Point2D | null {
  const cross = d1.x * d2.z - d1.z * d2.x;
  if (Math.abs(cross) < 1e-4) return null;
  const dx = p2.x - p1.x;
  const dz = p2.z - p1.z;
  const u = (dx * d2.z - dz * d2.x) / cross;
  return {
    x: p1.x + d1.x * u,
    z: p1.z + d1.z * u,
  };
}

export function polygonAreaSqm(polygon: readonly Point2D[]): number {
  if (polygon.length < 3) return 0;
  let sum = 0;
  for (let i = 0; i < polygon.length; i++) {
    const curr = polygon[i]!;
    const next = polygon[(i + 1) % polygon.length]!;
    sum += curr.x * next.z - next.x * curr.z;
  }
  return Math.abs(sum) * 0.5;
}

export function polygonCentroid(polygon: readonly Point2D[]): Point2D {
  if (polygon.length === 0) return { x: 0, z: 0 };
  let signedArea = 0;
  let cx = 0;
  let cz = 0;
  for (let i = 0; i < polygon.length; i++) {
    const p0 = polygon[i]!;
    const p1 = polygon[(i + 1) % polygon.length]!;
    const cross = p0.x * p1.z - p1.x * p0.z;
    signedArea += cross;
    cx += (p0.x + p1.x) * cross;
    cz += (p0.z + p1.z) * cross;
  }
  if (Math.abs(signedArea) < 1e-6) {
    const avgX = polygon.reduce((acc, p) => acc + p.x, 0) / polygon.length;
    const avgZ = polygon.reduce((acc, p) => acc + p.z, 0) / polygon.length;
    return { x: avgX, z: avgZ };
  }
  const factor = 1 / (3 * signedArea);
  return { x: cx * factor, z: cz * factor };
}

export function polygonBounds(polygon: readonly Point2D[]): BoundingBox2D {
  if (polygon.length === 0) {
    return { minX: 0, maxX: 0, minZ: 0, maxZ: 0, width: 0, depth: 0 };
  }
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const p of polygon) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.z < minZ) minZ = p.z;
    if (p.z > maxZ) maxZ = p.z;
  }
  return { minX, maxX, minZ, maxZ, width: maxX - minX, depth: maxZ - minZ };
}

export function pointInPolygon(point: Point2D, polygon: readonly Point2D[]): boolean {
  if (polygon.length < 3) return false;
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const pi = polygon[i]!;
    const pj = polygon[j]!;
    const intersect =
      pi.z > point.z !== pj.z > point.z &&
      point.x < ((pj.x - pi.x) * (point.z - pi.z)) / (pj.z - pi.z + 1e-12) + pi.x;
    if (intersect) inside = !inside;
  }
  return inside;
}

export function obbCorners2D(obb: OrientedBox2D): [Point2D, Point2D, Point2D, Point2D] {
  const cos = Math.cos(obb.rotationY);
  const sin = Math.sin(obb.rotationY);
  // In Y-up right-handed coords: local +X -> (cos, -sin), local +Z -> (sin, cos)
  const ux = { x: cos, z: -sin };
  const uz = { x: sin, z: cos };
  const hw = obb.halfWidth;
  const hd = obb.halfDepth;
  return [
    { x: obb.center.x - ux.x * hw - uz.x * hd, z: obb.center.z - ux.z * hw - uz.z * hd },
    { x: obb.center.x + ux.x * hw - uz.x * hd, z: obb.center.z + ux.z * hw - uz.z * hd },
    { x: obb.center.x + ux.x * hw + uz.x * hd, z: obb.center.z + ux.z * hw + uz.z * hd },
    { x: obb.center.x - ux.x * hw + uz.x * hd, z: obb.center.z - ux.z * hw + uz.z * hd },
  ];
}

function projectPolygonOnAxis(corners: readonly Point2D[], axis: Point2D): [number, number] {
  let min = Infinity;
  let max = -Infinity;
  for (const c of corners) {
    const proj = c.x * axis.x + c.z * axis.z;
    if (proj < min) min = proj;
    if (proj > max) max = proj;
  }
  return [min, max];
}

/**
 * 2D Separating Axis Theorem (SAT) overlap test for two OrientedBox2D shapes.
 */
export function obbOverlap2D(a: OrientedBox2D, b: OrientedBox2D, clearance = 0): boolean {
  const expandedA: OrientedBox2D = {
    ...a,
    halfWidth: a.halfWidth + clearance * 0.5,
    halfDepth: a.halfDepth + clearance * 0.5,
  };
  const expandedB: OrientedBox2D = {
    ...b,
    halfWidth: b.halfWidth + clearance * 0.5,
    halfDepth: b.halfDepth + clearance * 0.5,
  };
  const ca = obbCorners2D(expandedA);
  const cb = obbCorners2D(expandedB);
  const axes: Point2D[] = [
    wallDirection(ca[0], ca[1]),
    wallDirection(ca[1], ca[2]),
    wallDirection(cb[0], cb[1]),
    wallDirection(cb[1], cb[2]),
  ];
  for (const axis of axes) {
    const [minA, maxA] = projectPolygonOnAxis(ca, axis);
    const [minB, maxB] = projectPolygonOnAxis(cb, axis);
    if (maxA <= minB + 1e-5 || maxB <= minA + 1e-5) {
      return false;
    }
  }
  return true;
}

/**
 * Push a moving circle of radius `radius` out of a thickened line segment (capsule).
 * Enables smooth wall-sliding during First-Person Walkthrough.
 */
export function circleVsSegmentPushback(
  center: Point2D,
  radius: number,
  segA: Point2D,
  segB: Point2D,
  segHalfThickness: number,
): Point2D {
  const proj = projectPointOnSegment(center, segA, segB);
  const minDist = radius + segHalfThickness;
  if (proj.distance >= minDist) return center;
  if (proj.distance < 1e-6) {
    const n = wallNormal(segA, segB);
    return { x: proj.point.x + n.x * minDist, z: proj.point.z + n.z * minDist };
  }
  const dx = (center.x - proj.point.x) / proj.distance;
  const dz = (center.z - proj.point.z) / proj.distance;
  return {
    x: proj.point.x + dx * minDist,
    z: proj.point.z + dz * minDist,
  };
}
