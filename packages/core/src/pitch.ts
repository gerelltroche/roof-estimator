import type { Pitch } from "./types.js";

/**
 * Pitch factor (a.k.a. slope factor): multiply plan length/area by this to get
 * true sloped length/area along the fall line.
 *
 *   factor = sqrt(rise² + 12²) / 12
 */
export function pitchFactor(pitch: Pitch): number {
  return Math.sqrt(pitch * pitch + 144) / 12;
}

/**
 * Hip/valley factor relative to the hip's *plan* length, assuming the hip runs
 * at 45° in plan between two facets of equal pitch (the usual case).
 *
 * Along a 45° hip, 12" of plan-diagonal travel covers 12/√2 of run on each
 * facet, so the rise over that distance is pitch/√2:
 *
 *   factor = sqrt(1 + (pitch/12)² / 2)
 *
 * This is the same number as the classic "hip/valley factor" table
 * (sqrt(rise² + 288) / 12) divided by √2, because that table is expressed per
 * foot of *run*, not per foot of plan diagonal.
 */
export function hipValleyFactor(pitch: Pitch): number {
  const slope = pitch / 12;
  return Math.sqrt(1 + (slope * slope) / 2);
}

/** Classic tabulated hip/valley factor, per foot of common run. */
export function hipValleyFactorPerRun(pitch: Pitch): number {
  return Math.sqrt(pitch * pitch + 288) / 12;
}

export function pitchToDegrees(pitch: Pitch): number {
  return (Math.atan(pitch / 12) * 180) / Math.PI;
}

export function degreesToPitch(deg: number): Pitch {
  return Math.tan((deg * Math.PI) / 180) * 12;
}

export function pitchToPercent(pitch: Pitch): number {
  return (pitch / 12) * 100;
}

/**
 * Parse user input like "6/12", "6:12", "6", "26.57deg", "50%".
 * Returns rise-over-12 or throws.
 */
export function parsePitch(input: string | number): Pitch {
  if (typeof input === "number") return input;
  const s = input.trim().toLowerCase();
  let m: RegExpMatchArray | null;
  if ((m = s.match(/^(\d+(?:\.\d+)?)\s*[/:]\s*(\d+(?:\.\d+)?)$/))) {
    const rise = Number(m[1]);
    const run = Number(m[2]);
    if (run === 0) throw new Error(`Invalid pitch: ${input}`);
    return (rise / run) * 12;
  }
  if ((m = s.match(/^(\d+(?:\.\d+)?)\s*(deg|°)$/))) return degreesToPitch(Number(m[1]));
  if ((m = s.match(/^(\d+(?:\.\d+)?)\s*%$/))) return (Number(m[1]) / 100) * 12;
  if ((m = s.match(/^(\d+(?:\.\d+)?)$/))) return Number(m[1]);
  throw new Error(`Invalid pitch: ${input}`);
}

export function formatPitch(pitch: Pitch): string {
  const r = Math.round(pitch * 100) / 100;
  return `${Number.isInteger(r) ? r : r.toFixed(1)}/12`;
}

/**
 * Labor-difficulty tier. These match how most contractors price labor:
 * walkable (≤ 6/12), steep (7–9/12), very steep (≥ 10/12).
 */
export type SteepnessTier = "flat" | "walkable" | "steep" | "very-steep";

export function steepnessTier(pitch: Pitch): SteepnessTier {
  if (pitch < 2) return "flat";
  if (pitch <= 6) return "walkable";
  if (pitch <= 9) return "steep";
  return "very-steep";
}
