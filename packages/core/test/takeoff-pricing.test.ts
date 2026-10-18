import { describe, expect, it } from "vitest";
import {
  buildTakeoff,
  DEFAULT_PRICING,
  DEFAULT_TAKEOFF_CONFIG,
  gableRoof,
  measureRoof,
  parseModel,
  priceAllTiers,
  priceEstimate,
  serializeModel,
} from "../src/index.js";

const ORLANDO = { lng: -81.2, lat: 28.55 };

describe("buildTakeoff", () => {
  const model = gableRoof(ORLANDO, 50, 30, 6);
  const report = measureRoof(model);
  const takeoff = buildTakeoff(report, { ...DEFAULT_TAKEOFF_CONFIG, wastePct: 10 }, [{ type: "pipe-boot", count: 3 }]);
  const line = (k: string) => takeoff.lines.find((l) => l.key === k)!;

  it("orders bundles = ceil(squares × waste × 3)", () => {
    expect(line("shingles").quantity).toBe(Math.ceil(report.squares * 1.1 * 3));
    expect(line("shingles").unit).toBe("bundle");
  });

  it("sizes starter from eaves + rakes", () => {
    const lf = report.lengthsFt.eave + report.lengthsFt.rake;
    expect(line("starter").rawQuantity).toBeCloseTo(lf, 3);
    expect(line("starter").quantity).toBe(Math.ceil(lf / 105));
  });

  it("sizes hip/ridge cap from hips + ridges", () => {
    expect(line("hip-ridge-cap").rawQuantity).toBeCloseTo(50, 1);
    expect(line("hip-ridge-cap").quantity).toBe(2);
  });

  it("sizes drip edge from perimeter in 10 ft sticks", () => {
    const lf = (report.lengthsFt.eave + report.lengthsFt.rake) * 1.1;
    expect(line("drip-edge").quantity).toBe(Math.ceil(lf / 10));
  });

  it("includes penetrations", () => {
    expect(line("pen-pipe-boot").quantity).toBe(3);
  });

  it("every line has a formula", () => {
    for (const l of takeoff.lines) expect(l.formula.length).toBeGreaterThan(0);
  });
});

describe("pricing", () => {
  const model = { ...gableRoof(ORLANDO, 50, 30, 6), existingLayers: 1, stories: 1 };
  const report = measureRoof(model);
  const takeoff = buildTakeoff(report);

  it("prices an estimate with margins", () => {
    const est = priceEstimate(model, report, takeoff);
    expect(est.materials.subtotal).toBeGreaterThan(0);
    expect(est.labor.subtotal).toBeGreaterThan(0);
    expect(est.total).toBeGreaterThan(est.directCost);
    // Profit is a margin on price.
    const costPlusOverhead = est.directCost + est.overhead;
    expect(est.total * (1 - DEFAULT_PRICING.profitPct / 100)).toBeCloseTo(costPlusOverhead, 0);
    expect(est.pricePerSquare).toBeCloseTo(est.total / report.squares, 1);
  });

  it("charges more for steeper roofs", () => {
    const steep = gableRoof(ORLANDO, 50, 30, 12);
    const steepReport = measureRoof(steep);
    const steepTakeoff = buildTakeoff(steepReport);
    const a = priceEstimate(model, report, takeoff);
    const b = priceEstimate(steep, steepReport, steepTakeoff);
    expect(b.labor.subtotal / steepReport.squares).toBeGreaterThan(a.labor.subtotal / report.squares);
  });

  it("produces good/better/best tiers in ascending price", () => {
    const tiers = priceAllTiers(model, report, takeoff);
    expect(tiers.map((t) => t.tierName)).toEqual(["Good", "Better", "Best"]);
    expect(tiers[0]!.total).toBeLessThan(tiers[1]!.total);
    expect(tiers[1]!.total).toBeLessThan(tiers[2]!.total);
  });
});

describe("serialize", () => {
  it("round-trips a model", () => {
    const model = gableRoof(ORLANDO, 50, 30, 6);
    const parsed = parseModel(serializeModel(model));
    expect(parsed.facets.length).toBe(2);
    expect(measureRoof(parsed).totalAreaSqFt).toBeCloseTo(measureRoof(model).totalAreaSqFt, 6);
  });

  it("rejects bad input", () => {
    expect(() => parseModel({ facets: "nope" })).toThrow();
    expect(() => parseModel({ facets: [{ vertices: [{ lng: 0, lat: 0 }] }] })).toThrow();
  });
});
