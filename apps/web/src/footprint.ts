import { centroidLngLat, geoDistanceFeet, pointInPolygon, type LngLat } from "@roof-estimator/core";

export interface Footprint {
  id: string;
  polygon: LngLat[];
  tags: Record<string, string>;
  source: "osm";
}

const OVERPASS_ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
];

interface OverpassWay {
  type: "way";
  id: number;
  tags?: Record<string, string>;
  geometry: { lat: number; lon: number }[];
}

/** In-memory cache so re-detecting at the same spot is instant. */
const cache = new Map<string, Footprint[]>();

/**
 * Fetch building footprints near a point from OpenStreetMap via Overpass.
 * All mirrors are queried in parallel and the first good answer wins, since
 * individual Overpass servers often queue requests for several seconds.
 * Returns the building containing the point first, then others by distance.
 */
export async function fetchFootprints(at: LngLat, radiusM = 40, timeoutMs = 12000): Promise<Footprint[]> {
  const key = `${at.lat.toFixed(5)},${at.lng.toFixed(5)},${radiusM}`;
  const hit = cache.get(key);
  if (hit) return hit;

  const query = `[out:json][timeout:10];way["building"](around:${radiusM},${at.lat},${at.lng});out geom;`;
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
    throw new Error(`Could not reach OpenStreetMap (${first?.name === "AbortError" ? "timed out" : first?.message ?? "unknown error"}). Try again or draw the roof manually.`);
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
    .filter((f) => f.polygon.length >= 3)
    .sort((a, b) => {
      const ia = pointInPolygon(at, a.polygon) ? 0 : 1;
      const ib = pointInPolygon(at, b.polygon) ? 0 : 1;
      if (ia !== ib) return ia - ib;
      return geoDistanceFeet(at, centroidLngLat(a.polygon)) - geoDistanceFeet(at, centroidLngLat(b.polygon));
    });
  cache.set(key, fps);
  return fps;
}
