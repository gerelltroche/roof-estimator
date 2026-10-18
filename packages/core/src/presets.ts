import { offsetFeet } from "./geometry.js";
import type { Facet, LngLat, RoofModel } from "./types.js";

/**
 * Generators for common roof shapes. Useful for demos, tests, and as a
 * starting point a user can drag into place over satellite imagery.
 *
 * All dimensions are plan-view feet. `origin` is the footprint center.
 */

export function gableRoof(origin: LngLat, widthFt: number, depthFt: number, pitch: number, id = "gable"): RoofModel {
  // Ridge runs east–west along the width; eaves on the north and south.
  const hw = widthFt / 2;
  const hd = depthFt / 2;
  const sw = offsetFeet(origin, -hw, -hd);
  const se = offsetFeet(origin, hw, -hd);
  const ne = offsetFeet(origin, hw, hd);
  const nw = offsetFeet(origin, -hw, hd);
  const rw = offsetFeet(origin, -hw, 0);
  const re = offsetFeet(origin, hw, 0);
  const south: Facet = {
    id: `${id}-south`,
    label: "South",
    pitch,
    vertices: [sw, se, re, rw],
    edges: [{ type: "eave" }, { type: "rake" }, { type: "ridge" }, { type: "rake" }],
  };
  const north: Facet = {
    id: `${id}-north`,
    label: "North",
    pitch,
    vertices: [rw, re, ne, nw],
    edges: [{ type: "ridge" }, { type: "rake" }, { type: "eave" }, { type: "rake" }],
  };
  return { id, name: "Gable roof", facets: [south, north] };
}

export function hipRoof(origin: LngLat, widthFt: number, depthFt: number, pitch: number, id = "hip"): RoofModel {
  // Ridge along the longer dimension. Hips at 45° in plan (equal pitch).
  const w = Math.max(widthFt, depthFt);
  const d = Math.min(widthFt, depthFt);
  const hw = w / 2;
  const hd = d / 2;
  const ridgeHalf = (w - d) / 2;
  const sw = offsetFeet(origin, -hw, -hd);
  const se = offsetFeet(origin, hw, -hd);
  const ne = offsetFeet(origin, hw, hd);
  const nw = offsetFeet(origin, -hw, hd);
  const r1 = offsetFeet(origin, -ridgeHalf, 0);
  const r2 = offsetFeet(origin, ridgeHalf, 0);
  const facets: Facet[] = [
    {
      id: `${id}-south`,
      label: "South",
      pitch,
      vertices: [sw, se, r2, r1],
      edges: [{ type: "eave" }, { type: "hip" }, { type: "ridge" }, { type: "hip" }],
    },
    {
      id: `${id}-north`,
      label: "North",
      pitch,
      vertices: [r1, r2, ne, nw],
      edges: [{ type: "ridge" }, { type: "hip" }, { type: "eave" }, { type: "hip" }],
    },
    {
      id: `${id}-east`,
      label: "East",
      pitch,
      vertices: [se, ne, r2],
      edges: [{ type: "eave" }, { type: "hip" }, { type: "hip" }],
    },
    {
      id: `${id}-west`,
      label: "West",
      pitch,
      vertices: [nw, sw, r1],
      edges: [{ type: "eave" }, { type: "hip" }, { type: "hip" }],
    },
  ];
  return { id, name: "Hip roof", facets };
}

export function shedRoof(origin: LngLat, widthFt: number, depthFt: number, pitch: number, id = "shed"): RoofModel {
  const hw = widthFt / 2;
  const hd = depthFt / 2;
  const facet: Facet = {
    id,
    label: "Shed",
    pitch,
    vertices: [offsetFeet(origin, -hw, -hd), offsetFeet(origin, hw, -hd), offsetFeet(origin, hw, hd), offsetFeet(origin, -hw, hd)],
    edges: [{ type: "eave" }, { type: "rake" }, { type: "wall" }, { type: "rake" }],
  };
  return { id, name: "Shed roof", facets: [facet] };
}
