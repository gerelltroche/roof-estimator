import { describe, expect, it } from "vitest";
import { hipValleyFactor, hipValleyFactorPerRun, parsePitch, pitchFactor, pitchToDegrees, steepnessTier } from "../src/index.js";

describe("pitch", () => {
  it("computes the classic pitch factor table", () => {
    // Values from any roofing reference table.
    expect(pitchFactor(0)).toBeCloseTo(1.0, 4);
    expect(pitchFactor(4)).toBeCloseTo(1.054, 3);
    expect(pitchFactor(6)).toBeCloseTo(1.118, 3);
    expect(pitchFactor(8)).toBeCloseTo(1.202, 3);
    expect(pitchFactor(12)).toBeCloseTo(1.414, 3);
  });

  it("computes the hip/valley factor per foot of run", () => {
    expect(hipValleyFactorPerRun(6)).toBeCloseTo(1.5, 3); // sqrt(36+288)/12 = 18/12
    expect(hipValleyFactorPerRun(12)).toBeCloseTo(1.732, 3);
  });

  it("hip factor per plan diagonal equals per-run factor / sqrt2", () => {
    for (const p of [3, 6, 9, 12]) {
      expect(hipValleyFactor(p)).toBeCloseTo(hipValleyFactorPerRun(p) / Math.SQRT2, 6);
    }
  });

  it("parses common pitch notations", () => {
    expect(parsePitch("6/12")).toBe(6);
    expect(parsePitch("6:12")).toBe(6);
    expect(parsePitch("6")).toBe(6);
    expect(parsePitch("3/6")).toBeCloseTo(6);
    expect(parsePitch("45deg")).toBeCloseTo(12, 6);
    expect(parsePitch("50%")).toBe(6);
    expect(() => parsePitch("steep")).toThrow();
  });

  it("converts to degrees", () => {
    expect(pitchToDegrees(12)).toBeCloseTo(45);
    expect(pitchToDegrees(6)).toBeCloseTo(26.565, 2);
  });

  it("tiers steepness", () => {
    expect(steepnessTier(1)).toBe("flat");
    expect(steepnessTier(6)).toBe("walkable");
    expect(steepnessTier(8)).toBe("steep");
    expect(steepnessTier(12)).toBe("very-steep");
  });
});
