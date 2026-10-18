/**
 * Spatial tiling shared by the seed script and the worker.
 *
 * Buildings are bucketed into Web Mercator XYZ tiles at TILE_ZOOM. At zoom 15
 * a tile is ~1.07 km wide at Orlando's latitude, which keeps most tiles under
 * a few hundred buildings (tens of KB) and well under KV's 25 MB value limit.
 */
export const TILE_ZOOM = 15;

/** A footprint as stored in KV: id and a ring of [lng, lat] pairs. */
export type StoredFootprint = [id: string, ring: [number, number][]];

export function lngLatToTile(lng: number, lat: number, z = TILE_ZOOM): { x: number; y: number } {
  const n = 2 ** z;
  const x = Math.floor(((lng + 180) / 360) * n);
  const latRad = (lat * Math.PI) / 180;
  const y = Math.floor(((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n);
  return { x: Math.min(Math.max(x, 0), n - 1), y: Math.min(Math.max(y, 0), n - 1) };
}

export function tileKey(x: number, y: number, z = TILE_ZOOM): string {
  return `t/${z}/${x}/${y}`;
}

/** Bounds of a tile in degrees: [west, south, east, north]. */
export function tileBounds(x: number, y: number, z = TILE_ZOOM): [number, number, number, number] {
  const n = 2 ** z;
  const west = (x / n) * 360 - 180;
  const east = ((x + 1) / n) * 360 - 180;
  const latFromY = (yy: number) => (Math.atan(Math.sinh(Math.PI * (1 - (2 * yy) / n))) * 180) / Math.PI;
  return [west, latFromY(y + 1), east, latFromY(y)];
}

const EARTH_RADIUS_M = 6378137;

export function haversineM(lng1: number, lat1: number, lng2: number, lat2: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h));
}

/**
 * Tile keys to read for a radius query: the containing tile plus any
 * neighbor the circle spills into.
 */
export function tilesForRadius(lng: number, lat: number, radiusM: number, z = TILE_ZOOM): string[] {
  const dLat = (radiusM / EARTH_RADIUS_M) * (180 / Math.PI);
  const dLng = dLat / Math.cos((lat * Math.PI) / 180);
  const a = lngLatToTile(lng - dLng, lat + dLat, z);
  const b = lngLatToTile(lng + dLng, lat - dLat, z);
  const keys: string[] = [];
  for (let x = a.x; x <= b.x; x++) for (let y = a.y; y <= b.y; y++) keys.push(tileKey(x, y, z));
  return keys;
}

export function ringCentroid(ring: [number, number][]): [number, number] {
  let lng = 0;
  let lat = 0;
  for (const [a, b] of ring) {
    lng += a;
    lat += b;
  }
  return [lng / ring.length, lat / ring.length];
}

export function pointInRing(lng: number, lat: number, ring: [number, number][]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]!;
    const [xj, yj] = ring[j]!;
    if (yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
