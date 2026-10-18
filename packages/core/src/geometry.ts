import type { LngLat, XY } from "./types.js";

export const FEET_PER_METER = 3.280839895;
const EARTH_RADIUS_M = 6378137;

/**
 * Project geographic coordinates onto a local tangent plane (in feet) centered
 * on `origin`. For a residential roof (tens of meters across) the distortion of
 * an equirectangular projection is negligible (<0.01%).
 */
export function projectToLocalFeet(points: LngLat[], origin: LngLat): XY[] {
  const lat0 = (origin.lat * Math.PI) / 180;
  const cosLat = Math.cos(lat0);
  return points.map((p) => {
    const dLng = ((p.lng - origin.lng) * Math.PI) / 180;
    const dLat = ((p.lat - origin.lat) * Math.PI) / 180;
    return {
      x: dLng * cosLat * EARTH_RADIUS_M * FEET_PER_METER,
      y: dLat * EARTH_RADIUS_M * FEET_PER_METER,
    };
  });
}

export function centroidLngLat(points: LngLat[]): LngLat {
  if (points.length === 0) return { lng: 0, lat: 0 };
  let lng = 0;
  let lat = 0;
  for (const p of points) {
    lng += p.lng;
    lat += p.lat;
  }
  return { lng: lng / points.length, lat: lat / points.length };
}

/** Shoelace formula. Returns absolute area in the units of the input². */
export function polygonArea(points: XY[]): number {
  const n = points.length;
  if (n < 3) return 0;
  let sum = 0;
  for (let i = 0; i < n; i++) {
    const a = points[i]!;
    const b = points[(i + 1) % n]!;
    sum += a.x * b.y - b.x * a.y;
  }
  return Math.abs(sum) / 2;
}

/** Signed area; positive = counter-clockwise in a y-up frame. */
export function signedPolygonArea(points: XY[]): number {
  const n = points.length;
  if (n < 3) return 0;
  let sum = 0;
  for (let i = 0; i < n; i++) {
    const a = points[i]!;
    const b = points[(i + 1) % n]!;
    sum += a.x * b.y - b.x * a.y;
  }
  return sum / 2;
}

export function distance(a: XY, b: XY): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function polygonPerimeter(points: XY[]): number {
  const n = points.length;
  let sum = 0;
  for (let i = 0; i < n; i++) sum += distance(points[i]!, points[(i + 1) % n]!);
  return sum;
}

/** Great-circle distance in feet (haversine). Accurate enough for roof edges. */
export function geoDistanceFeet(a: LngLat, b: LngLat): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h)) * FEET_PER_METER;
}

/** Area of a geographic polygon in square feet, using a local projection. */
export function geoPolygonAreaSqFt(points: LngLat[]): number {
  if (points.length < 3) return 0;
  return polygonArea(projectToLocalFeet(points, centroidLngLat(points)));
}

/** True if two geographic points are within `tolFt` feet of each other. */
export function samePoint(a: LngLat, b: LngLat, tolFt = 1): boolean {
  return geoDistanceFeet(a, b) <= tolFt;
}

/** Build a rectangle (plan view) of w × h feet centered on an origin lng/lat. Handy for tests and demos. */
export function rectangleAt(origin: LngLat, widthFt: number, depthFt: number): LngLat[] {
  const lat0 = (origin.lat * Math.PI) / 180;
  const ftPerDegLat = (Math.PI / 180) * EARTH_RADIUS_M * FEET_PER_METER;
  const ftPerDegLng = ftPerDegLat * Math.cos(lat0);
  const hw = widthFt / 2 / ftPerDegLng;
  const hd = depthFt / 2 / ftPerDegLat;
  return [
    { lng: origin.lng - hw, lat: origin.lat - hd },
    { lng: origin.lng + hw, lat: origin.lat - hd },
    { lng: origin.lng + hw, lat: origin.lat + hd },
    { lng: origin.lng - hw, lat: origin.lat + hd },
  ];
}

/** Offset a lng/lat by dx (east) and dy (north) feet. */
export function offsetFeet(origin: LngLat, dxFt: number, dyFt: number): LngLat {
  const lat0 = (origin.lat * Math.PI) / 180;
  const ftPerDegLat = (Math.PI / 180) * EARTH_RADIUS_M * FEET_PER_METER;
  const ftPerDegLng = ftPerDegLat * Math.cos(lat0);
  return { lng: origin.lng + dxFt / ftPerDegLng, lat: origin.lat + dyFt / ftPerDegLat };
}
