import { satelliteStyle } from "@roof-estimator/geo";

/**
 * Optional Mapbox integration for the app. Set VITE_MAPBOX_TOKEN (a public
 * pk.* token, restricted to your domains in the Mapbox dashboard) to get
 * Mapbox satellite imagery, Mapbox Geocoding v6, and "Detect roof" (OSM
 * building polygons decoded from Mapbox Streets vector tiles). Without a
 * token, imagery and geocoding fall back to free providers and roofs are
 * drawn by hand.
 */
export const MAPBOX_TOKEN: string | undefined = import.meta.env.VITE_MAPBOX_TOKEN || undefined;
export const hasMapbox = Boolean(MAPBOX_TOKEN);
export const FOOTPRINTS_AVAILABLE = hasMapbox;
export const SATELLITE_STYLE = satelliteStyle(MAPBOX_TOKEN);
export const IMAGERY_PROVIDER = hasMapbox ? "Mapbox" : "Esri";
