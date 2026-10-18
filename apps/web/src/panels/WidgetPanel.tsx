import type { RoofStyle } from "@roof-estimator/core";
import { useEffect, useMemo, useState } from "react";
import type { AppState } from "../state";
import { DEFAULT_WIDGET_CONFIG, encodeWidgetConfig, type WidgetConfig } from "../widget/config";

const KEY = "roof-estimator:widget:v1";

type Branding = Omit<WidgetConfig, "pricing" | "takeoff">;

function loadBranding(): Branding {
  try {
    const raw = localStorage.getItem(KEY);
    const { pricing: _p, takeoff: _t, ...defaults } = DEFAULT_WIDGET_CONFIG;
    return raw ? { ...defaults, ...(JSON.parse(raw) as Partial<Branding>) } : defaults;
  } catch {
    const { pricing: _p, takeoff: _t, ...defaults } = DEFAULT_WIDGET_CONFIG;
    return defaults;
  }
}

export function WidgetPanel({ state }: { state: AppState }) {
  const [b, setB] = useState<Branding>(loadBranding);
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(b));
    } catch {
      /* ignore */
    }
  }, [b]);

  const url = useMemo(() => {
    const cfg: WidgetConfig = { ...b, pricing: state.pricingConfig, takeoff: state.takeoffConfig };
    const base = new URL("widget.html", location.href);
    base.searchParams.set("c", encodeWidgetConfig(cfg));
    return base.toString();
  }, [b, state.pricingConfig, state.takeoffConfig]);

  const embed = `<iframe src="${url}" style="width:100%;max-width:760px;height:900px;border:0;border-radius:12px" title="Instant roof quote"></iframe>`;
  const set = (patch: Partial<Branding>) => setB({ ...b, ...patch });

  return (
    <div className="panel">
      <section>
        <h3>Instant quote widget</h3>
        <p className="hint">
          A homeowner-facing page: they type an address, we find the roof from OpenStreetMap, price it with the settings in your Takeoff and
          Estimate tabs, and show Good / Better / Best ranges with a lead form. Embed it on your site with the snippet below. Everything is
          encoded in the URL, so there is no server and no account.
        </p>
        <div className="row">
          <a className="button-link" href={url} target="_blank" rel="noreferrer">
            Preview widget ↗
          </a>
          <button
            onClick={() => {
              void navigator.clipboard.writeText(embed).then(() => {
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              });
            }}
          >
            {copied ? "Copied!" : "Copy embed code"}
          </button>
        </div>
        <textarea readOnly rows={4} value={embed} onFocus={(e) => e.target.select()} />
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
        <p className="hint">Material prices, labor, overhead and profit come from the Takeoff and Estimate tabs and are baked into the URL.</p>
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
          Each submission POSTs the lead, address, roof measurements and tier prices as JSON. Works with Zapier, Make, n8n, or any endpoint
          that accepts CORS requests. The widget also fires a <code>postMessage</code> to the parent page with the same payload, so you
          can catch it in your own site's JavaScript without any server.
        </p>
      </section>
    </div>
  );
}
