import { centroidLngLat, geoDistanceFeet, pointInPolygon, type LngLat } from "@roof-estimator/core";
import { MAPBOX_TOKEN } from "./providers";

export interface Footprint {
  id: string;
  polygon: LngLat[];
  tags: Record<string, string>;
  source: "osm" | "mapbox";
}

export interface FootprintLookup {
  footprints: Footprint[];
  /** Which provider answered. */
  provider: "mapbox" | "overpass" | "cache";
  /** Wall-clock time for the lookup, ms. */
  ms: number;
  /** Providers that were tried and failed before the answer, if any. */
  skipped: string[];
}

/**
 * Overpass endpoints that send CORS headers. overpass-api.de, lz4 and z are
 * the official cluster (round-robin DNS resolves to the same pool; naming
 * them explicitly spreads the race). maps.mail.ru runs an independent
 * instance. kumi.systems and private.coffee were dropped: both returned
 * 500s without CORS headers in Oct 2026.
 */
const OVERPASS_ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://lz4.overpass-api.de/api/interpreter",
  "https://z.overpass-api.de/api/interpreter",
  "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
];

interface OverpassWay {
  type: "way";
  id: number;
  tags?: Record<string, string>;
  geometry: { lat: number; lon: number }[];
}

/** In-memory cache so re-detecting at the same spot is instant. */
const cache = new Map<string, Footprint[]>();
const inflight = new Map<string, Promise<FootprintLookup>>();

/**
 * Start a lookup without waiting for it. Called right after geocoding so
 * the result is usually cached by the time the user clicks "Detect roof".
 */
export function prefetchFootprints(at: LngLat, radiusM = 40): void {
  void fetchFootprints(at, radiusM).catch(() => {
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
 * Mapbox Tilequery against the Streets v8 tileset, whose `building` layer is
 * OSM buildings. One ~200 ms HTTP call, no Overpass queue. Buildings that
 * straddle a tile edge come back clipped, so a polygon with vertices on the
 * z16 tile boundary is rejected and the caller falls back to Overpass.
 */
async function mapboxFootprints(at: LngLat, radiusM: number, token: string, timeoutMs: number): Promise<Footprint[]> {
  const url = new URL(`https://api.mapbox.com/v4/mapbox.mapbox-streets-v8/tilequery/${at.lng},${at.lat}.json`);
  url.searchParams.set("layers", "building");
  url.searchParams.set("radius", String(radiusM));
  url.searchParams.set("geometry", "polygon");
  url.searchParams.set("limit", "10");
  url.searchParams.set("access_token", token);
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await fetch(url.toString(), { signal: ctl.signal });
    if (!res.ok) {
      let detail = "";
      try {
        detail = ((await res.json()) as { message?: string }).message ?? "";
      } catch {
        /* no body */
      }
      throw new Error(`Mapbox tilequery HTTP ${res.status}${detail ? ` (${detail})` : ""}`);
    }
    const json = (await res.json()) as {
      features: { id?: number; geometry: { type: string; coordinates: number[][][] }; properties: Record<string, string> }[];
    };
    if (!json.features?.length) throw new Error("Mapbox tilequery returned no buildings within " + radiusM + " m");
    const bounds = tileBoundsZ16(at);
    const fps: Footprint[] = [];
    for (const f of json.features) {
      if (f.geometry.type !== "Polygon") continue;
      const ring = f.geometry.coordinates[0] ?? [];
      const polygon = ring.map(([lng, lat]) => ({ lng: lng!, lat: lat! }));
      if (polygon.length > 1) {
        const a = polygon[0]!;
        const b = polygon[polygon.length - 1]!;
        if (a.lng === b.lng && a.lat === b.lat) polygon.pop();
      }
      if (polygon.length < 3) continue;
      fps.push({ id: `mapbox-${f.id ?? fps.length}`, polygon, tags: f.properties, source: "mapbox" });
    }
    sortByHit(at, fps);
    // Only the polygon we'd actually use matters; a clipped neighbor is irrelevant.
    const best = fps[0];
    if (best && touchesTileEdge(best.polygon, bounds)) throw new Error("building straddles a tile edge (clipped)");
    return fps;
  } finally {
    clearTimeout(timer);
  }
}

function tileBoundsZ16(p: LngLat) {
  const z = 16;
  const n = 2 ** z;
  const x = Math.floor(((p.lng + 180) / 360) * n);
  const latRad = (p.lat * Math.PI) / 180;
  const y = Math.floor(((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n);
  const lng0 = (x / n) * 360 - 180;
  const lng1 = ((x + 1) / n) * 360 - 180;
  const latOf = (yy: number) => (Math.atan(Math.sinh(Math.PI * (1 - (2 * yy) / n))) * 180) / Math.PI;
  return { lng0, lng1, lat0: latOf(y + 1), lat1: latOf(y) };
}

function touchesTileEdge(poly: LngLat[], b: ReturnType<typeof tileBoundsZ16>): boolean {
  const eps = 1e-6; // ~0.1 m
  return poly.some(
    (p) => Math.abs(p.lng - b.lng0) < eps || Math.abs(p.lng - b.lng1) < eps || Math.abs(p.lat - b.lat0) < eps || Math.abs(p.lat - b.lat1) < eps,
  );
}

/**
 * Fetch building footprints near a point from OpenStreetMap via Overpass.
 * All mirrors are queried in parallel and the first good answer wins, since
 * individual Overpass servers often queue requests for several seconds.
 * Returns the building containing the point first, then others by distance.
 */
export function fetchFootprints(at: LngLat, radiusM = 40, timeoutMs = 20000): Promise<FootprintLookup> {
  const key = `${at.lat.toFixed(5)},${at.lng.toFixed(5)},${radiusM}`;
  const hit = cache.get(key);
  if (hit) return Promise.resolve({ footprints: hit, provider: "cache", ms: 0, skipped: [] });
  const pending = inflight.get(key);
  if (pending) return pending;
  const p = lookup(at, radiusM, timeoutMs, key).finally(() => inflight.delete(key));
  inflight.set(key, p);
  return p;
}

async function lookup(at: LngLat, radiusM: number, timeoutMs: number, key: string): Promise<FootprintLookup> {
  const t0 = performance.now();
  const reasons: string[] = [];
  if (MAPBOX_TOKEN) {
    try {
      const fps = await mapboxFootprints(at, radiusM, MAPBOX_TOKEN, 10000);
      if (fps.length) {
        cache.set(key, fps);
        const ms = performance.now() - t0;
        console.info(`[footprint] Mapbox tilequery: ${fps.length} buildings in ${ms.toFixed(0)} ms`);
        return { footprints: fps, provider: "mapbox", ms, skipped: [] };
      }
      reasons.push("Mapbox: no usable building polygon");
    } catch (err) {
      const e = err as Error;
      reasons.push(`Mapbox: ${e.name === "AbortError" ? "timed out" : e.message}`);
      console.warn(`[footprint] Mapbox tilequery failed after ${(performance.now() - t0).toFixed(0)} ms, falling back to Overpass:`, err);
    }
  }

  const query = `[out:json][timeout:15];way["building"](around:${radiusM},${at.lat},${at.lng});out geom;`;
  const controllers = OVERPASS_ENDPOINTS.map(() => new AbortController());
  const attempts = OVERPASS_ENDPOINTS.map(async (endpoint, i) => {
    const ctl = controllers[i]!;
    const timer = setTimeout(() => ctl.abort(), timeoutMs);
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: `data=${encodeURIComponent(query)}`,
        signal: ctl.signal,
      });
      if (!res.ok) throw new Error(`Overpass ${res.status} from ${new URL(endpoint).host}`);
      const json = (await res.json()) as { elements: OverpassWay[] };
      if (!Array.isArray(json.elements)) throw new Error("Bad Overpass response");
      return json.elements;
    } finally {
      clearTimeout(timer);
    }
  });

  let elements: OverpassWay[];
  try {
    elements = await Promise.any(attempts);
  } catch (err) {
    const first = (err as AggregateError).errors?.[0] as Error | undefined;
    reasons.push(`OpenStreetMap: ${first?.name === "AbortError" ? "timed out" : first?.message ?? "unknown error"}`);
    throw new Error(`Couldn't find the building footprint.\n\n${reasons.join("\n")}\n\nTry again, or draw the roof manually.`);
  } finally {
    // Whichever finished first wins; cancel the rest so they don't keep loading.
    setTimeout(() => controllers.forEach((c) => c.abort()), 0);
  }

  const fps: Footprint[] = elements
    .filter((e) => e.type === "way" && e.geometry?.length >= 4)
    .map((w) => {
      const polygon = w.geometry.map((g) => ({ lng: g.lon, lat: g.lat }));
      if (polygon.length > 1) {
        const a = polygon[0]!;
        const b = polygon[polygon.length - 1]!;
        if (a.lng === b.lng && a.lat === b.lat) polygon.pop();
      }
      return { id: `osm-${w.id}`, polygon, tags: w.tags ?? {}, source: "osm" as const };
    })
    .filter((f) => f.polygon.length >= 3);
  sortByHit(at, fps);
  cache.set(key, fps);
  const ms = performance.now() - t0;
  console.info(`[footprint] Overpass: ${fps.length} buildings in ${ms.toFixed(0)} ms`);
  return { footprints: fps, provider: "overpass", ms, skipped: reasons };
}
