import type { StyleSpecification } from "maplibre-gl";

export const ESRI_SATELLITE_STYLE: StyleSpecification = {
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

export function mapboxSatelliteStyle(token: string): StyleSpecification {
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

/** Satellite style for a given (optional) Mapbox token. */
export function satelliteStyle(mapboxToken?: string): StyleSpecification {
  return mapboxToken ? mapboxSatelliteStyle(mapboxToken) : ESRI_SATELLITE_STYLE;
}
