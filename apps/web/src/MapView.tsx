import { geoDistanceFeet, measureRoof, type EdgeType, type LngLat } from "@roof-estimator/core";
import maplibregl, { type MapMouseEvent } from "maplibre-gl";
import { useEffect, useRef } from "react";
import type { Action, AppState } from "./state";

export const EDGE_COLORS: Record<EdgeType, string> = {
  eave: "#3b82f6",
  rake: "#22c55e",
  ridge: "#ef4444",
  hip: "#f97316",
  valley: "#a855f7",
  transition: "#eab308",
  wall: "#8b5cf6",
  parapet: "#14b8a6",
  unlabeled: "#9ca3af",
};

export interface MapHandle {
  flyTo(center: LngLat, zoom?: number): void;
  fitToRoof(): void;
  getCenter(): LngLat;
}

interface Props {
  state: AppState;
  dispatch: React.Dispatch<Action>;
  onReady?: (handle: MapHandle) => void;
}

export const SATELLITE_STYLE: maplibregl.StyleSpecification = {
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

const SNAP_PX = 10;

function buildGeoJSON(state: AppState) {
  const facets: GeoJSON.Feature[] = [];
  const edges: GeoJSON.Feature[] = [];
  const vertices: GeoJSON.Feature[] = [];
  const labels: GeoJSON.Feature[] = [];
  const report = state.model.facets.length ? measureRoof(state.model) : null;

  for (const f of state.model.facets) {
    const selected = state.selection.facetId === f.id;
    const ring = [...f.vertices, f.vertices[0]!].map((v) => [v.lng, v.lat]);
    facets.push({
      type: "Feature",
      properties: { facetId: f.id, selected, label: f.label ?? f.id, pitch: f.pitch },
      geometry: { type: "Polygon", coordinates: [ring] },
    });
    const fm = report?.facets.find((m) => m.id === f.id);
    // Facet label at centroid.
    const c = f.vertices.reduce((a, v) => ({ lng: a.lng + v.lng / f.vertices.length, lat: a.lat + v.lat / f.vertices.length }), {
      lng: 0,
      lat: 0,
    });
    labels.push({
      type: "Feature",
      properties: { text: `${f.label ?? f.id}\n${f.pitch}/12${fm ? ` · ${Math.round(fm.areaSqFt)} ft²` : ""}`, kind: "facet" },
      geometry: { type: "Point", coordinates: [c.lng, c.lat] },
    });
    f.vertices.forEach((v, i) => {
      const next = f.vertices[(i + 1) % f.vertices.length]!;
      const type = f.edges[i]?.type ?? "unlabeled";
      const edgeSelected = selected && state.selection.edgeIndex === i;
      edges.push({
        type: "Feature",
        properties: { facetId: f.id, edgeIndex: i, type, color: EDGE_COLORS[type], selected: edgeSelected },
        geometry: { type: "LineString", coordinates: [[v.lng, v.lat], [next.lng, next.lat]] },
      });
      const len = fm?.edges[i]?.lengthFt ?? geoDistanceFeet(v, next);
      labels.push({
        type: "Feature",
        properties: { text: `${len.toFixed(1)}'`, kind: "edge" },
        geometry: { type: "Point", coordinates: [(v.lng + next.lng) / 2, (v.lat + next.lat) / 2] },
      });
      vertices.push({
        type: "Feature",
        properties: { facetId: f.id, index: i, selected },
        geometry: { type: "Point", coordinates: [v.lng, v.lat] },
      });
    });
  }

  const draft: GeoJSON.Feature[] = [];
  if (state.draft.length) {
    draft.push({
      type: "Feature",
      properties: {},
      geometry: { type: "LineString", coordinates: state.draft.map((v) => [v.lng, v.lat]) },
    });
    for (const v of state.draft)
      draft.push({ type: "Feature", properties: {}, geometry: { type: "Point", coordinates: [v.lng, v.lat] } });
  }

  return {
    facets: { type: "FeatureCollection", features: facets } as GeoJSON.FeatureCollection,
    edges: { type: "FeatureCollection", features: edges } as GeoJSON.FeatureCollection,
    vertices: { type: "FeatureCollection", features: vertices } as GeoJSON.FeatureCollection,
    labels: { type: "FeatureCollection", features: labels } as GeoJSON.FeatureCollection,
    draft: { type: "FeatureCollection", features: draft } as GeoJSON.FeatureCollection,
  };
}

export function MapView({ state, dispatch, onReady }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const stateRef = useRef(state);
  stateRef.current = state;
  const dragRef = useRef<{ facetId: string; index: number } | null>(null);

  // Create the map once.
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: SATELLITE_STYLE,
      center: [-81.2, 28.55],
      zoom: 17,
      maxZoom: 22,
      doubleClickZoom: false,
      attributionControl: { compact: true },
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    map.addControl(new maplibregl.ScaleControl({ unit: "imperial" }), "bottom-left");
    mapRef.current = map;

    map.on("load", () => {
      const empty: GeoJSON.FeatureCollection = { type: "FeatureCollection", features: [] };
      for (const id of ["facets", "edges", "vertices", "labels", "draft"]) map.addSource(id, { type: "geojson", data: empty });

      map.addLayer({
        id: "facets-fill",
        type: "fill",
        source: "facets",
        paint: { "fill-color": "#ffffff", "fill-opacity": ["case", ["get", "selected"], 0.35, 0.18] },
      });
      map.addLayer({
        id: "edges-hit",
        type: "line",
        source: "edges",
        paint: { "line-color": "#000", "line-opacity": 0, "line-width": 14 },
      });
      map.addLayer({
        id: "edges-line",
        type: "line",
        source: "edges",
        layout: { "line-cap": "round" },
        paint: {
          "line-color": ["get", "color"],
          "line-width": ["case", ["get", "selected"], 6, 3.5],
          "line-opacity": 0.95,
        },
      });
      map.addLayer({
        id: "edges-selected-glow",
        type: "line",
        source: "edges",
        filter: ["==", ["get", "selected"], true],
        paint: { "line-color": "#fff", "line-width": 10, "line-opacity": 0.5, "line-blur": 3 },
      });
      map.addLayer({
        id: "draft-line",
        type: "line",
        source: "draft",
        filter: ["==", ["geometry-type"], "LineString"],
        paint: { "line-color": "#fbbf24", "line-width": 3, "line-dasharray": [2, 1.5] },
      });
      map.addLayer({
        id: "draft-points",
        type: "circle",
        source: "draft",
        filter: ["==", ["geometry-type"], "Point"],
        paint: { "circle-radius": 5, "circle-color": "#fbbf24", "circle-stroke-color": "#000", "circle-stroke-width": 1.5 },
      });
      map.addLayer({
        id: "vertices",
        type: "circle",
        source: "vertices",
        paint: {
          "circle-radius": ["case", ["get", "selected"], 6, 4],
          "circle-color": "#fff",
          "circle-stroke-color": "#111",
          "circle-stroke-width": 1.5,
        },
      });
      map.addLayer({
        id: "labels",
        type: "symbol",
        source: "labels",
        layout: {
          "text-field": ["get", "text"],
          "text-size": ["case", ["==", ["get", "kind"], "facet"], 12, 11],
          "text-font": ["Open Sans Regular"],
          "text-allow-overlap": true,
          "text-ignore-placement": true,
        },
        paint: { "text-color": "#fff", "text-halo-color": "#000", "text-halo-width": 1.5 },
      });

      syncData(map, stateRef.current);
      onReady?.({
        flyTo: (c, zoom = 19) => map.flyTo({ center: [c.lng, c.lat], zoom }),
        fitToRoof: () => {
          const pts = stateRef.current.model.facets.flatMap((f) => f.vertices);
          if (!pts.length) return;
          const b = new maplibregl.LngLatBounds();
          for (const p of pts) b.extend([p.lng, p.lat]);
          map.fitBounds(b, { padding: 80, maxZoom: 20 });
        },
        getCenter: () => {
          const c = map.getCenter();
          return { lng: c.lng, lat: c.lat };
        },
      });
    });

    const snap = (e: MapMouseEvent): LngLat => {
      // Snap to any existing vertex within SNAP_PX.
      const s = stateRef.current;
      let best: LngLat | null = null;
      let bestD = SNAP_PX;
      const candidates = [...s.model.facets.flatMap((f) => f.vertices), ...s.draft];
      for (const v of candidates) {
        const p = map.project([v.lng, v.lat]);
        const d = Math.hypot(p.x - e.point.x, p.y - e.point.y);
        if (d < bestD) {
          bestD = d;
          best = v;
        }
      }
      return best ?? { lng: e.lngLat.lng, lat: e.lngLat.lat };
    };

    map.on("click", (e) => {
      const s = stateRef.current;
      if (s.mode === "draw") {
        const p = snap(e);
        // Clicking the first draft point closes the polygon.
        const first = s.draft[0];
        if (first && s.draft.length >= 3) {
          const fp = map.project([first.lng, first.lat]);
          if (Math.hypot(fp.x - e.point.x, fp.y - e.point.y) < SNAP_PX) {
            dispatch({ type: "draft:finish" });
            return;
          }
        }
        dispatch({ type: "draft:add", point: p });
        return;
      }
      const edgeHits = map.queryRenderedFeatures(e.point, { layers: ["edges-hit"] });
      const edge = edgeHits[0];
      if (edge) {
        const facetId = String(edge.properties.facetId);
        const edgeIndex = Number(edge.properties.edgeIndex);
        if (e.originalEvent.shiftKey) {
          dispatch({ type: "vertex:insert", facetId, afterIndex: edgeIndex, point: { lng: e.lngLat.lng, lat: e.lngLat.lat } });
          return;
        }
        dispatch({ type: "select", selection: { facetId, edgeIndex } });
        return;
      }
      const fill = map.queryRenderedFeatures(e.point, { layers: ["facets-fill"] })[0];
      if (fill) {
        dispatch({ type: "select", selection: { facetId: String(fill.properties.facetId), edgeIndex: null } });
        return;
      }
      dispatch({ type: "select", selection: { facetId: null, edgeIndex: null } });
    });

    map.on("dblclick", (e) => {
      if (stateRef.current.mode === "draw") {
        e.preventDefault();
        dispatch({ type: "draft:finish" });
      }
    });

    // Vertex dragging.
    map.on("mousedown", "vertices", (e) => {
      if (stateRef.current.mode !== "select") return;
      const f = e.features?.[0];
      if (!f) return;
      e.preventDefault();
      dragRef.current = { facetId: String(f.properties.facetId), index: Number(f.properties.index) };
      map.getCanvas().style.cursor = "grabbing";
      map.dragPan.disable();
    });
    map.on("mousemove", (e) => {
      const d = dragRef.current;
      if (!d) return;
      dispatch({ type: "vertex:move", facetId: d.facetId, index: d.index, point: { lng: e.lngLat.lng, lat: e.lngLat.lat } });
    });
    map.on("mouseup", () => {
      if (!dragRef.current) return;
      dragRef.current = null;
      map.getCanvas().style.cursor = "";
      map.dragPan.enable();
    });
    map.on("contextmenu", "vertices", (e) => {
      const f = e.features?.[0];
      if (!f) return;
      e.preventDefault();
      dispatch({ type: "vertex:delete", facetId: String(f.properties.facetId), index: Number(f.properties.index) });
    });

    for (const layer of ["edges-hit", "vertices", "facets-fill"]) {
      map.on("mouseenter", layer, () => {
        if (stateRef.current.mode === "select" && !dragRef.current) map.getCanvas().style.cursor = "pointer";
      });
      map.on("mouseleave", layer, () => {
        if (!dragRef.current) map.getCanvas().style.cursor = stateRef.current.mode === "draw" ? "crosshair" : "";
      });
    }

    return () => {
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Push state into the map whenever it changes.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;
    syncData(map, state);
    map.getCanvas().style.cursor = state.mode === "draw" ? "crosshair" : "";
  }, [state]);

  return <div ref={containerRef} className="map" />;
}

function syncData(map: maplibregl.Map, state: AppState) {
  const data = buildGeoJSON(state);
  for (const [id, fc] of Object.entries(data)) {
    const src = map.getSource(id) as maplibregl.GeoJSONSource | undefined;
    src?.setData(fc);
  }
}
