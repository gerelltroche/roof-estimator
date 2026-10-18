import { centroidLngLat, geoDistanceFeet, pointInPolygon, type LngLat } from "@roof-estimator/core";
import { VectorTile } from "@mapbox/vector-tile";
import { PbfReader } from "pbf";

export interface Footprint {
  id: string;
  polygon: LngLat[];
  tags: Record<string, string>;
  source: "mapbox";
}

export interface FootprintLookup {
  footprints: Footprint[];
  /** Which provider answered. */
  provider: "mapbox" | "cache";
  /** Wall-clock time for the lookup, ms. */
  ms: number;
}

export interface FootprintOptions {
  /** Public Mapbox token. Required: footprints come from Mapbox Streets vector tiles. */
  mapboxToken?: string;
  /** Search radius around the point, metres. */
  radiusM?: number;
  timeoutMs?: number;
}

/** In-memory cache so re-detecting at the same spot is instant. */
const cache = new Map<string, Footprint[]>();
const inflight = new Map<string, Promise<FootprintLookup>>();

/**
 * Start a lookup without waiting for it. Called right after geocoding so
 * the result is usually cached by the time the user clicks "Detect roof".
 */
export function prefetchFootprints(at: LngLat, opts: FootprintOptions = {}): void {
  void fetchFootprints(at, opts).catch(() => {
    /* best effort */
  });
}

function sortByHit(at: LngLat, fps: Footprint[]): Footprint[] {
  return fps.sort((a, b) => {
    const ia = pointInPolygon(at, a.polygon) ? 0 : 1;
    const ib = pointInPolygon(at, b.polygon) ? 0 : 1;
    if (ia !== ib) return ia - ib;
    return geoDistanceFeet(at, centroidLngLat(a.polygon)) - geoDistanceFeet(at, centroidLngLat(b.polygon));
  });
}

/**
 * Mapbox Streets v8 vector tiles carry OSM building polygons in their
 * `building` layer. We fetch the single tile covering the point and decode
 * it client-side: one ~50 KB request.
 *
 * (Mapbox's Tilequery API cannot do this: its `geometry=polygon` parameter
 * is a filter, and it always returns a point per feature.)
 *
 * Vector tiles clip geometry at the tile buffer, so a building straddling a
 * tile edge comes back cut. If the chosen polygon reaches outside the tile
 * we retry one zoom level out (whose edges are a subset of this zoom's), and
 * if that still fails we give up and the user draws it.
 */
async function mapboxFootprints(at: LngLat, radiusM: number, token: string, timeoutMs: number): Promise<Footprint[]> {
  let lastErr: Error | null = null;
  for (const z of [16, 15, 14]) {
    try {
      const fps = await footprintsFromTile(at, radiusM, z, token, timeoutMs);
      if (fps.length) return fps;
      lastErr = new Error(`no building within ${radiusM} m at z${z}`);
    } catch (err) {
      lastErr = err as Error;
      if (lastErr.name === "AbortError" || /HTTP/.test(lastErr.message)) throw lastErr;
    }
  }
  throw lastErr ?? new Error("no building found");
}

async function footprintsFromTile(at: LngLat, radiusM: number, z: number, token: string, timeoutMs: number): Promise<Footprint[]> {
  const { x, y, bounds } = tileFor(at, z);
  const url = `https://api.mapbox.com/v4/mapbox.mapbox-streets-v8/${z}/${x}/${y}.vector.pbf?access_token=${token}`;
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctl.signal });
    if (!res.ok) throw new Error(`Mapbox tile HTTP ${res.status}`);
    // pbf v5 renamed its class; the vector-tile typings still name the old one.
    const tile = new VectorTile(new PbfReader(await res.arrayBuffer()) as unknown as ConstructorParameters<typeof VectorTile>[0]);
    const layer = tile.layers.building;
    if (!layer) return [];
    const radiusFt = radiusM * 3.28084;
    const fps: Footprint[] = [];
    for (let i = 0; i < layer.length; i++) {
      const f = layer.feature(i);
      const g = f.toGeoJSON(x, y, z).geometry;
      const rings: number[][][] = g.type === "Polygon" ? [g.coordinates[0]!] : g.type === "MultiPolygon" ? g.coordinates.map((p) => p[0]!) : [];
      for (const ring of rings) {
        const polygon = ring.map(([lng, lat]) => ({ lng: lng!, lat: lat! }));
        if (polygon.length > 1) {
          const a = polygon[0]!;
          const b = polygon[polygon.length - 1]!;
          if (a.lng === b.lng && a.lat === b.lat) polygon.pop();
        }
        if (polygon.length < 3) continue;
        if (!pointInPolygon(at, polygon) && geoDistanceFeet(at, centroidLngLat(polygon)) > radiusFt) continue;
        fps.push({ id: `mapbox-${z}-${f.id ?? i}`, polygon, tags: f.properties as Record<string, string>, source: "mapbox" });
      }
    }
    sortByHit(at, fps);
    const best = fps[0];
    if (best && extendsOutsideTile(best.polygon, bounds)) throw new Error(`building clipped at z${z} tile edge`);
    return fps;
  } finally {
    clearTimeout(timer);
  }
}

function tileFor(p: LngLat, z: number) {
  const n = 2 ** z;
  const x = Math.floor(((p.lng + 180) / 360) * n);
  const latRad = (p.lat * Math.PI) / 180;
  const y = Math.floor(((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n);
  const lng0 = (x / n) * 360 - 180;
  const lng1 = ((x + 1) / n) * 360 - 180;
  const latOf = (yy: number) => (Math.atan(Math.sinh(Math.PI * (1 - (2 * yy) / n))) * 180) / Math.PI;
  return { x, y, bounds: { lng0, lng1, lat0: latOf(y + 1), lat1: latOf(y) } };
}

/** True if any vertex lies outside (or exactly on) the tile's own bounds, i.e. in the buffer where clipping happens. */
function extendsOutsideTile(poly: LngLat[], b: { lng0: number; lng1: number; lat0: number; lat1: number }): boolean {
  const eps = 1e-7;
  return poly.some((p) => p.lng <= b.lng0 + eps || p.lng >= b.lng1 - eps || p.lat <= b.lat0 + eps || p.lat >= b.lat1 - eps);
}

/**
 * Fetch OSM building footprints near a point (via Mapbox Streets vector
 * tiles). Returns the building containing the point first, then others by
 * distance. Results are cached and in-flight lookups deduplicated.
 */
export function fetchFootprints(at: LngLat, opts: FootprintOptions = {}): Promise<FootprintLookup> {
  const radiusM = opts.radiusM ?? 40;
  const timeoutMs = opts.timeoutMs ?? 10000;
  const key = `${at.lat.toFixed(5)},${at.lng.toFixed(5)},${radiusM}`;
  const hit = cache.get(key);
  if (hit) return Promise.resolve({ footprints: hit, provider: "cache", ms: 0 });
  const pending = inflight.get(key);
  if (pending) return pending;
  const p = lookup(at, radiusM, timeoutMs, key, opts.mapboxToken).finally(() => inflight.delete(key));
  inflight.set(key, p);
  return p;
}

async function lookup(at: LngLat, radiusM: number, timeoutMs: number, key: string, token?: string): Promise<FootprintLookup> {
  if (!token) {
    throw new Error("Automatic roof detection needs a Mapbox token. Draw the roof manually instead.");
  }
  const t0 = performance.now();
  try {
    const fps = await mapboxFootprints(at, radiusM, token, timeoutMs);
    cache.set(key, fps);
    const ms = performance.now() - t0;
    console.info(`[footprint] Mapbox vector tile: ${fps.length} buildings in ${ms.toFixed(0)} ms`);
    return { footprints: fps, provider: "mapbox", ms };
  } catch (err) {
    const e = err as Error;
    const why = e.name === "AbortError" ? "timed out" : e.message;
    console.warn(`[footprint] Mapbox vector tile failed after ${(performance.now() - t0).toFixed(0)} ms:`, err);
    throw new Error(`Couldn't find the building footprint (${why}). Try again, or draw the roof manually.`);
  }
}
