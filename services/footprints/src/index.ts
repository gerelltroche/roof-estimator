import { haversineM, pointInRing, ringCentroid, tilesForRadius, type StoredFootprint } from "./tiles";

export interface Env {
  FOOTPRINTS: KVNamespace;
  ALLOWED_ORIGINS: string;
  OVERPASS_FALLBACK: string;
}

interface FootprintOut {
  id: string;
  polygon: { lng: number; lat: number }[];
  source: "overture" | "osm";
  contains: boolean;
  distanceM: number;
}

const OVERPASS = ["https://overpass-api.de/api/interpreter", "https://overpass.kumi.systems/api/interpreter"];

function cors(env: Env, req: Request): Record<string, string> {
  const origin = req.headers.get("Origin") ?? "";
  const allowed = env.ALLOWED_ORIGINS.split(",").map((s) => s.trim());
  const ok = allowed.includes("*") || allowed.includes(origin);
  return {
    "Access-Control-Allow-Origin": ok ? (allowed.includes("*") ? "*" : origin) : "null",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

function json(body: unknown, status: number, headers: Record<string, string>): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...headers } });
}

async function fromKV(env: Env, lng: number, lat: number, radiusM: number): Promise<{ found: boolean; results: FootprintOut[] }> {
  const keys = tilesForRadius(lng, lat, radiusM);
  const tiles = await Promise.all(keys.map((k) => env.FOOTPRINTS.get<StoredFootprint[]>(k, "json")));
  // Distinguish "tile exists but empty" from "area never seeded".
  const seeded = tiles.some((t) => t !== null);
  const results: FootprintOut[] = [];
  for (const tile of tiles) {
    if (!tile) continue;
    for (const [id, ring] of tile) {
      const [clng, clat] = ringCentroid(ring);
      const contains = pointInRing(lng, lat, ring);
      const d = haversineM(lng, lat, clng, clat);
      if (!contains && d > radiusM + 60) continue;
      results.push({ id, polygon: ring.map(([a, b]) => ({ lng: a, lat: b })), source: "overture", contains, distanceM: d });
    }
  }
  return { found: seeded, results };
}

async function fromOverpass(lng: number, lat: number, radiusM: number): Promise<FootprintOut[]> {
  const query = `[out:json][timeout:10];way["building"](around:${radiusM},${lat},${lng});out geom;`;
  const attempts = OVERPASS.map(async (endpoint) => {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: `data=${encodeURIComponent(query)}`,
      signal: AbortSignal.timeout(12000),
    });
    if (!res.ok) throw new Error(`overpass ${res.status}`);
    return (await res.json()) as { elements: { type: string; id: number; geometry?: { lat: number; lon: number }[] }[] };
  });
  const data = await Promise.any(attempts);
  return data.elements
    .filter((e) => e.type === "way" && (e.geometry?.length ?? 0) >= 4)
    .map((w) => {
      const ring = w.geometry!.map((g) => [g.lon, g.lat] as [number, number]);
      if (ring.length > 1 && ring[0]![0] === ring[ring.length - 1]![0] && ring[0]![1] === ring[ring.length - 1]![1]) ring.pop();
      const [clng, clat] = ringCentroid(ring);
      return {
        id: `osm-${w.id}`,
        polygon: ring.map(([a, b]) => ({ lng: a, lat: b })),
        source: "osm" as const,
        contains: pointInRing(lng, lat, ring),
        distanceM: haversineM(lng, lat, clng, clat),
      };
    });
}

export default {
  async fetch(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const headers = cors(env, req);
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers });
    const url = new URL(req.url);

    if (url.pathname === "/health") return json({ ok: true }, 200, headers);

    if (url.pathname !== "/footprints") return json({ error: "Use GET /footprints?lat=&lng=&r=40" }, 404, headers);

    const lat = Number(url.searchParams.get("lat"));
    const lng = Number(url.searchParams.get("lng"));
    const radiusM = Math.min(Math.max(Number(url.searchParams.get("r") ?? 40), 5), 200);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
      return json({ error: "lat and lng are required" }, 400, headers);
    }

    // Edge cache: identical lookups (same rounded coords) for a day.
    const cacheKey = new Request(`${url.origin}/footprints?lat=${lat.toFixed(5)}&lng=${lng.toFixed(5)}&r=${radiusM}`);
    const cache = caches.default;
    const hit = await cache.match(cacheKey);
    if (hit) {
      const r = new Response(hit.body, hit);
      for (const [k, v] of Object.entries(headers)) r.headers.set(k, v);
      r.headers.set("X-Cache", "HIT");
      return r;
    }

    let results: FootprintOut[];
    let source: "kv" | "overpass" | "none";
    const kv = await fromKV(env, lng, lat, radiusM);
    if (kv.found) {
      results = kv.results;
      source = "kv";
    } else if (env.OVERPASS_FALLBACK === "true") {
      try {
        results = await fromOverpass(lng, lat, radiusM);
        source = "overpass";
      } catch (err) {
        return json({ error: `Area not seeded and Overpass failed: ${(err as Error).message}` }, 502, headers);
      }
    } else {
      results = [];
      source = "none";
    }

    results.sort((a, b) => (a.contains === b.contains ? a.distanceM - b.distanceM : a.contains ? -1 : 1));
    const body = { source, count: results.length, footprints: results };
    const res = json(body, 200, { ...headers, "Cache-Control": "public, max-age=86400", "X-Cache": "MISS" });
    ctx.waitUntil(cache.put(cacheKey, res.clone()));
    return res;
  },
};
