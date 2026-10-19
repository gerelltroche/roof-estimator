import {
  buildTakeoff,
  footprintToRoof,
  formatPitch,
  measureRoof,
  priceAllTiers,
  type Estimate,
  type LngLat,
  type MeasurementReport,
  type RoofModel,
} from "@roof-estimator/core";
import { fetchFootprints, geocode, satelliteStyle } from "@roof-estimator/geo";
import { useEffect, useMemo, useRef, useState } from "react";
import { DEFAULT_TEXTS, mergeWidgetConfig, monthlyPayment, type WidgetConfig, type WidgetTexts } from "./config";

type Step = "address" | "loading" | "details" | "quote" | "manual" | "sent";

export interface Quote {
  address: string;
  center: LngLat;
  model: RoofModel | null;
  report: MeasurementReport;
  estimates: Estimate[];
  source: "footprint" | "manual";
}

export interface RoofQuoteQuoteEvent {
  address: string;
  location: LngLat;
  source: "footprint" | "manual";
  areaSqFt: number;
  squares: number;
  tiers: { name: string; price: number; low: number; high: number }[];
}

export interface RoofQuoteLeadEvent extends RoofQuoteQuoteEvent {
  lead: { name: string; email: string; phone: string; notes: string };
  submittedAt: string;
  assumedPitch: string;
  lengthsFt: MeasurementReport["lengthsFt"];
  model: RoofModel | null;
}

export interface RoofQuoteProps {
  /** Partial config; merged with defaults. */
  config?: Partial<WidgetConfig>;
  /** Fired when a quote is computed and shown. */
  onQuote?: (e: RoofQuoteQuoteEvent) => void;
  /**
   * Fired when the homeowner submits the lead form, before the webhook POST.
   * Return false (or a promise resolving to false) to skip the webhook.
   */
  onLead?: (e: RoofQuoteLeadEvent) => void | boolean | Promise<void | boolean>;
  /** Extra class names on the root. */
  className?: string;
  /** Hide the "Powered by" footer. */
  hideBranding?: boolean;
}

const usd0 = (v: number) => "$" + Math.round(v).toLocaleString("en-US");
const fill = (t: string, vars: Record<string, string>) => t.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? "");

export function RoofQuote({ config: partial, onQuote, onLead, className, hideBranding }: RoofQuoteProps) {
  const config = useMemo(() => mergeWidgetConfig(partial ?? {}), [partial]);
  const T: WidgetTexts = useMemo(() => ({ ...DEFAULT_TEXTS, ...(config.texts ?? {}) }), [config.texts]);
  const [step, setStep] = useState<Step>("address");
  const [address, setAddress] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [manualSqFt, setManualSqFt] = useState("");
  const [center, setCenter] = useState<LngLat | null>(null);
  // lead-gate="before": the lead is captured between measuring and pricing.
  const [leadSent, setLeadSent] = useState(false);
  const r = config.rangePct / 100;

  const priceFor = (model: RoofModel | null, report: MeasurementReport) => {
    const takeoff = buildTakeoff(report, { ...config.takeoff, wastePct: report.suggestedWastePct });
    const m: RoofModel = model ?? { facets: [] };
    return priceAllTiers({ ...m, existingLayers: config.existingLayers, stories: config.stories }, report, takeoff, config.pricing);
  };

  const toQuoteEvent = (q: Quote): RoofQuoteQuoteEvent => ({
    address: q.address,
    location: q.center,
    source: q.source,
    areaSqFt: Math.round(q.report.totalAreaSqFt),
    squares: Number(q.report.squares.toFixed(2)),
    tiers: q.estimates.map((e) => ({ name: e.tierName, price: e.total, low: Math.round(e.total * (1 - r)), high: Math.round(e.total * (1 + r)) })),
  });

  const showQuote = (q: Quote) => {
    setQuote(q);
    if (config.leadGate === "before" && !leadSent) {
      setStep("details");
      return;
    }
    setStep("quote");
    onQuote?.(toQuoteEvent(q));
  };

  const reveal = () => {
    if (!quote) return;
    setLeadSent(true);
    setStep("quote");
    onQuote?.(toQuoteEvent(quote));
  };

  const reset = () => {
    setLeadSent(false);
    setQuote(null);
    setStep("address");
  };

  const run = async () => {
    if (!address.trim()) return;
    setError(null);
    setStep("loading");
    try {
      const results = await geocode(address, { mapboxToken: config.mapboxToken });
      const hit = results[0];
      if (!hit) throw new Error("We couldn't find that address. Try adding the city and state.");
      setCenter(hit.center);
      if (!config.mapboxToken) {
        setStep("manual");
        return;
      }
      const { footprints } = await fetchFootprints(hit.center, { mapboxToken: config.mapboxToken, radiusM: 35 }).catch(() => ({ footprints: [] }));
      const fp = footprints[0];
      if (!fp) {
        setStep("manual");
        return;
      }
      const { model } = footprintToRoof(fp.polygon, { style: config.style, pitch: config.pitch, overhangFt: 1 });
      model.address = hit.displayName;
      const report = measureRoof(model);
      showQuote({ address: hit.displayName, center: hit.center, model, report, estimates: priceFor(model, report), source: "footprint" });
    } catch (err) {
      setError((err as Error).message);
      setStep("address");
    }
  };

  const runManual = () => {
    const sqft = Number(manualSqFt);
    if (!sqft || sqft < 200) {
      setError("Enter the approximate roof size in square feet.");
      return;
    }
    const base = measureRoof({ facets: [] });
    const synthetic: MeasurementReport = {
      ...base,
      totalAreaSqFt: sqft,
      totalPlanAreaSqFt: sqft,
      squares: sqft / 100,
      predominantPitch: config.pitch,
      areasByPitch: [{ pitch: config.pitch, areaSqFt: sqft, pct: 100 }],
      // Rough edge lengths from a 1.5:1 rectangle so starter/drip/cap are non-zero.
      lengthsFt: {
        ...base.lengthsFt,
        eave: 2 * Math.sqrt(sqft / 1.5) + Math.sqrt(sqft * 1.5),
        ridge: Math.sqrt(sqft * 1.5) * 0.4,
        hip: Math.sqrt(sqft) * 1.5,
      },
      complexity: "normal",
      suggestedWastePct: 13,
    };
    setError(null);
    showQuote({ address, center: center ?? { lng: 0, lat: 0 }, model: null, report: synthetic, estimates: priceFor(null, synthetic), source: "manual" });
  };

  return (
    <div className={`roof-quote ${className ?? ""}`} style={{ ["--rq-accent-override" as string]: config.color }}>
      <div className="rq-stack">
        <header className="rq-header">
          <div className="rq-company">{config.company}</div>
          {config.phone && (
            <a className="rq-phone" href={`tel:${config.phone.replace(/[^0-9+]/g, "")}`}>
              {config.phone}
            </a>
          )}
        </header>

        {step === "address" && (
          <section className="rq-card rq-step-address">
            <h1>{config.headline}</h1>
            <p className="rq-sub">{T.addressSub}</p>
            <form
              className="rq-addr"
              onSubmit={(e) => {
                e.preventDefault();
                void run();
              }}
            >
              <input autoFocus placeholder={T.addressPlaceholder} value={address} onChange={(e) => setAddress(e.target.value)} />
              <button type="submit" className="rq-btn">
                {T.getQuote}
              </button>
            </form>
            {error && <p className="rq-error">{error}</p>}
          </section>
        )}

        {step === "loading" && (
          <section className="rq-card rq-center rq-step-loading">
            <div className="rq-spinner" />
            <p>{T.finding}</p>
          </section>
        )}

        {step === "manual" && (
          <section className="rq-card rq-step-manual">
            <h2>{T.manualTitle}</h2>
            <p className="rq-sub">{T.manualSub}</p>
            <label className="rq-label">
              {T.manualLabel}
              <input type="number" inputMode="numeric" placeholder="e.g. 2400" value={manualSqFt} onChange={(e) => setManualSqFt(e.target.value)} />
            </label>
            <p className="rq-hint">{T.manualTip}</p>
            {error && <p className="rq-error">{error}</p>}
            <div className="rq-row">
              <button className="rq-btn" onClick={runManual}>
                {T.estimate}
              </button>
              <button className="rq-link" onClick={reset}>
                {T.tryAnother}
              </button>
            </div>
          </section>
        )}

        {step === "details" && quote && (
          <DetailsView quote={quote} config={config} T={T} toEvent={toQuoteEvent} onLead={onLead} onRevealed={reveal} onReset={reset} />
        )}

        {step === "quote" && quote && (
          <QuoteView
            quote={quote}
            config={config}
            T={T}
            toEvent={toQuoteEvent}
            onLead={onLead}
            leadSent={leadSent}
            onSent={() => setStep("sent")}
            onReset={reset}
          />
        )}

        {step === "sent" && (
          <section className="rq-card rq-center rq-step-sent">
            <h2>{T.thanksTitle}</h2>
            <p className="rq-sub">{fill(T.thanksSub, { company: config.company })}</p>
            <button className="rq-link" onClick={reset}>
              {T.startOver}
            </button>
          </section>
        )}

        {!hideBranding && (
          <footer className="rq-footer">
            {T.poweredBy} <a href="https://github.com/gerelltroche/roof-estimator">Roof Estimator</a>
          </footer>
        )}
      </div>
    </div>
  );
}

type Lead = RoofQuoteLeadEvent["lead"];

/** Lead form state + the submit that fires onLead and POSTs the webhook. Shared by both lead cards. */
function useLeadSubmit(
  quote: Quote,
  config: WidgetConfig,
  toEvent: (q: Quote) => RoofQuoteQuoteEvent,
  onLead: RoofQuoteProps["onLead"],
  onDone: () => void,
) {
  const [lead, setLead] = useState<Lead>({ name: "", email: "", phone: "", notes: "" });
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!lead.name || (!lead.email && !lead.phone)) {
      setError("Please enter your name and an email or phone number.");
      return;
    }
    setSending(true);
    setError(null);
    const payload: RoofQuoteLeadEvent = {
      ...toEvent(quote),
      lead,
      submittedAt: new Date().toISOString(),
      assumedPitch: formatPitch(config.pitch),
      lengthsFt: quote.report.lengthsFt,
      model: quote.model,
    };
    try {
      const proceed = (await onLead?.(payload)) !== false;
      if (proceed && config.webhook) {
        const res = await fetch(config.webhook, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...payload, widget: "roof-estimator" }),
        });
        if (!res.ok) throw new Error(`Lead delivery failed (${res.status})`);
      }
      onDone();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSending(false);
    }
  };

  return { lead, setLead, sending, error, submit };
}

function LeadFields({ lead, setLead, T }: { lead: Lead; setLead: (l: Lead) => void; T: WidgetTexts }) {
  return (
    <>
      <input placeholder={T.name} autoComplete="name" value={lead.name} onChange={(e) => setLead({ ...lead, name: e.target.value })} />
      <input type="email" placeholder={T.email} autoComplete="email" value={lead.email} onChange={(e) => setLead({ ...lead, email: e.target.value })} />
      <input type="tel" placeholder={T.phone} autoComplete="tel" value={lead.phone} onChange={(e) => setLead({ ...lead, phone: e.target.value })} />
      <textarea placeholder={T.notes} rows={2} value={lead.notes} onChange={(e) => setLead({ ...lead, notes: e.target.value })} />
    </>
  );
}

/** lead-gate="before": the roof is measured, the price is held back until the homeowner leaves their details. */
function DetailsView({
  quote,
  config,
  T,
  toEvent,
  onLead,
  onRevealed,
  onReset,
}: {
  quote: Quote;
  config: WidgetConfig;
  T: WidgetTexts;
  toEvent: (q: Quote) => RoofQuoteQuoteEvent;
  onLead?: RoofQuoteProps["onLead"];
  onRevealed: () => void;
  onReset: () => void;
}) {
  const { lead, setLead, sending, error, submit } = useLeadSubmit(quote, config, toEvent, onLead, onRevealed);
  const sqft = Math.round(quote.report.totalAreaSqFt).toLocaleString();
  return (
    <>
      <section className="rq-card rq-quote rq-step-details">
        <div className="rq-quote-head">
          <div>
            <div className="rq-addr-line">{quote.address}</div>
            <div className="rq-roof-stats">
              <strong>{sqft} ft²</strong> roof · {quote.report.squares.toFixed(1)} squares · {formatPitch(config.pitch)} pitch assumed
              {quote.source === "manual" && " · size entered manually"}
            </div>
          </div>
          <button className="rq-link" onClick={onReset}>
            {T.changeAddress}
          </button>
        </div>
        {quote.model && <RoofMap model={quote.model} center={quote.center} mapboxToken={config.mapboxToken} accent={config.color} />}
      </section>

      <section className="rq-card rq-lead-card rq-gate-card">
        <h2>{T.gateTitle}</h2>
        <p className="rq-sub">{fill(T.gateSub, { sqft, address: quote.address, company: config.company })}</p>
        <form className="rq-lead" onSubmit={(e) => void submit(e)}>
          <LeadFields lead={lead} setLead={setLead} T={T} />
          {error && <p className="rq-error">{error}</p>}
          <button type="submit" className="rq-btn" disabled={sending}>
            {sending ? T.sending : T.gateCta}
          </button>
        </form>
        <p className="rq-fine">{T.gateFine}</p>
      </section>
    </>
  );
}

function QuoteView({
  quote,
  config,
  T,
  toEvent,
  onLead,
  leadSent,
  onSent,
  onReset,
}: {
  quote: Quote;
  config: WidgetConfig;
  T: WidgetTexts;
  toEvent: (q: Quote) => RoofQuoteQuoteEvent;
  onLead?: RoofQuoteProps["onLead"];
  /** True when the lead was already captured by the gate; the lead form is replaced by a confirmation. */
  leadSent: boolean;
  onSent: () => void;
  onReset: () => void;
}) {
  const { lead, setLead, sending, error, submit } = useLeadSubmit(quote, config, toEvent, onLead, onSent);
  const r = config.rangePct / 100;
  const financingFine =
    config.financingApr !== undefined && config.financingMonths
      ? ` *Monthly figure assumes ${config.financingApr}% APR over ${config.financingMonths} months with approved credit; not an offer of credit.`
      : "";

  return (
    <>
      <section className="rq-card rq-quote">
        <div className="rq-quote-head">
          <div>
            <div className="rq-addr-line">{quote.address}</div>
            <div className="rq-roof-stats">
              <strong>{Math.round(quote.report.totalAreaSqFt).toLocaleString()} ft²</strong> roof · {quote.report.squares.toFixed(1)} squares ·{" "}
              {formatPitch(config.pitch)} pitch assumed
              {quote.source === "manual" && " · size entered manually"}
            </div>
          </div>
          <button className="rq-link" onClick={onReset}>
            {T.changeAddress}
          </button>
        </div>
        {quote.model && <RoofMap model={quote.model} center={quote.center} mapboxToken={config.mapboxToken} accent={config.color} />}
      </section>

      <section className="rq-tiers">
        {quote.estimates.map((e, i) => {
          const tier = config.pricing.tiers[i];
          const low = e.total * (1 - r);
          const high = e.total * (1 + r);
          const monthly =
            config.financingApr !== undefined && config.financingMonths ? monthlyPayment(e.total, config.financingApr, config.financingMonths) : null;
          return (
            <div key={e.tierName} className={`rq-tier ${i === 1 ? "rq-tier-featured" : ""}`} data-tier={e.tierName.toLowerCase()}>
              {i === 1 && <div className="rq-badge">{T.mostPopular}</div>}
              <div className="rq-tier-name">{e.tierName}</div>
              <div className="rq-tier-price">
                {usd0(low)} – {usd0(high)}
              </div>
              {monthly !== null && (
                <div className="rq-tier-monthly">
                  {fill(T.perMonth, { amount: usd0(monthly) })}
                  <span className="rq-fine">*</span>
                </div>
              )}
              {tier?.description && <p className="rq-tier-desc">{tier.description}</p>}
            </div>
          );
        })}
      </section>

      {leadSent ? (
        <section className="rq-card rq-lead-card rq-revealed-card">
          <h2>{T.revealedTitle}</h2>
          <p className="rq-sub">{fill(T.revealedSub, { company: config.company })}</p>
          {config.phone && (
            <a className="rq-btn rq-btn-link" href={`tel:${config.phone.replace(/[^0-9+]/g, "")}`}>
              {config.cta}
            </a>
          )}
          <p className="rq-fine">
            {config.disclaimer}
            {financingFine}
          </p>
        </section>
      ) : (
        <section className="rq-card rq-lead-card">
          <h2>{config.cta}</h2>
          <form className="rq-lead" onSubmit={(e) => void submit(e)}>
            <LeadFields lead={lead} setLead={setLead} T={T} />
            {error && <p className="rq-error">{error}</p>}
            <button type="submit" className="rq-btn" disabled={sending}>
              {sending ? T.sending : config.cta}
            </button>
          </form>
          <p className="rq-fine">
            {config.disclaimer}
            {financingFine}
          </p>
        </section>
      )}
    </>
  );
}

function RoofMap({ model, center, mapboxToken, accent }: { model: RoofModel; center: LngLat; mapboxToken?: string; accent: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let disposed = false;
    let map: import("maplibre-gl").Map | null = null;
    void (async () => {
      // MapLibre is ~1 MB; only load it once a quote actually renders a map.
      const maplibregl = (await import("maplibre-gl")).default;
      if (disposed || !ref.current) return;
      map = new maplibregl.Map({
        container: ref.current,
        style: satelliteStyle(mapboxToken),
        center: [center.lng, center.lat],
        zoom: 19,
        interactive: false,
        attributionControl: { compact: true },
      });
      if (mapboxToken) map.addControl(new MapboxLogoControl(), "bottom-left");
      map.on("load", () => {
        if (!map) return;
        const features: GeoJSON.Feature[] = model.facets.map((f) => ({
          type: "Feature",
          properties: {},
          geometry: { type: "Polygon", coordinates: [[...f.vertices, f.vertices[0]!].map((v) => [v.lng, v.lat])] },
        }));
        map.addSource("roof", { type: "geojson", data: { type: "FeatureCollection", features } });
        map.addLayer({ id: "roof-fill", type: "fill", source: "roof", paint: { "fill-color": "#ffffff", "fill-opacity": 0.25 } });
        map.addLayer({ id: "roof-line", type: "line", source: "roof", paint: { "line-color": accent, "line-width": 3 } });
        const b = new maplibregl.LngLatBounds();
        for (const f of model.facets) for (const v of f.vertices) b.extend([v.lng, v.lat]);
        map.fitBounds(b, { padding: 40, maxZoom: 20, duration: 0 });
      });
    })();
    return () => {
      disposed = true;
      map?.remove();
    };
  }, [model, center, mapboxToken, accent]);
  return <div ref={ref} className="rq-map" />;
}

/** Mapbox's terms require their wordmark on maps that use their tiles. */
class MapboxLogoControl {
  private el: HTMLElement | null = null;
  onAdd(): HTMLElement {
    const a = document.createElement("a");
    a.href = "https://www.mapbox.com/";
    a.target = "_blank";
    a.rel = "noopener";
    a.className = "maplibregl-ctrl rq-mapbox-wordmark";
    a.textContent = "mapbox";
    a.setAttribute("aria-label", "Mapbox");
    this.el = a;
    return a;
  }
  onRemove(): void {
    this.el?.remove();
  }
}
