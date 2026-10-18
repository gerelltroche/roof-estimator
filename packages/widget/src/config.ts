import { DEFAULT_PRICING, DEFAULT_TAKEOFF_CONFIG, type PricingConfig, type RoofStyle, type TakeoffConfig } from "@roof-estimator/core";

/**
 * Everything the instant-quote widget needs. Pass it as the `config` prop
 * (React) or set individual attributes on <roof-quote>; a full config can
 * also be base64url-encoded with encodeWidgetConfig() and passed as the
 * `config` attribute or `?c=` URL parameter.
 */
export interface WidgetConfig {
  /** Public Mapbox token (pk.*). Enables footprint detection and Mapbox imagery. */
  mapboxToken?: string;
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
  /** UI copy overrides (for wording or translation). */
  texts?: Partial<WidgetTexts>;
  pricing: PricingConfig;
  takeoff: TakeoffConfig;
}

export interface WidgetTexts {
  addressPlaceholder: string;
  addressSub: string;
  getQuote: string;
  finding: string;
  manualTitle: string;
  manualSub: string;
  manualLabel: string;
  manualTip: string;
  estimate: string;
  tryAnother: string;
  changeAddress: string;
  mostPopular: string;
  perMonth: string;
  name: string;
  email: string;
  phone: string;
  notes: string;
  sending: string;
  thanksTitle: string;
  thanksSub: string;
  startOver: string;
  poweredBy: string;
}

export const DEFAULT_TEXTS: WidgetTexts = {
  addressPlaceholder: "123 Main St, Orlando, FL",
  addressSub: "Enter your address and we'll measure your roof from satellite imagery in seconds.",
  getQuote: "Get quote",
  finding: "Finding your roof…",
  manualTitle: "We couldn't outline your roof automatically",
  manualSub: "No problem. Tell us roughly how big it is and we'll estimate from that.",
  manualLabel: "Approximate roof size (sq ft)",
  manualTip: "Tip: for a single-story home, the roof is usually 1.1–1.3× the home's living area.",
  estimate: "Estimate",
  tryAnother: "Try another address",
  changeAddress: "Change address",
  mostPopular: "Most popular",
  perMonth: "or ~{amount}/mo",
  name: "Your name",
  email: "Email",
  phone: "Phone",
  notes: "Anything we should know? (leaks, age of roof, insurance claim…)",
  sending: "Sending…",
  thanksTitle: "Thanks! We'll be in touch shortly.",
  thanksSub: "{company} will confirm your exact price after a free inspection.",
  startOver: "Start over",
  poweredBy: "Powered by",
};

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

export function decodeWidgetConfig(param: string | null | undefined): WidgetConfig {
  if (!param) return DEFAULT_WIDGET_CONFIG;
  try {
    return mergeWidgetConfig(JSON.parse(fromBase64Url(param)) as Partial<WidgetConfig>);
  } catch {
    return DEFAULT_WIDGET_CONFIG;
  }
}

/** Fill in a partial config with defaults (deep for pricing/takeoff/texts). */
export function mergeWidgetConfig(partial: Partial<WidgetConfig>, base: WidgetConfig = DEFAULT_WIDGET_CONFIG): WidgetConfig {
  return {
    ...base,
    ...partial,
    pricing: { ...base.pricing, ...(partial.pricing ?? {}) },
    takeoff: { ...base.takeoff, ...(partial.takeoff ?? {}) },
    texts: { ...(base.texts ?? {}), ...(partial.texts ?? {}) },
  };
}

/** Monthly payment for an amortized loan. */
export function monthlyPayment(principal: number, aprPct: number, months: number): number {
  if (months <= 0) return 0;
  const r = aprPct / 100 / 12;
  if (r === 0) return principal / months;
  return (principal * r) / (1 - Math.pow(1 + r, -months));
}
