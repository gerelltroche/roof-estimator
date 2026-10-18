import { describe, expect, it } from "vitest";
import { fitRectangle, footprintToRoof, measureRoof, offsetFeet, pitchFactor, pointInPolygon, projectToLocalFeet } from "../src/index.js";

const O = { lng: -81.2, lat: 28.55 };

/** Rotated rectangle footprint of L×W feet, rotated by deg. */
function rotRect(L: number, W: number, deg: number) {
  const a = (deg * Math.PI) / 180;
  const c = Math.cos(a), s = Math.sin(a);
  const corners = [[-L / 2, -W / 2], [L / 2, -W / 2], [L / 2, W / 2], [-L / 2, W / 2]] as const;
  return corners.map(([x, y]) => offsetFeet(O, x * c - y * s, x * s + y * c));
}

describe("fitRectangle", () => {
  it("recovers a rotated rectangle", () => {
    const xy = projectToLocalFeet(rotRect(60, 40, 33), O);
    const fit = fitRectangle(xy)!;
    expect(fit.length).toBeCloseTo(60, 1);
    expect(fit.width).toBeCloseTo(40, 1);
    expect(fit.fill).toBeCloseTo(1, 2);
  });
  it("reports low fill for an L-shape", () => {
    const L = [[0, 0], [60, 0], [60, 20], [30, 20], [30, 40], [0, 40]].map(([x, y]) => ({ x, y }));
    const fit = fitRectangle(L)!;
    expect(fit.fill).toBeCloseTo((60 * 20 + 30 * 20) / (60 * 40), 2);
  });
});

describe("footprintToRoof", () => {
  it("builds a hip roof from a rotated rectangle", () => {
    const { model, autoSplit } = footprintToRoof(rotRect(60, 40, 33), { style: "hip", pitch: 6 });
    expect(autoSplit).toBe(true);
    expect(model.facets.length).toBe(4);
    const r = measureRoof(model);
    expect(r.totalPlanAreaSqFt).toBeCloseTo(2400, 0);
    expect(r.totalAreaSqFt).toBeCloseTo(2400 * pitchFactor(6), 0);
    expect(r.lengthsFt.ridge).toBeCloseTo(20, 1);
    expect(r.lengthsFt.eave).toBeCloseTo(200, 1);
    expect(r.warnings).toEqual([]);
  });
  it("builds a gable roof", () => {
    const { model } = footprintToRoof(rotRect(50, 30, -10), { style: "gable", pitch: 8 });
    const r = measureRoof(model);
    expect(model.facets.length).toBe(2);
    expect(r.lengthsFt.ridge).toBeCloseTo(50, 1);
    expect(r.lengthsFt.rake).toBeCloseTo(4 * 15 * pitchFactor(8), 1);
  });
  it("adds overhang", () => {
    const { model } = footprintToRoof(rotRect(50, 30, 0), { style: "gable", pitch: 6, overhangFt: 1 });
    expect(measureRoof(model).totalPlanAreaSqFt).toBeCloseTo(52 * 32, 0);
  });
  it("falls back to an outline for an L-shape", () => {
    const L = [[0, 0], [60, 0], [60, 20], [30, 20], [30, 40], [0, 40]].map(([x, y]) => offsetFeet(O, x, y));
    const { model, autoSplit } = footprintToRoof(L, { style: "hip", pitch: 6 });
    expect(autoSplit).toBe(false);
    expect(model.facets.length).toBe(1);
    expect(measureRoof(model).totalPlanAreaSqFt).toBeCloseTo(1800, 0);
  });
  it("makes a pyramid hip for a square", () => {
    const { model } = footprintToRoof(rotRect(30, 30, 0), { style: "hip", pitch: 6 });
    expect(model.facets.length).toBe(4);
    expect(measureRoof(model).lengthsFt.ridge).toBe(0);
  });
});

describe("pointInPolygon", () => {
  it("works", () => {
    const sq = rotRect(30, 30, 0);
    expect(pointInPolygon(O, sq)).toBe(true);
    expect(pointInPolygon(offsetFeet(O, 100, 0), sq)).toBe(false);
  });
});
