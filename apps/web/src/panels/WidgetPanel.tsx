import type { RoofStyle } from "@roof-estimator/core";
import { DEFAULT_WIDGET_CONFIG, encodeWidgetConfig, type WidgetConfig } from "@roof-estimator/widget/react";
import { useEffect, useMemo, useState } from "react";
import type { AppState } from "../state";

const KEY = "roof-estimator:widget:v1";
/** Where the built component is hosted. Mirrors the Pages deploy; change for self-hosting. */
const CDN_BASE = "https://gerelltroche.github.io/roof-estimator/widget";

type Branding = Omit<WidgetConfig, "pricing" | "takeoff">;

function defaults(): Branding {
  const { pricing: _p, takeoff: _t, ...rest } = DEFAULT_WIDGET_CONFIG;
  return rest;
}
function loadBranding(): Branding {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? { ...defaults(), ...(JSON.parse(raw) as Partial<Branding>) } : defaults();
  } catch {
    return defaults();
  }
}

type Snippet = "html" | "astro" | "react";

export function WidgetPanel({ state }: { state: AppState }) {
  const [b, setB] = useState<Branding>(loadBranding);
  const [snippet, setSnippet] = useState<Snippet>("astro");
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(b));
    } catch {
      /* ignore */
    }
  }, [b]);

  // Pricing/takeoff come from the app; branding from this panel. The Mapbox
  // token is NOT baked in: clients supply their own via the attribute.
  const encoded = useMemo(() => {
    const { mapboxToken: _t, ...rest } = b;
    const cfg: WidgetConfig = { ...rest, pricing: state.pricingConfig, takeoff: state.takeoffConfig };
    return encodeWidgetConfig(cfg);
  }, [b, state.pricingConfig, state.takeoffConfig]);

  const previewUrl = useMemo(() => {
    const u = new URL("widget.html", location.href);
    u.searchParams.set("c", encoded);
    return u.toString();
  }, [encoded]);

  const tag = `<roof-quote
  mapbox-token="YOUR_MAPBOX_PUBLIC_TOKEN"
  config="${encoded}"
></roof-quote>`;

  const snippets: Record<Snippet, string> = {
    html: `<!-- Anywhere in your page -->
<script type="module" src="${CDN_BASE}/roof-quote.js"></script>

${tag}

<style>
  roof-quote { --rq-accent: ${b.color}; --rq-radius: 10px; }
</style>

<script>
  // Optional: handle leads in your own code (preventDefault skips the webhook)
  document.querySelector("roof-quote").addEventListener("roof-quote:lead", (e) => {
    console.log(e.detail);
  });
</script>`,
    astro: `---
// src/components/RoofQuote.astro
// pnpm add @roof-estimator/widget   (or use the <script src> CDN tag instead)
const token = import.meta.env.PUBLIC_MAPBOX_TOKEN;
---
<roof-quote
  mapbox-token={token}
  config="${encoded}"
></roof-quote>

<script>
  import "@roof-estimator/widget";

  document.querySelector("roof-quote")?.addEventListener("roof-quote:lead", (e) => {
    // e.detail has the lead + roof measurements + tier prices.
    // e.preventDefault() if you want to skip the webhook and POST it yourself.
  });
</script>

<style>
  roof-quote { --rq-accent: ${b.color}; --rq-radius: 10px; --rq-font: inherit; }
</style>`,
    react: `import { RoofQuote, decodeWidgetConfig } from "@roof-estimator/widget/react";
import "@roof-estimator/widget/styles.css";

const config = decodeWidgetConfig("${encoded}");

export function Quote() {
  return (
    <RoofQuote
      config={{ ...config, mapboxToken: process.env.NEXT_PUBLIC_MAPBOX_TOKEN }}
      onLead={(lead) => console.log(lead)}
    />
  );
}`,
  };

  const set = (patch: Partial<Branding>) => setB({ ...b, ...patch });
  const copy = (text: string) => {
    void navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  return (
    <div className="panel">
      <section>
        <h3>Instant quote widget</h3>
        <p className="hint">
          <code>&lt;roof-quote&gt;</code> is a web component: one script, one tag, works in Astro, plain HTML, WordPress, React, Vue,
          Svelte. The homeowner types an address, the roof is measured from its building footprint, and they see Good / Better / Best
          ranges priced with the settings in your Takeoff and Estimate tabs, plus a lead form. Everything below is encoded in the{" "}
          <code>config</code> attribute, so there is no server.
        </p>
        <div className="row">
          <a className="button-link" href={previewUrl} target="_blank" rel="noreferrer">
            Preview ↗
          </a>
          <a className="button-link" href={new URL("demo.html", location.href).toString()} target="_blank" rel="noreferrer">
            See it on a sample site ↗
          </a>
        </div>
      </section>

      <section>
        <h3>Embed code</h3>
        <div className="row">
          {(["astro", "html", "react"] as Snippet[]).map((s) => (
            <button key={s} className={`small ${snippet === s ? "primary" : ""}`} onClick={() => setSnippet(s)}>
              {s === "html" ? "HTML / any site" : s === "astro" ? "Astro" : "React"}
            </button>
          ))}
          <button className="small" onClick={() => copy(snippets[snippet])}>
            {copied ? "Copied!" : "Copy"}
          </button>
        </div>
        <textarea readOnly rows={14} value={snippets[snippet]} onFocus={(e) => e.target.select()} spellCheck={false} />
        <p className="hint">
          Your clients need their own free Mapbox token (restricted to their domain) in <code>mapbox-token</code>; it's not stored in the
          config. Theme with CSS variables (<code>--rq-accent</code>, <code>--rq-radius</code>, <code>--rq-font</code>,{" "}
          <code>--rq-bg</code>, <code>--rq-card</code>, <code>--rq-text</code>) or override any <code>.rq-*</code> class; the widget
          renders in the page's DOM, not a shadow root or iframe.
        </p>
      </section>

      <section>
        <h3>Branding</h3>
        <label>
          Company name
          <input value={b.company} onChange={(e) => set({ company: e.target.value })} />
        </label>
        <div className="grid2">
          <label>
            Phone
            <input value={b.phone ?? ""} onChange={(e) => set({ phone: e.target.value })} />
          </label>
          <label>
            Accent color
            <input type="color" value={b.color} onChange={(e) => set({ color: e.target.value })} />
          </label>
        </div>
        <label>
          Headline
          <input value={b.headline} onChange={(e) => set({ headline: e.target.value })} />
        </label>
        <label>
          Button text
          <input value={b.cta} onChange={(e) => set({ cta: e.target.value })} />
        </label>
        <label>
          Disclaimer
          <textarea rows={3} value={b.disclaimer} onChange={(e) => set({ disclaimer: e.target.value })} />
        </label>
      </section>

      <section>
        <h3>Quote assumptions</h3>
        <div className="grid2">
          <label>
            Assumed pitch (rise/12)
            <input type="number" min={0} max={18} step={1} value={b.pitch} onChange={(e) => set({ pitch: Number(e.target.value) })} />
          </label>
          <label>
            Roof style
            <select value={b.style} onChange={(e) => set({ style: e.target.value as RoofStyle })}>
              <option value="hip">Hip</option>
              <option value="gable">Gable</option>
            </select>
          </label>
          <label>
            Existing layers
            <input type="number" min={0} max={3} value={b.existingLayers} onChange={(e) => set({ existingLayers: Number(e.target.value) })} />
          </label>
          <label>
            Stories
            <input type="number" min={1} max={3} value={b.stories} onChange={(e) => set({ stories: Number(e.target.value) })} />
          </label>
          <label>
            Price range ± %
            <input type="number" min={0} max={40} value={b.rangePct} onChange={(e) => set({ rangePct: Number(e.target.value) })} />
          </label>
        </div>
        <p className="hint">Material prices, labor, overhead and profit come from the Takeoff and Estimate tabs and are baked into the config.</p>
      </section>

      <section>
        <h3>Financing teaser</h3>
        <div className="grid2">
          <label>
            APR % (blank to hide)
            <input
              type="number"
              step={0.01}
              value={b.financingApr ?? ""}
              onChange={(e) => set({ financingApr: e.target.value === "" ? undefined : Number(e.target.value) })}
            />
          </label>
          <label>
            Term (months)
            <input type="number" value={b.financingMonths ?? ""} onChange={(e) => set({ financingMonths: e.target.value === "" ? undefined : Number(e.target.value) })} />
          </label>
        </div>
      </section>

      <section>
        <h3>Lead delivery</h3>
        <label>
          Webhook URL (POST JSON)
          <input placeholder="https://hooks.zapier.com/… or your CRM endpoint" value={b.webhook ?? ""} onChange={(e) => set({ webhook: e.target.value })} />
        </label>
        <p className="hint">
          Each submission POSTs the lead, address, roof measurements and tier prices as JSON. The element also dispatches a{" "}
          <code>roof-quote:lead</code> DOM event with the same payload; call <code>preventDefault()</code> on it to handle delivery
          yourself and skip the webhook.
        </p>
      </section>
    </div>
  );
}
