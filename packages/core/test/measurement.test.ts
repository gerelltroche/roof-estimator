import { describe, expect, it } from "vitest";
import {
  gableRoof,
  geoPolygonAreaSqFt,
  hipRoof,
  measureRoof,
  pitchFactor,
  rectangleAt,
  roundUpToThirdSquare,
  shedRoof,
} from "../src/index.js";

const ORLANDO = { lng: -81.2, lat: 28.55 };

describe("geometry", () => {
  it("measures a 40×30 ft rectangle as 1200 sq ft", () => {
    const area = geoPolygonAreaSqFt(rectangleAt(ORLANDO, 40, 30));
    expect(area).toBeCloseTo(1200, 1);
  });
});

describe("measureRoof", () => {
  it("measures a simple gable", () => {
    // 50 ft wide (ridge direction) × 30 ft deep, 6/12.
    const report = measureRoof(gableRoof(ORLANDO, 50, 30, 6));
    expect(report.facetCount).toBe(2);
    expect(report.totalPlanAreaSqFt).toBeCloseTo(1500, 0);
    expect(report.totalAreaSqFt).toBeCloseTo(1500 * pitchFactor(6), 0);
    expect(report.squares).toBeCloseTo(16.77, 1);
    expect(report.predominantPitch).toBe(6);
    // Ridge counted once, not twice.
    expect(report.lengthsFt.ridge).toBeCloseTo(50, 1);
    expect(report.lengthsFt.eave).toBeCloseTo(100, 1);
    // 4 rakes × 15 ft plan × 1.118
    expect(report.lengthsFt.rake).toBeCloseTo(4 * 15 * pitchFactor(6), 1);
    expect(report.lengthsFt.hip).toBe(0);
    expect(report.lengthsFt.valley).toBe(0);
    expect(report.complexity).toBe("simple");
    expect(report.suggestedWastePct).toBe(10);
    expect(report.warnings).toEqual([]);
  });

  it("measures a hip roof with 45° hips", () => {
    // 60 × 40 ft, 8/12.
    const report = measureRoof(hipRoof(ORLANDO, 60, 40, 8));
    expect(report.facetCount).toBe(4);
    expect(report.totalPlanAreaSqFt).toBeCloseTo(2400, 0);
    expect(report.totalAreaSqFt).toBeCloseTo(2400 * pitchFactor(8), 0);
    expect(report.lengthsFt.ridge).toBeCloseTo(20, 1); // 60 - 40
    expect(report.lengthsFt.eave).toBeCloseTo(200, 1);
    // 4 hips, each 20 ft run → plan diagonal 20√2 → true = 20 × sqrt(64 + 288)/12 = 20 × 1.5635
    const hipRun = 20;
    const trueHip = hipRun * (Math.sqrt(8 * 8 + 288) / 12);
    expect(report.lengthsFt.hip).toBeCloseTo(4 * trueHip, 0);
    expect(report.lengthsFt.rake).toBe(0);
    expect(report.complexity).toBe("normal");
  });

  it("measures a shed roof with a wall edge", () => {
    const report = measureRoof(shedRoof(ORLANDO, 20, 12, 4));
    expect(report.facetCount).toBe(1);
    expect(report.lengthsFt.wall).toBeCloseTo(20, 1);
    expect(report.lengthsFt.eave).toBeCloseTo(20, 1);
    expect(report.lengthsFt.rake).toBeCloseTo(2 * 12 * pitchFactor(4), 1);
  });

  it("builds a waste table rounded up to 1/3 square", () => {
    const report = measureRoof(gableRoof(ORLANDO, 50, 30, 6));
    const zero = report.wasteTable.find((r) => r.wastePct === 0)!;
    expect(zero.squares).toBe(roundUpToThirdSquare(report.squares));
    expect(zero.squares * 3).toBeCloseTo(Math.round(zero.squares * 3));
    const fifteen = report.wasteTable.find((r) => r.wastePct === 15)!;
    expect(fifteen.areaSqFt).toBeCloseTo(report.totalAreaSqFt * 1.15, 3);
    expect(report.wasteTable.map((r) => r.wastePct)).toContain(report.suggestedWastePct);
  });

  it("warns about unlabeled edges", () => {
    const model = gableRoof(ORLANDO, 50, 30, 6);
    model.facets[0]!.edges[0] = { type: "unlabeled" };
    const report = measureRoof(model);
    expect(report.warnings.some((w) => w.includes("unlabeled"))).toBe(true);
  });

  it("groups area by pitch", () => {
    const model = gableRoof(ORLANDO, 50, 30, 6);
    model.facets[1]!.pitch = 10;
    const report = measureRoof(model);
    expect(report.areasByPitch.map((r) => r.pitch)).toEqual([6, 10]);
    expect(report.predominantPitch).toBe(10);
    expect(report.areasByPitch.reduce((s, r) => s + r.pct, 0)).toBeCloseTo(100);
  });
});

describe("roundUpToThirdSquare", () => {
  it("rounds up to thirds", () => {
    expect(roundUpToThirdSquare(7.33)).toBeCloseTo(7.3333, 3);
    expect(roundUpToThirdSquare(7.34)).toBeCloseTo(7.6667, 3);
    expect(roundUpToThirdSquare(8)).toBe(8);
  });
});
