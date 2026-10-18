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

/**
 * Fetch building footprints near a point from OpenStreetMap via Overpass.
 * Returns the building containing the point first, then others by distance.
 */
export async function fetchFootprints(at: LngLat, radiusM = 40): Promise<Footprint[]> {
  const query = `[out:json][timeout:25];way["building"](around:${radiusM},${at.lat},${at.lng});out geom;`;
  let lastErr: unknown;
  for (const endpoint of OVERPASS_ENDPOINTS) {
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: `data=${encodeURIComponent(query)}`,
      });
      if (!res.ok) throw new Error(`Overpass ${res.status}`);
      const json = (await res.json()) as { elements: OverpassWay[] };
      const fps: Footprint[] = json.elements
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
      return fps.sort((a, b) => {
        const ia = pointInPolygon(at, a.polygon) ? 0 : 1;
        const ib = pointInPolygon(at, b.polygon) ? 0 : 1;
        if (ia !== ib) return ia - ib;
        return geoDistanceFeet(at, centroidLngLat(a.polygon)) - geoDistanceFeet(at, centroidLngLat(b.polygon));
      });
    } catch (err) {
      lastErr = err;
    }
  }
  throw new Error(`Could not reach OpenStreetMap: ${(lastErr as Error)?.message ?? "unknown error"}`);
}
