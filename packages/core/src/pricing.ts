import { steepnessTier, type SteepnessTier } from "./pitch.js";
import type { Estimate, EstimateSection, MeasurementReport, RoofModel, Takeoff } from "./types.js";

/** Price list keyed by takeoff line key. Missing keys price at 0 and are flagged. */
export type PriceList = Record<string, number>;

export interface LaborRates {
  /** Base install labor per square at walkable pitch. */
  installPerSquare: number;
  /** Multiplier by steepness tier. */
  steepnessMultiplier: Record<SteepnessTier, number>;
  /** Tear-off per square per layer. */
  tearOffPerSquarePerLayer: number;
  /** Extra per square for each story above the first. */
  perExtraStoryPerSquare: number;
  /** Labor to install each pipe boot / vent / etc. */
  perPenetration: number;
  /** Labor per linear foot of wall flashing. */
  wallFlashingPerLf: number;
}

export interface OtherCosts {
  /** Dumpster / disposal, flat. */
  disposalFlat: number;
  /** Disposal per square per layer torn off (in addition to flat). */
  disposalPerSquarePerLayer: number;
  permit: number;
  deliveryFlat: number;
  /** Decking replacement allowance: sheets × price. */
  deckingSheets: number;
  deckingPricePerSheet: number;
}

export interface PricingTier {
  name: string;
  /** Overrides applied on top of the base price list (e.g. premium shingle). */
  priceOverrides?: PriceList;
  /** Optional description shown on proposals. */
  description?: string;
}

export interface PricingConfig {
  prices: PriceList;
  labor: LaborRates;
  other: OtherCosts;
  overheadPct: number;
  profitPct: number;
  /** Sales tax applied to materials only (common in most US states). */
  materialsTaxPct: number;
  tiers: PricingTier[];
}

/**
 * Placeholder prices in USD. These are rough 2026 retail-ish numbers meant to
 * be replaced with the contractor's actual supplier pricing.
 */
export const DEFAULT_PRICING: PricingConfig = {
  prices: {
    shingles: 42, // per bundle
    underlayment: 95, // per 10-sq roll
    "ice-water": 110, // per roll
    starter: 55, // per bundle
    "hip-ridge-cap": 65, // per bundle
    "drip-edge": 12, // per 10 ft stick
    "valley-metal": 28,
    "step-flashing": 0.9,
    "pen-pipe-boot": 18,
    "pen-vent": 35,
    "pen-skylight": 220,
    "pen-chimney": 180,
    "pen-satellite": 0,
    "pen-other": 50,
    "ridge-vent": 14, // per 4 ft piece
    nails: 55, // per box
    "cap-nails": 32,
    sealant: 9,
  },
  labor: {
    installPerSquare: 110,
    steepnessMultiplier: { flat: 1.1, walkable: 1, steep: 1.3, "very-steep": 1.65 },
    tearOffPerSquarePerLayer: 40,
    perExtraStoryPerSquare: 10,
    perPenetration: 35,
    wallFlashingPerLf: 6,
  },
  other: {
    disposalFlat: 450,
    disposalPerSquarePerLayer: 8,
    permit: 250,
    deliveryFlat: 150,
    deckingSheets: 0,
    deckingPricePerSheet: 75,
  },
  overheadPct: 10,
  profitPct: 20,
  materialsTaxPct: 6.5,
  tiers: [
    { name: "Good", description: "Standard architectural shingle, synthetic underlayment, 10-year workmanship." },
    {
      name: "Better",
      description: "Upgraded architectural shingle, full ice & water, ridge vent, 15-year workmanship.",
      priceOverrides: { shingles: 52, underlayment: 120 },
    },
    {
      name: "Best",
      description: "Designer/impact-rated shingle, premium underlayment, lifetime workmanship.",
      priceOverrides: { shingles: 78, underlayment: 145, "hip-ridge-cap": 85 },
    },
  ],
};

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}

/**
 * Weighted labor multiplier: each facet's share of area × its steepness
 * multiplier, so a roof that is 70% walkable and 30% steep is priced
 * accordingly rather than at the worst case.
 */
export function weightedSteepnessMultiplier(report: MeasurementReport, rates: LaborRates): number {
  if (report.totalAreaSqFt <= 0) return 1;
  let sum = 0;
  for (const f of report.facets) {
    sum += (f.areaSqFt / report.totalAreaSqFt) * rates.steepnessMultiplier[steepnessTier(f.pitch)];
  }
  return sum;
}

export function priceEstimate(
  model: RoofModel,
  report: MeasurementReport,
  takeoff: Takeoff,
  config: PricingConfig = DEFAULT_PRICING,
  tier: PricingTier = { name: "Base" },
): Estimate {
  const prices: Record<string, number> = { ...config.prices, ...(tier.priceOverrides ?? {}) };
  const squares = report.squares;
  const layers = model.existingLayers ?? 1;
  const stories = model.stories ?? 1;
  const penetrationCount = (model.penetrations ?? []).reduce((s, p) => s + p.count, 0);

  // Materials
  const materials: EstimateSection = { name: "Materials", lines: [], subtotal: 0 };
  for (const line of takeoff.lines) {
    const unitPrice = prices[line.key] ?? 0;
    const total = round2(line.quantity * unitPrice);
    materials.lines.push({ description: line.description, quantity: line.quantity, unit: line.unit, unitPrice, total });
    materials.subtotal += total;
  }
  if (config.other.deckingSheets > 0) {
    const total = round2(config.other.deckingSheets * config.other.deckingPricePerSheet);
    materials.lines.push({
      description: 'Decking replacement (1/2" OSB)',
      quantity: config.other.deckingSheets,
      unit: "sheet",
      unitPrice: config.other.deckingPricePerSheet,
      total,
    });
    materials.subtotal += total;
  }
  materials.subtotal = round2(materials.subtotal);

  // Labor
  const labor: EstimateSection = { name: "Labor", lines: [], subtotal: 0 };
  const mult = weightedSteepnessMultiplier(report, config.labor);
  const installRate = round2(config.labor.installPerSquare * mult);
  labor.lines.push({
    description: `Install (${mult.toFixed(2)}× pitch factor)`,
    quantity: round2(squares),
    unit: "sq",
    unitPrice: installRate,
    total: round2(squares * installRate),
  });
  if (layers > 0) {
    labor.lines.push({
      description: `Tear-off (${layers} layer${layers > 1 ? "s" : ""})`,
      quantity: round2(squares),
      unit: "sq",
      unitPrice: config.labor.tearOffPerSquarePerLayer * layers,
      total: round2(squares * config.labor.tearOffPerSquarePerLayer * layers),
    });
  }
  if (stories > 1) {
    const rate = config.labor.perExtraStoryPerSquare * (stories - 1);
    labor.lines.push({
      description: `Multi-story (${stories} stories)`,
      quantity: round2(squares),
      unit: "sq",
      unitPrice: rate,
      total: round2(squares * rate),
    });
  }
  if (penetrationCount > 0) {
    labor.lines.push({
      description: "Penetrations / flashing",
      quantity: penetrationCount,
      unit: "each",
      unitPrice: config.labor.perPenetration,
      total: round2(penetrationCount * config.labor.perPenetration),
    });
  }
  if (report.lengthsFt.wall > 0) {
    labor.lines.push({
      description: "Wall flashing",
      quantity: round2(report.lengthsFt.wall),
      unit: "lf",
      unitPrice: config.labor.wallFlashingPerLf,
      total: round2(report.lengthsFt.wall * config.labor.wallFlashingPerLf),
    });
  }
  labor.subtotal = round2(labor.lines.reduce((s, l) => s + l.total, 0));

  // Other
  const other: EstimateSection = { name: "Other", lines: [], subtotal: 0 };
  const disposal = config.other.disposalFlat + (layers > 0 ? squares * layers * config.other.disposalPerSquarePerLayer : 0);
  other.lines.push({ description: "Disposal / dumpster", quantity: 1, unit: "each", unitPrice: round2(disposal), total: round2(disposal) });
  if (config.other.permit > 0)
    other.lines.push({ description: "Permit", quantity: 1, unit: "each", unitPrice: config.other.permit, total: config.other.permit });
  if (config.other.deliveryFlat > 0)
    other.lines.push({ description: "Delivery", quantity: 1, unit: "each", unitPrice: config.other.deliveryFlat, total: config.other.deliveryFlat });
  other.subtotal = round2(other.lines.reduce((s, l) => s + l.total, 0));

  const salesTax = round2(materials.subtotal * (config.materialsTaxPct / 100));
  const directCost = round2(materials.subtotal + labor.subtotal + other.subtotal + salesTax);
  const overhead = round2(directCost * (config.overheadPct / 100));
  const costPlusOverhead = directCost + overhead;
  // Profit as a margin on price: price = cost / (1 - margin).
  const total = round2(costPlusOverhead / (1 - config.profitPct / 100));
  const profit = round2(total - costPlusOverhead);

  return {
    tierName: tier.name,
    materials,
    labor,
    other,
    directCost,
    overhead,
    profit,
    salesTax,
    total,
    pricePerSquare: squares > 0 ? round2(total / squares) : 0,
  };
}

/** Price every tier in the config (Good / Better / Best). */
export function priceAllTiers(
  model: RoofModel,
  report: MeasurementReport,
  takeoff: Takeoff,
  config: PricingConfig = DEFAULT_PRICING,
): Estimate[] {
  const tiers = config.tiers.length ? config.tiers : [{ name: "Estimate" }];
  return tiers.map((t) => priceEstimate(model, report, takeoff, config, t));
}
