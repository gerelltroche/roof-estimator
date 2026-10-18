import type { MeasurementReport, Penetration, Takeoff, TakeoffLine } from "./types.js";

/**
 * Packaging/coverage assumptions. Every number here is editable so a
 * contractor can match what their supplier actually stocks.
 */
export interface TakeoffConfig {
  /** Waste applied to field shingles (and underlayment). */
  wastePct: number;
  shingle: {
    name: string;
    bundlesPerSquare: number;
  };
  underlayment: {
    name: string;
    /** Squares covered per roll (synthetic ≈ 10, #15 felt ≈ 4, #30 felt ≈ 2). */
    squaresPerRoll: number;
    /** Extra for laps/waste, as a percent. */
    wastePct: number;
  };
  iceAndWater: {
    enabled: boolean;
    /** Linear feet per roll (typical: 66.7 ft of 36" wide). */
    lfPerRoll: number;
    /** Courses along eaves (1 = 3 ft up the roof, 2 = 6 ft). Code: 24" past interior wall line. */
    eaveCourses: number;
    /** Also run it in valleys. */
    valleys: boolean;
    /** Also around penetrations and wall intersections. */
    walls: boolean;
  };
  starter: {
    /** Linear feet per bundle/roll (typical 100–120). */
    lfPerBundle: number;
    /** Run starter up the rakes too (recommended for wind warranty). */
    includeRakes: boolean;
  };
  hipRidgeCap: {
    /** Linear feet per bundle (typical 20–35 depending on product). */
    lfPerBundle: number;
  };
  dripEdge: {
    /** Length of each stick, ft. */
    stickLengthFt: number;
    /** Overlap allowance, percent. */
    wastePct: number;
  };
  ridgeVent: {
    enabled: boolean;
    /** Length of each piece, ft (4 ft is standard). */
    pieceLengthFt: number;
    /** Fraction of ridge length that gets vent (1 = all). */
    ridgeFraction: number;
  };
  valleyMetal: {
    /** Use metal (open valley) instead of woven/closed-cut. */
    enabled: boolean;
    pieceLengthFt: number;
  };
  nails: {
    /** Nails per square of field shingles (320 for 4-nail, 480 for 6-nail high wind). */
    perSquare: number;
    /** Nails per box/coil case. */
    perBox: number;
  };
  capNails: {
    /** Plastic cap nails per square of underlayment. */
    perSquare: number;
    perBox: number;
  };
  stepFlashing: {
    /** Pieces per linear foot of wall (typically 1 per 5" exposure → ~2.4/ft). */
    piecesPerLf: number;
  };
  sealant: {
    /** Tubes per 10 squares. */
    tubesPer10Squares: number;
  };
}

export const DEFAULT_TAKEOFF_CONFIG: TakeoffConfig = {
  wastePct: 12,
  shingle: { name: "Architectural shingles", bundlesPerSquare: 3 },
  underlayment: { name: "Synthetic underlayment", squaresPerRoll: 10, wastePct: 10 },
  iceAndWater: { enabled: true, lfPerRoll: 66.7, eaveCourses: 1, valleys: true, walls: true },
  starter: { lfPerBundle: 105, includeRakes: true },
  hipRidgeCap: { lfPerBundle: 25 },
  dripEdge: { stickLengthFt: 10, wastePct: 10 },
  ridgeVent: { enabled: true, pieceLengthFt: 4, ridgeFraction: 1 },
  valleyMetal: { enabled: false, pieceLengthFt: 10 },
  nails: { perSquare: 320, perBox: 7200 },
  capNails: { perSquare: 100, perBox: 2000 },
  stepFlashing: { piecesPerLf: 2.4 },
  sealant: { tubesPer10Squares: 1 },
};

function ceil(v: number): number {
  return Math.ceil(v - 1e-9);
}

export function buildTakeoff(
  report: MeasurementReport,
  config: TakeoffConfig = DEFAULT_TAKEOFF_CONFIG,
  penetrations: Penetration[] = [],
): Takeoff {
  const L = report.lengthsFt;
  const lines: TakeoffLine[] = [];
  const waste = 1 + config.wastePct / 100;
  const fieldSquares = report.squares * waste;

  // ---- Field ---------------------------------------------------------------
  lines.push({
    key: "shingles",
    description: config.shingle.name,
    rawQuantity: fieldSquares,
    rawUnit: "sq",
    quantity: ceil(fieldSquares * config.shingle.bundlesPerSquare),
    unit: "bundle",
    formula: `${report.squares.toFixed(2)} sq × ${waste.toFixed(2)} waste × ${config.shingle.bundlesPerSquare} bundles/sq`,
    category: "field",
  });

  // ---- Underlayment ----------------------------------------------------------
  const ulSquares = report.squares * (1 + config.underlayment.wastePct / 100);
  lines.push({
    key: "underlayment",
    description: config.underlayment.name,
    rawQuantity: ulSquares,
    rawUnit: "sq",
    quantity: ceil(ulSquares / config.underlayment.squaresPerRoll),
    unit: "roll",
    formula: `${report.squares.toFixed(2)} sq × ${(1 + config.underlayment.wastePct / 100).toFixed(2)} ÷ ${config.underlayment.squaresPerRoll} sq/roll`,
    category: "underlayment",
  });

  if (config.iceAndWater.enabled) {
    let lf = L.eave * config.iceAndWater.eaveCourses;
    const parts = [`eaves ${L.eave.toFixed(0)} ft × ${config.iceAndWater.eaveCourses}`];
    if (config.iceAndWater.valleys && L.valley > 0) {
      lf += L.valley;
      parts.push(`valleys ${L.valley.toFixed(0)} ft`);
    }
    if (config.iceAndWater.walls && L.wall > 0) {
      lf += L.wall;
      parts.push(`walls ${L.wall.toFixed(0)} ft`);
    }
    lines.push({
      key: "ice-water",
      description: "Ice & water shield",
      rawQuantity: lf,
      rawUnit: "lf",
      quantity: ceil(lf / config.iceAndWater.lfPerRoll),
      unit: "roll",
      formula: `(${parts.join(" + ")}) ÷ ${config.iceAndWater.lfPerRoll} ft/roll`,
      category: "underlayment",
    });
  }

  // ---- Edges -----------------------------------------------------------------
  const starterLf = L.eave + (config.starter.includeRakes ? L.rake : 0);
  lines.push({
    key: "starter",
    description: "Starter strip",
    rawQuantity: starterLf,
    rawUnit: "lf",
    quantity: ceil(starterLf / config.starter.lfPerBundle),
    unit: "bundle",
    formula: `(eaves ${L.eave.toFixed(0)}${config.starter.includeRakes ? ` + rakes ${L.rake.toFixed(0)}` : ""}) ft ÷ ${config.starter.lfPerBundle} ft/bundle`,
    category: "edges",
  });

  const capLf = L.hip + L.ridge;
  lines.push({
    key: "hip-ridge-cap",
    description: "Hip & ridge cap shingles",
    rawQuantity: capLf,
    rawUnit: "lf",
    quantity: ceil(capLf / config.hipRidgeCap.lfPerBundle),
    unit: "bundle",
    formula: `(hips ${L.hip.toFixed(0)} + ridges ${L.ridge.toFixed(0)}) ft ÷ ${config.hipRidgeCap.lfPerBundle} ft/bundle`,
    category: "edges",
  });

  const dripLf = (L.eave + L.rake) * (1 + config.dripEdge.wastePct / 100);
  lines.push({
    key: "drip-edge",
    description: `Drip edge (${config.dripEdge.stickLengthFt} ft sticks)`,
    rawQuantity: dripLf,
    rawUnit: "lf",
    quantity: ceil(dripLf / config.dripEdge.stickLengthFt),
    unit: "piece",
    formula: `(eaves ${L.eave.toFixed(0)} + rakes ${L.rake.toFixed(0)}) ft × ${(1 + config.dripEdge.wastePct / 100).toFixed(2)} ÷ ${config.dripEdge.stickLengthFt} ft`,
    category: "edges",
  });

  // ---- Flashing --------------------------------------------------------------
  if (config.valleyMetal.enabled && L.valley > 0) {
    lines.push({
      key: "valley-metal",
      description: "Valley metal",
      rawQuantity: L.valley,
      rawUnit: "lf",
      quantity: ceil((L.valley * 1.1) / config.valleyMetal.pieceLengthFt),
      unit: "piece",
      formula: `valleys ${L.valley.toFixed(0)} ft × 1.10 ÷ ${config.valleyMetal.pieceLengthFt} ft`,
      category: "flashing",
    });
  }
  if (L.wall > 0) {
    lines.push({
      key: "step-flashing",
      description: "Step flashing",
      rawQuantity: L.wall,
      rawUnit: "lf",
      quantity: ceil(L.wall * config.stepFlashing.piecesPerLf),
      unit: "piece",
      formula: `walls ${L.wall.toFixed(0)} ft × ${config.stepFlashing.piecesPerLf} pcs/ft`,
      category: "flashing",
    });
  }
  for (const p of penetrations) {
    if (p.count <= 0) continue;
    const desc: Record<Penetration["type"], string> = {
      "pipe-boot": "Pipe boot flashing",
      vent: "Roof vent / cap",
      skylight: "Skylight flashing kit",
      chimney: "Chimney flashing kit",
      satellite: "Satellite mount removal/reset",
      other: p.note ?? "Other penetration",
    };
    lines.push({
      key: `pen-${p.type}`,
      description: desc[p.type],
      rawQuantity: p.count,
      rawUnit: "each",
      quantity: p.count,
      unit: "each",
      formula: "count",
      category: "flashing",
    });
  }

  // ---- Ventilation -----------------------------------------------------------
  if (config.ridgeVent.enabled && L.ridge > 0) {
    const lf = L.ridge * config.ridgeVent.ridgeFraction;
    lines.push({
      key: "ridge-vent",
      description: "Ridge vent",
      rawQuantity: lf,
      rawUnit: "lf",
      quantity: ceil(lf / config.ridgeVent.pieceLengthFt),
      unit: "piece",
      formula: `ridges ${L.ridge.toFixed(0)} ft × ${config.ridgeVent.ridgeFraction} ÷ ${config.ridgeVent.pieceLengthFt} ft`,
      category: "ventilation",
    });
  }

  // ---- Fasteners -------------------------------------------------------------
  const nails = fieldSquares * config.nails.perSquare;
  lines.push({
    key: "nails",
    description: "Roofing coil nails",
    rawQuantity: nails,
    rawUnit: "nails",
    quantity: ceil(nails / config.nails.perBox),
    unit: "box",
    formula: `${fieldSquares.toFixed(2)} sq × ${config.nails.perSquare} nails/sq ÷ ${config.nails.perBox}/box`,
    category: "fasteners",
  });
  const capNails = ulSquares * config.capNails.perSquare;
  lines.push({
    key: "cap-nails",
    description: "Cap nails (underlayment)",
    rawQuantity: capNails,
    rawUnit: "nails",
    quantity: ceil(capNails / config.capNails.perBox),
    unit: "box",
    formula: `${ulSquares.toFixed(2)} sq × ${config.capNails.perSquare}/sq ÷ ${config.capNails.perBox}/box`,
    category: "fasteners",
  });

  // ---- Accessories -----------------------------------------------------------
  lines.push({
    key: "sealant",
    description: "Roofing sealant",
    rawQuantity: report.squares,
    rawUnit: "sq",
    quantity: Math.max(1, ceil((report.squares / 10) * config.sealant.tubesPer10Squares)),
    unit: "tube",
    formula: `${report.squares.toFixed(2)} sq ÷ 10 × ${config.sealant.tubesPer10Squares}`,
    category: "accessories",
  });

  return { wastePct: config.wastePct, lines };
}
