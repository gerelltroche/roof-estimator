import { centroidLngLat, distance, polygonArea, projectToLocalFeet, signedPolygonArea } from "./geometry.js";
import type { Facet, LngLat, RoofModel, XY } from "./types.js";

const EARTH_RADIUS_M = 6378137;
const FEET_PER_METER = 3.280839895;

/** Inverse of projectToLocalFeet. */
export function unprojectFromLocalFeet(points: XY[], origin: LngLat): LngLat[] {
  const lat0 = (origin.lat * Math.PI) / 180;
  const cosLat = Math.cos(lat0);
  const k = EARTH_RADIUS_M * FEET_PER_METER;
  return points.map((p) => ({
    lng: origin.lng + ((p.x / (k * cosLat)) * 180) / Math.PI,
    lat: origin.lat + ((p.y / k) * 180) / Math.PI,
  }));
}

/** Andrew's monotone chain convex hull. Returns CCW hull. */
export function convexHull(points: XY[]): XY[] {
  const pts = [...points].sort((a, b) => a.x - b.x || a.y - b.y);
  if (pts.length < 3) return pts;
  const cross = (o: XY, a: XY, b: XY) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lower: XY[] = [];
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2]!, lower[lower.length - 1]!, p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper: XY[] = [];
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i]!;
    while (upper.length >= 2 && cross(upper[upper.length - 2]!, upper[upper.length - 1]!, p) <= 0) upper.pop();
    upper.push(p);
  }
  upper.pop();
  lower.pop();
  return [...lower, ...upper];
}

export interface RectFit {
  /** Four corners, CCW, in local feet. */
  corners: XY[];
  /** Long side length, ft. */
  length: number;
  /** Short side length, ft. */
  width: number;
  /** Rotation of the long side from the +x axis, radians. */
  angle: number;
  /** polygonArea / rectArea; 1 = perfect rectangle. */
  fill: number;
}

/**
 * Minimum-area bounding rectangle (rotating calipers over hull edges).
 * Used to decide whether a footprint is "basically a rectangle" and to
 * orient the ridge.
 */
export function fitRectangle(points: XY[]): RectFit | null {
  const hull = convexHull(points);
  if (hull.length < 3) return null;
  const area = polygonArea(points);
  let best: RectFit | null = null;
  for (let i = 0; i < hull.length; i++) {
    const a = hull[i]!;
    const b = hull[(i + 1) % hull.length]!;
    const angle = Math.atan2(b.y - a.y, b.x - a.x);
    const c = Math.cos(-angle);
    const s = Math.sin(-angle);
    let minX = Infinity,
      maxX = -Infinity,
      minY = Infinity,
      maxY = -Infinity;
    for (const p of hull) {
      const x = p.x * c - p.y * s;
      const y = p.x * s + p.y * c;
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }
    const w = maxX - minX;
    const h = maxY - minY;
    const rectArea = w * h;
    if (!best || rectArea < best.length * best.width) {
      const ci = Math.cos(angle);
      const si = Math.sin(angle);
      const back = (x: number, y: number): XY => ({ x: x * ci - y * si, y: x * si + y * ci });
      let corners = [back(minX, minY), back(maxX, minY), back(maxX, maxY), back(minX, maxY)];
      let length = w;
      let width = h;
      let ang = angle;
      if (h > w) {
        // Rotate corner order so corners[0]→corners[1] is the long side.
        corners = [corners[1]!, corners[2]!, corners[3]!, corners[0]!];
        length = h;
        width = w;
        ang = angle + Math.PI / 2;
      }
      if (signedPolygonArea(corners) < 0) corners.reverse();
      best = { corners, length, width, angle: ang, fill: rectArea > 0 ? area / rectArea : 0 };
    }
  }
  return best;
}

export type RoofStyle = "hip" | "gable" | "outline";

export interface FootprintToRoofOptions {
  style: RoofStyle;
  pitch: number;
  /** Below this fill ratio the footprint is not treated as a rectangle. */
  minRectFill?: number;
  /** Extend the footprint outward by this many feet for eave overhang. */
  overhangFt?: number;
  idPrefix?: string;
}

export interface FootprintToRoofResult {
  model: RoofModel;
  /** True if facets were auto-generated from a rectangle fit; false if only an outline was produced. */
  autoSplit: boolean;
  fit: RectFit | null;
}

/** Offset a convex-ish polygon outward by d feet (simple vertex-normal offset). */
function offsetPolygon(points: XY[], d: number): XY[] {
  if (d === 0) return points;
  const n = points.length;
  const ccw = signedPolygonArea(points) > 0;
  return points.map((p, i) => {
    const prev = points[(i - 1 + n) % n]!;
    const next = points[(i + 1) % n]!;
    const e1 = norm({ x: p.x - prev.x, y: p.y - prev.y });
    const e2 = norm({ x: next.x - p.x, y: next.y - p.y });
    // Outward normals (for CCW polygon, outward is to the right of travel).
    const n1 = ccw ? { x: e1.y, y: -e1.x } : { x: -e1.y, y: e1.x };
    const n2 = ccw ? { x: e2.y, y: -e2.x } : { x: -e2.y, y: e2.x };
    const bis = norm({ x: n1.x + n2.x, y: n1.y + n2.y });
    const cosHalf = bis.x * n1.x + bis.y * n1.y || 1;
    const k = Math.min(d / cosHalf, d * 3);
    return { x: p.x + bis.x * k, y: p.y + bis.y * k };
  });
}

function norm(v: XY): XY {
  const l = Math.hypot(v.x, v.y) || 1;
  return { x: v.x / l, y: v.y / l };
}

/**
 * Turn a building footprint (plan-view polygon) into a roof model.
 *
 * - Rectangle-like footprints (fill ≥ minRectFill) become a fully labeled
 *   hip or gable roof with the ridge along the long axis.
 * - Anything else becomes one "outline" facet with all edges labeled eave,
 *   for the user to split manually.
 */
export function footprintToRoof(footprint: LngLat[], opts: FootprintToRoofOptions): FootprintToRoofResult {
  const origin = centroidLngLat(footprint);
  let xy = projectToLocalFeet(footprint, origin);
  // Drop a repeated closing vertex if present.
  if (xy.length > 1 && distance(xy[0]!, xy[xy.length - 1]!) < 0.1) xy = xy.slice(0, -1);
  const fit = fitRectangle(xy);
  const minFill = opts.minRectFill ?? 0.85;
  const overhang = opts.overhangFt ?? 0;
  const prefix = opts.idPrefix ?? "facet";
  const pitch = opts.pitch;

  if (fit && fit.fill >= minFill && opts.style !== "outline") {
    const corners = overhang ? offsetPolygon(fit.corners, overhang) : fit.corners;
    const [c0, c1, c2, c3] = corners as [XY, XY, XY, XY];
    const L = distance(c0, c1);
    const W = distance(c1, c2);
    const u = norm({ x: c1.x - c0.x, y: c1.y - c0.y }); // along long side
    const v = norm({ x: c3.x - c0.x, y: c3.y - c0.y }); // along short side
    const mid = (a: XY, b: XY): XY => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
    const facets: Facet[] = [];
    const F = (id: string, label: string, pts: XY[], edges: Facet["edges"]): Facet => ({
      id: `${prefix}-${id}`,
      label,
      pitch,
      vertices: unprojectFromLocalFeet(pts, origin),
      edges,
    });

    if (opts.style === "gable") {
      const r0 = mid(c0, c3);
      const r1 = mid(c1, c2);
      facets.push(
        F("a", "Side A", [c0, c1, r1, r0], [{ type: "eave" }, { type: "rake" }, { type: "ridge" }, { type: "rake" }]),
        F("b", "Side B", [r0, r1, c2, c3], [{ type: "ridge" }, { type: "rake" }, { type: "eave" }, { type: "rake" }]),
      );
    } else {
      // Hip: ridge is inset by W/2 from each short end.
      const inset = W / 2;
      const r0 = { x: c0.x + u.x * inset + v.x * inset, y: c0.y + u.y * inset + v.y * inset };
      const r1 = { x: c1.x - u.x * inset + v.x * inset, y: c1.y - u.y * inset + v.y * inset };
      if (L - 2 * inset < 0.5) {
        // Square-ish: pyramid hip, four triangles meeting at a point.
        const apex = mid(c0, c2);
        facets.push(
          F("a", "Side A", [c0, c1, apex], [{ type: "eave" }, { type: "hip" }, { type: "hip" }]),
          F("b", "Side B", [c1, c2, apex], [{ type: "eave" }, { type: "hip" }, { type: "hip" }]),
          F("c", "Side C", [c2, c3, apex], [{ type: "eave" }, { type: "hip" }, { type: "hip" }]),
          F("d", "Side D", [c3, c0, apex], [{ type: "eave" }, { type: "hip" }, { type: "hip" }]),
        );
      } else {
        facets.push(
          F("a", "Side A", [c0, c1, r1, r0], [{ type: "eave" }, { type: "hip" }, { type: "ridge" }, { type: "hip" }]),
          F("b", "Side B", [r0, r1, c2, c3], [{ type: "ridge" }, { type: "hip" }, { type: "eave" }, { type: "hip" }]),
          F("c", "End C", [c1, c2, r1], [{ type: "eave" }, { type: "hip" }, { type: "hip" }]),
          F("d", "End D", [c3, c0, r0], [{ type: "eave" }, { type: "hip" }, { type: "hip" }]),
        );
      }
    }
    return { model: { facets }, autoSplit: true, fit };
  }

  const pts = overhang ? offsetPolygon(xy, overhang) : xy;
  const outline: Facet = {
    id: `${prefix}-outline`,
    label: "Outline",
    pitch,
    vertices: unprojectFromLocalFeet(pts, origin),
    edges: pts.map(() => ({ type: "eave" as const })),
  };
  return { model: { facets: [outline] }, autoSplit: false, fit };
}

/** Ray-casting point-in-polygon on lng/lat. */
export function pointInPolygon(pt: LngLat, poly: LngLat[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i]!;
    const b = poly[j]!;
    const intersect = a.lat > pt.lat !== b.lat > pt.lat && pt.lng < ((b.lng - a.lng) * (pt.lat - a.lat)) / (b.lat - a.lat) + a.lng;
    if (intersect) inside = !inside;
  }
  return inside;
}
