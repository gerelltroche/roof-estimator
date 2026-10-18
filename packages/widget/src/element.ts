import { createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { decodeWidgetConfig, mergeWidgetConfig, type WidgetConfig } from "./config";
import { RoofQuote, type RoofQuoteLeadEvent, type RoofQuoteQuoteEvent } from "./RoofQuote";
import maplibreCss from "maplibre-gl/dist/maplibre-gl.css?inline";
import css from "./styles.css?inline";

/**
 * <roof-quote> custom element.
 *
 * Attributes (all optional; kebab-case):
 *   mapbox-token, company, phone, email, color, pitch, style (hip|gable),
 *   existing-layers, stories, range-pct, financing-apr, financing-months,
 *   webhook, headline, cta, disclaimer, hide-branding,
 *   config   — a base64url config string from the app's Widget tab
 *              (full pricing + takeoff + branding). Attributes override it.
 *
 * Properties (JS):
 *   el.config = { pricing: {...}, takeoff: {...}, texts: {...}, ... }  (partial, merged)
 *
 * Events (bubble, composed):
 *   "roof-quote:quote" — detail: RoofQuoteQuoteEvent
 *   "roof-quote:lead"  — detail: RoofQuoteLeadEvent. Call event.preventDefault()
 *                        to skip the webhook POST and handle the lead yourself.
 *
 * Styling: light DOM. Set CSS variables (--rq-accent, --rq-radius, --rq-font,
 * --rq-bg, --rq-card, --rq-text, --rq-muted, --rq-line) on the element, or
 * override .rq-* classes directly.
 */
const ATTRS = {
  "mapbox-token": "mapboxToken",
  company: "company",
  phone: "phone",
  email: "email",
  color: "color",
  pitch: "pitch",
  style: "style",
  "existing-layers": "existingLayers",
  stories: "stories",
  "range-pct": "rangePct",
  "financing-apr": "financingApr",
  "financing-months": "financingMonths",
  webhook: "webhook",
  headline: "headline",
  cta: "cta",
  disclaimer: "disclaimer",
} as const;

const NUMERIC = new Set(["pitch", "existingLayers", "stories", "rangePct", "financingApr", "financingMonths"]);

let stylesInjected = false;
function injectStyles() {
  if (stylesInjected || typeof document === "undefined") return;
  const el = document.createElement("style");
  el.setAttribute("data-roof-quote", "");
  el.textContent = maplibreCss + "\n" + css;
  document.head.appendChild(el);
  stylesInjected = true;
}

export class RoofQuoteElement extends HTMLElement {
  static get observedAttributes() {
    return [...Object.keys(ATTRS), "config", "hide-branding"];
  }

  private root: Root | null = null;
  private _config: Partial<WidgetConfig> = {};

  /** Programmatic config (partial). Merged under attributes. */
  get config(): Partial<WidgetConfig> {
    return this._config;
  }
  set config(value: Partial<WidgetConfig>) {
    this._config = value ?? {};
    this.render();
  }

  connectedCallback() {
    injectStyles();
    if (!this.root) this.root = createRoot(this);
    this.render();
  }

  disconnectedCallback() {
    this.root?.unmount();
    this.root = null;
  }

  attributeChangedCallback() {
    if (this.root) this.render();
  }

  private resolvedConfig(): Partial<WidgetConfig> {
    const encoded = this.getAttribute("config");
    const base = encoded ? decodeWidgetConfig(encoded) : {};
    const fromAttrs: Record<string, unknown> = {};
    for (const [attr, key] of Object.entries(ATTRS)) {
      const v = this.getAttribute(attr);
      if (v === null) continue;
      fromAttrs[key] = NUMERIC.has(key) ? Number(v) : v;
    }
    return mergeWidgetConfig({ ...fromAttrs, ...this._config } as Partial<WidgetConfig>, mergeWidgetConfig(base));
  }

  private render() {
    if (!this.root) return;
    const config = this.resolvedConfig();
    this.root.render(
      createElement(RoofQuote, {
        config,
        hideBranding: this.hasAttribute("hide-branding"),
        onQuote: (detail: RoofQuoteQuoteEvent) => {
          this.dispatchEvent(new CustomEvent("roof-quote:quote", { detail, bubbles: true, composed: true }));
        },
        onLead: (detail: RoofQuoteLeadEvent) => {
          const ev = new CustomEvent("roof-quote:lead", { detail, bubbles: true, composed: true, cancelable: true });
          const notCancelled = this.dispatchEvent(ev);
          return notCancelled; // false → skip webhook
        },
      }),
    );
  }
}

export function defineRoofQuote(tag = "roof-quote") {
  if (typeof customElements === "undefined") return;
  if (!customElements.get(tag)) customElements.define(tag, RoofQuoteElement);
}

declare global {
  interface HTMLElementTagNameMap {
    "roof-quote": RoofQuoteElement;
  }
  interface HTMLElementEventMap {
    "roof-quote:quote": CustomEvent<RoofQuoteQuoteEvent>;
    "roof-quote:lead": CustomEvent<RoofQuoteLeadEvent>;
  }
}
