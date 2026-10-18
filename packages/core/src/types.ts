/**
 * Core data model for a roof.
 *
 * A roof is a set of facets (planes). Each facet is a closed polygon drawn in
 * plan view (as seen from above) and carries a pitch. Each edge of a facet is
 * labeled with its type, which drives both the true (sloped) length math and
 * the material takeoff.
 */

/** A point in plan view. Either geographic (lng/lat in degrees) or local feet. */
export interface LngLat {
  lng: number;
  lat: number;
}

export interface XY {
  x: number;
  y: number;
}

export type EdgeType =
  | "eave" // bottom horizontal edge, where gutters go
  | "rake" // sloped edge at a gable end
  | "ridge" // top horizontal edge where two facets meet
  | "hip" // sloped edge where two facets meet at an outside corner
  | "valley" // sloped edge where two facets meet at an inside corner
  | "transition" // horizontal pitch change line (e.g. mansard break)
  | "wall" // facet meets a vertical wall (needs step/apron flashing)
  | "parapet" // low wall on flat roofs
  | "unlabeled";

export interface Edge {
  /** Index of the facet vertex this edge starts at. Ends at (start + 1) % n. */
  type: EdgeType;
}

/** Pitch expressed as rise over 12 inches of run (e.g. 6 means 6/12). */
export type Pitch = number;

export interface Facet {
  id: string;
  /** Closed polygon in plan view, no repeated final vertex. */
  vertices: LngLat[];
  /** Rise per 12" run. 0 = flat. */
  pitch: Pitch;
  /** One per vertex; edges[i] runs from vertices[i] to vertices[i+1]. */
  edges: Edge[];
  label?: string;
}

export interface Penetration {
  type: "pipe-boot" | "vent" | "skylight" | "chimney" | "satellite" | "other";
  count: number;
  note?: string;
}

export interface RoofModel {
  id?: string;
  address?: string;
  /** Optional name shown on reports. */
  name?: string;
  facets: Facet[];
  penetrations?: Penetration[];
  /** Number of existing shingle layers to tear off. 0 = new construction / overlay. */
  existingLayers?: number;
  stories?: number;
  notes?: string;
}

// ---------------------------------------------------------------------------
// Measurement report
// ---------------------------------------------------------------------------

export interface FacetMeasurement {
  id: string;
  label?: string;
  pitch: Pitch;
  pitchFactor: number;
  /** Plan (footprint) area in sq ft. */
  planAreaSqFt: number;
  /** True sloped surface area in sq ft. */
  areaSqFt: number;
  /** Plan perimeter in ft. */
  planPerimeterFt: number;
  edges: EdgeMeasurement[];
}

export interface EdgeMeasurement {
  type: EdgeType;
  /** Plan length in ft. */
  planLengthFt: number;
  /** True sloped length in ft. */
  lengthFt: number;
  from: LngLat;
  to: LngLat;
}

export type Complexity = "simple" | "normal" | "complex";

export interface WasteRow {
  wastePct: number;
  areaSqFt: number;
  /** Squares rounded up to the nearest 1/3 square, like EagleView. */
  squares: number;
}

export interface MeasurementReport {
  facetCount: number;
  /** Total sloped roof area, sq ft. */
  totalAreaSqFt: number;
  totalPlanAreaSqFt: number;
  /** totalAreaSqFt / 100. */
  squares: number;
  /** Pitch with the largest area share. */
  predominantPitch: Pitch;
  /** Area by pitch, sorted by pitch. */
  areasByPitch: { pitch: Pitch; areaSqFt: number; pct: number }[];
  /** Linear-foot totals by edge type (true length, deduplicated across facets). */
  lengthsFt: Record<EdgeType, number>;
  complexity: Complexity;
  suggestedWastePct: number;
  wasteTable: WasteRow[];
  facets: FacetMeasurement[];
  /** Diagnostics for the user: unlabeled edges, degenerate facets, etc. */
  warnings: string[];
}

// ---------------------------------------------------------------------------
// Takeoff
// ---------------------------------------------------------------------------

export type Unit = "bundle" | "roll" | "piece" | "box" | "each" | "lf" | "sq" | "lb" | "tube" | "sqft";

export interface TakeoffLine {
  key: string;
  description: string;
  quantity: number;
  unit: Unit;
  /** The raw amount before rounding up to packaging (e.g. 14.26 squares). */
  rawQuantity: number;
  rawUnit: string;
  /** How the number was derived — shown in the UI and useful for auditing. */
  formula: string;
  category: "field" | "underlayment" | "edges" | "flashing" | "ventilation" | "fasteners" | "accessories";
}

export interface Takeoff {
  wastePct: number;
  lines: TakeoffLine[];
}

// ---------------------------------------------------------------------------
// Pricing
// ---------------------------------------------------------------------------

export interface PricedLine extends TakeoffLine {
  unitPrice: number;
  total: number;
}

export interface EstimateSection {
  name: string;
  lines: { description: string; quantity: number; unit: string; unitPrice: number; total: number }[];
  subtotal: number;
}

export interface Estimate {
  tierName: string;
  materials: EstimateSection;
  labor: EstimateSection;
  other: EstimateSection;
  directCost: number;
  overhead: number;
  profit: number;
  salesTax: number;
  total: number;
  pricePerSquare: number;
}
