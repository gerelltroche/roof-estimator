import { centroidLngLat, distance, polygonArea, polygonPerimeter, projectToLocalFeet } from "./geometry.js";
import { hipValleyFactor, pitchFactor } from "./pitch.js";
import type {
  Complexity,
  EdgeMeasurement,
  EdgeType,
  Facet,
  FacetMeasurement,
  LngLat,
  MeasurementReport,
  RoofModel,
  WasteRow,
  XY,
} from "./types.js";

export const EDGE_TYPES: EdgeType[] = [
  "eave",
  "rake",
  "ridge",
  "hip",
  "valley",
  "transition",
  "wall",
  "parapet",
  "unlabeled",
];

/** Edge types that run horizontally (true length == plan length). */
const HORIZONTAL_TYPES = new Set<EdgeType>(["eave", "ridge", "transition", "parapet"]);

/** Edge types shared by two facets; counted once in totals. */
const SHARED_TYPES = new Set<EdgeType>(["ridge", "hip", "valley", "transition"]);

/** Standard waste columns, same as EagleView's table. */
export const WASTE_COLUMNS = [0, 5, 8, 10, 12, 15, 20, 25, 30];

/** Round squares *up* to the nearest 1/3 square (bundle granularity). */
export function roundUpToThirdSquare(squares: number): number {
  return Math.ceil(squares * 3 - 1e-9) / 3;
}

function unit(v: XY): XY {
  const l = Math.hypot(v.x, v.y) || 1;
  return { x: v.x / l, y: v.y / l };
}

/**
 * Find the facet's horizontal direction from its longest horizontal-type edge
 * (eave preferred, then ridge/transition). Returns null if none is labeled.
 */
function horizontalDirection(facet: Facet, xy: XY[]): XY | null {
  let best: { len: number; dir: XY; rank: number } | null = null;
  const n = xy.length;
  for (let i = 0; i < n; i++) {
    const t = facet.edges[i]?.type ?? "unlabeled";
    if (!HORIZONTAL_TYPES.has(t)) continue;
    const a = xy[i]!;
    const b = xy[(i + 1) % n]!;
    const len = distance(a, b);
    const rank = t === "eave" ? 2 : 1;
    if (!best || rank > best.rank || (rank === best.rank && len > best.len)) {
      best = { len, dir: unit({ x: b.x - a.x, y: b.y - a.y }), rank };
    }
  }
  return best?.dir ?? null;
}

/**
 * True (sloped) length of an edge.
 *
 * If the facet has a labeled horizontal edge we know its fall line, so any
 * edge's true length is sqrt(plan² + rise²) where rise = (plan component
 * along the fall line) × pitch/12. That handles rakes, hips at any angle,
 * and wall edges correctly. Otherwise fall back to type-based factors.
 */
function trueEdgeLength(type: EdgeType, a: XY, b: XY, pitch: number, horiz: XY | null): number {
  const plan = distance(a, b);
  if (HORIZONTAL_TYPES.has(type) || pitch === 0) return plan;
  if (horiz) {
    // Fall line is perpendicular to the horizontal direction.
    const slopeDir = { x: -horiz.y, y: horiz.x };
    const ex = b.x - a.x;
    const ey = b.y - a.y;
    const alongSlope = Math.abs(ex * slopeDir.x + ey * slopeDir.y);
    const rise = alongSlope * (pitch / 12);
    return Math.sqrt(plan * plan + rise * rise);
  }
  if (type === "hip" || type === "valley") return plan * hipValleyFactor(pitch);
  // rake, wall, unlabeled: assume it runs straight up the slope.
  return plan * pitchFactor(pitch);
}

export function measureFacet(facet: Facet, origin: LngLat, warnings: string[]): FacetMeasurement {
  const xy = projectToLocalFeet(facet.vertices, origin);
  const n = xy.length;
  const name = facet.label ?? facet.id;
  if (n < 3) warnings.push(`Facet "${name}" has fewer than 3 vertices and was ignored.`);
  if (facet.edges.length !== n) warnings.push(`Facet "${name}" has ${facet.edges.length} edge labels for ${n} vertices.`);

  const planArea = polygonArea(xy);
  const pf = pitchFactor(facet.pitch);
  const horiz = horizontalDirection(facet, xy);
  if (!horiz && facet.pitch > 0 && n >= 3) {
    warnings.push(`Facet "${name}" has no eave or ridge labeled; sloped edge lengths use type-based factors.`);
  }

  const edges: EdgeMeasurement[] = [];
  for (let i = 0; i < n; i++) {
    const a = xy[i]!;
    const b = xy[(i + 1) % n]!;
    const type = facet.edges[i]?.type ?? "unlabeled";
    if (type === "unlabeled") warnings.push(`Facet "${name}" edge ${i + 1} is unlabeled.`);
    edges.push({
      type,
      planLengthFt: distance(a, b),
      lengthFt: trueEdgeLength(type, a, b, facet.pitch, horiz),
      from: facet.vertices[i]!,
      to: facet.vertices[(i + 1) % n]!,
    });
  }

  return {
    id: facet.id,
    label: facet.label,
    pitch: facet.pitch,
    pitchFactor: pf,
    planAreaSqFt: planArea,
    areaSqFt: planArea * pf,
    planPerimeterFt: polygonPerimeter(xy),
    edges,
  };
}

/** Key that identifies an edge by its (unordered) endpoints to ~0.5 ft. */
function edgeKey(e: EdgeMeasurement, origin: LngLat): string {
  const [a, b] = projectToLocalFeet([e.from, e.to], origin);
  const r = (v: number) => Math.round(v * 2) / 2;
  const ka = `${r(a!.x)},${r(a!.y)}`;
  const kb = `${r(b!.x)},${r(b!.y)}`;
  return ka < kb ? `${ka}|${kb}` : `${kb}|${ka}`;
}

export function classifyComplexity(hipValleyFt: number, areaSqFt: number, facetCount: number): Complexity {
  if (areaSqFt <= 0) return "simple";
  const score = hipValleyFt / Math.sqrt(areaSqFt) + facetCount / 8;
  if (score < 1.5) return "simple";
  if (score < 4) return "normal";
  return "complex";
}

export function suggestedWasteFor(c: Complexity): number {
  return c === "simple" ? 10 : c === "normal" ? 13 : 17;
}

export function buildWasteTable(areaSqFt: number, suggested: number): WasteRow[] {
  const cols = Array.from(new Set([...WASTE_COLUMNS, suggested])).sort((a, b) => a - b);
  return cols.map((wastePct) => {
    const area = areaSqFt * (1 + wastePct / 100);
    return { wastePct, areaSqFt: area, squares: roundUpToThirdSquare(area / 100) };
  });
}

export function measureRoof(model: RoofModel): MeasurementReport {
  const warnings: string[] = [];
  const all = model.facets.flatMap((f) => f.vertices);
  const origin = centroidLngLat(all);
  const facets = model.facets.filter((f) => f.vertices.length >= 3).map((f) => measureFacet(f, origin, warnings));

  const lengths = Object.fromEntries(EDGE_TYPES.map((t) => [t, 0])) as Record<EdgeType, number>;
  const seen = new Set<string>();
  for (const f of facets) {
    for (const e of f.edges) {
      if (SHARED_TYPES.has(e.type)) {
        const k = `${e.type}:${edgeKey(e, origin)}`;
        if (seen.has(k)) continue;
        seen.add(k);
      }
      lengths[e.type] += e.lengthFt;
    }
  }

  const totalArea = facets.reduce((s, f) => s + f.areaSqFt, 0);
  const totalPlan = facets.reduce((s, f) => s + f.planAreaSqFt, 0);

  const byPitch = new Map<number, number>();
  for (const f of facets) byPitch.set(f.pitch, (byPitch.get(f.pitch) ?? 0) + f.areaSqFt);
  const areasByPitch = [...byPitch.entries()]
    .map(([pitch, areaSqFt]) => ({ pitch, areaSqFt, pct: totalArea ? (areaSqFt / totalArea) * 100 : 0 }))
    .sort((a, b) => a.pitch - b.pitch);
  const predominant = areasByPitch.reduce((best, r) => (r.areaSqFt > best.areaSqFt ? r : best), {
    pitch: 0,
    areaSqFt: -1,
    pct: 0,
  }).pitch;

  const complexity = classifyComplexity(lengths.hip + lengths.valley, totalArea, facets.length);
  const suggestedWastePct = suggestedWasteFor(complexity);

  return {
    facetCount: facets.length,
    totalAreaSqFt: totalArea,
    totalPlanAreaSqFt: totalPlan,
    squares: totalArea / 100,
    predominantPitch: predominant,
    areasByPitch,
    lengthsFt: lengths,
    complexity,
    suggestedWastePct,
    wasteTable: buildWasteTable(totalArea, suggestedWastePct),
    facets,
    warnings: Array.from(new Set(warnings)),
  };
}
