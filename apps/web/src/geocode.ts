import type { LngLat } from "@roof-estimator/core";

export interface GeocodeResult {
  displayName: string;
  center: LngLat;
}

/**
 * Address search via OpenStreetMap Nominatim. Fine for interactive use; respect
 * their usage policy (≤ 1 req/s, identify your app) if you self-host this.
 */
export async function geocode(query: string): Promise<GeocodeResult[]> {
  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("q", query);
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("limit", "5");
  const res = await fetch(url.toString(), { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`Geocoding failed: ${res.status}`);
  const rows = (await res.json()) as { display_name: string; lat: string; lon: string }[];
  return rows.map((r) => ({ displayName: r.display_name, center: { lng: Number(r.lon), lat: Number(r.lat) } }));
}
