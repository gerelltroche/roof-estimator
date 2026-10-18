import { DEFAULT_PRICING, DEFAULT_TAKEOFF_CONFIG, type PricingConfig, type RoofStyle, type TakeoffConfig } from "@roof-estimator/core";

/** Everything the embeddable instant-quote widget needs, encoded into its URL. */
export interface WidgetConfig {
  company: string;
  phone?: string;
  email?: string;
  /** Accent color, hex. */
  color: string;
  /** Pitch assumed for every roof (homeowners don't know theirs). */
  pitch: number;
  style: RoofStyle;
  /** Existing layers assumed for tear-off pricing. */
  existingLayers: number;
  stories: number;
  /** Show each tier as a range of ±rangePct around the computed price. */
  rangePct: number;
  /** Optional financing teaser: APR % and term in months. */
  financingApr?: number;
  financingMonths?: number;
  /** POST lead + quote JSON here. */
  webhook?: string;
  headline: string;
  cta: string;
  disclaimer: string;
  pricing: PricingConfig;
  takeoff: TakeoffConfig;
}

export const DEFAULT_WIDGET_CONFIG: WidgetConfig = {
  company: "Your Roofing Company",
  phone: "",
  email: "",
  color: "#f59e0b",
  pitch: 6,
  style: "hip",
  existingLayers: 1,
  stories: 1,
  rangePct: 12,
  financingApr: 9.99,
  financingMonths: 120,
  webhook: "",
  headline: "Get an instant roof quote",
  cta: "Get my exact quote",
  disclaimer:
    "Instant estimate based on satellite building footprint and standard assumptions. Final pricing is confirmed after a free on-site inspection.",
  pricing: DEFAULT_PRICING,
  takeoff: DEFAULT_TAKEOFF_CONFIG,
};

function toBase64Url(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(s: string): string {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (s.length % 4)) % 4);
  const bin = atob(b64);
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

export function encodeWidgetConfig(c: WidgetConfig): string {
  return toBase64Url(JSON.stringify(c));
}

export function decodeWidgetConfig(param: string | null): WidgetConfig {
  if (!param) return DEFAULT_WIDGET_CONFIG;
  try {
    const parsed = JSON.parse(fromBase64Url(param)) as Partial<WidgetConfig>;
    return {
      ...DEFAULT_WIDGET_CONFIG,
      ...parsed,
      pricing: { ...DEFAULT_PRICING, ...(parsed.pricing ?? {}) },
      takeoff: { ...DEFAULT_TAKEOFF_CONFIG, ...(parsed.takeoff ?? {}) },
    };
  } catch {
    return DEFAULT_WIDGET_CONFIG;
  }
}

/** Monthly payment for an amortized loan. */
export function monthlyPayment(principal: number, aprPct: number, months: number): number {
  if (months <= 0) return 0;
  const r = aprPct / 100 / 12;
  if (r === 0) return principal / months;
  return (principal * r) / (1 - Math.pow(1 + r, -months));
}
