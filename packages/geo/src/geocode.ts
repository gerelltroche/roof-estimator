import type { LngLat } from "@roof-estimator/core";

export interface GeocodeResult {
  displayName: string;
  center: LngLat;
}

async function withTimeout(url: string, ms: number): Promise<Response> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  try {
    return await fetch(url, { headers: { Accept: "application/json" }, signal: ctl.signal });
  } finally {
    clearTimeout(t);
  }
}

async function nominatim(query: string): Promise<GeocodeResult[]> {
  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("q", query);
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("limit", "5");
  const res = await withTimeout(url.toString(), 8000);
  if (!res.ok) throw new Error(`Nominatim ${res.status}`);
  const rows = (await res.json()) as { display_name: string; lat: string; lon: string }[];
  return rows.map((r) => ({ displayName: r.display_name, center: { lng: Number(r.lon), lat: Number(r.lat) } }));
}

/** Photon (komoot) is an OSM-backed geocoder that is usually faster than Nominatim. */
async function photon(query: string): Promise<GeocodeResult[]> {
  const url = new URL("https://photon.komoot.io/api/");
  url.searchParams.set("q", query);
  url.searchParams.set("limit", "5");
  const res = await withTimeout(url.toString(), 8000);
  if (!res.ok) throw new Error(`Photon ${res.status}`);
  const json = (await res.json()) as {
    features: { geometry: { coordinates: [number, number] }; properties: Record<string, string | undefined> }[];
  };
  return json.features.map((f) => {
    const p = f.properties;
    const name = [
      [p.housenumber, p.street].filter(Boolean).join(" "),
      p.city ?? p.town ?? p.village,
      p.state,
      p.postcode,
    ]
      .filter(Boolean)
      .join(", ");
    return { displayName: name || p.name || query, center: { lng: f.geometry.coordinates[0], lat: f.geometry.coordinates[1] } };
  });
}

/** Mapbox Geocoding v6. Fast, US-biased, returns rooftop-accurate points for addresses. */
async function mapbox(query: string, token: string): Promise<GeocodeResult[]> {
  const url = new URL("https://api.mapbox.com/search/geocode/v6/forward");
  url.searchParams.set("q", query);
  url.searchParams.set("limit", "5");
  url.searchParams.set("country", "us");
  url.searchParams.set("types", "address");
  url.searchParams.set("access_token", token);
  const res = await withTimeout(url.toString(), 8000);
  if (!res.ok) throw new Error(`Mapbox geocoding ${res.status}`);
  const json = (await res.json()) as {
    features: { geometry: { coordinates: [number, number] }; properties: { full_address?: string; name?: string } }[];
  };
  return json.features.map((f) => ({
    displayName: f.properties.full_address ?? f.properties.name ?? query,
    center: { lng: f.geometry.coordinates[0], lat: f.geometry.coordinates[1] },
  }));
}

export interface GeocodeOptions {
  /** Public Mapbox token. With it, Mapbox Geocoding v6 is used; otherwise Photon/Nominatim. */
  mapboxToken?: string;
}

/**
 * Address search. With a Mapbox token, uses Mapbox; otherwise races Photon and Nominatim and returns whichever answers
 * first with at least one result.
 */
export async function geocode(query: string, opts: GeocodeOptions = {}): Promise<GeocodeResult[]> {
  if (opts.mapboxToken) {
    try {
      const r = await mapbox(query, opts.mapboxToken);
      if (r.length) return r;
    } catch (err) {
      console.warn("[geocode] Mapbox failed, falling back to OSM:", err);
    }
  }
  const attempts = [photon(query), nominatim(query)].map((p) =>
    p.then((r) => {
      if (!r.length) throw new Error("no results");
      return r;
    }),
  );
  try {
    return await Promise.any(attempts);
  } catch (err) {
    const errors = (err as AggregateError).errors as Error[];
    if (errors.every((e) => e.message === "no results")) return [];
    throw new Error("Address lookup failed. Check your connection and try again.");
  }
}
