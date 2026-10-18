import type maplibregl from "maplibre-gl";

/**
 * Optional Mapbox integration. Set VITE_MAPBOX_TOKEN (a public pk.* token,
 * restricted to your domains in the Mapbox dashboard) to get:
 *   - Mapbox satellite imagery instead of Esri
 *   - Mapbox Geocoding v6 instead of Photon/Nominatim
 *   - Mapbox Tilequery (OSM buildings from the Streets tileset) instead of
 *     Overpass for footprint detection, with Overpass as a fallback
 * Without a token everything falls back to the free OSM-based providers.
 */
export const MAPBOX_TOKEN: string | undefined = import.meta.env.VITE_MAPBOX_TOKEN || undefined;
export const hasMapbox = Boolean(MAPBOX_TOKEN);

export const ESRI_SATELLITE_STYLE: maplibregl.StyleSpecification = {
  version: 8,
  glyphs: "https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf",
  sources: {
    esri: {
      type: "raster",
      tiles: ["https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"],
      tileSize: 256,
      maxzoom: 20,
      attribution: "Imagery © Esri, Maxar, Earthstar Geographics, and the GIS User Community",
    },
  },
  layers: [{ id: "satellite", type: "raster", source: "esri" }],
};

export function mapboxSatelliteStyle(token: string): maplibregl.StyleSpecification {
  return {
    version: 8,
    glyphs: "https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf",
    sources: {
      mapbox: {
        type: "raster",
        tiles: [`https://api.mapbox.com/v4/mapbox.satellite/{z}/{x}/{y}@2x.jpg90?access_token=${token}`],
        tileSize: 512,
        maxzoom: 22,
        attribution:
          '<a href="https://www.mapbox.com/about/maps/" target="_blank">© Mapbox</a> <a href="https://www.openstreetmap.org/copyright" target="_blank">© OpenStreetMap</a> <a href="https://www.mapbox.com/map-feedback/" target="_blank">Improve this map</a>',
      },
    },
    layers: [{ id: "satellite", type: "raster", source: "mapbox" }],
  };
}

/** The satellite style to use for every map in the app. */
export const SATELLITE_STYLE: maplibregl.StyleSpecification = MAPBOX_TOKEN ? mapboxSatelliteStyle(MAPBOX_TOKEN) : ESRI_SATELLITE_STYLE;

export const IMAGERY_PROVIDER = hasMapbox ? "Mapbox" : "Esri";
