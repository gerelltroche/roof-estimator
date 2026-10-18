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
import maplibregl from "maplibre-gl";
import { useEffect, useMemo, useRef, useState } from "react";
import { fetchFootprints } from "../footprint";
import { geocode } from "../geocode";
import { SATELLITE_STYLE } from "../MapView";
import { decodeWidgetConfig, monthlyPayment, type WidgetConfig } from "./config";

type Step = "address" | "loading" | "quote" | "manual" | "sent";

interface Quote {
  address: string;
  center: LngLat;
  model: RoofModel | null;
  report: MeasurementReport;
  estimates: Estimate[];
  source: "footprint" | "manual";
}

const usd0 = (v: number) => "$" + Math.round(v).toLocaleString("en-US");

export function Widget() {
  const config = useMemo(() => decodeWidgetConfig(new URLSearchParams(location.search).get("c")), []);
  const [step, setStep] = useState<Step>("address");
  const [address, setAddress] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [manualSqFt, setManualSqFt] = useState("");
  const [center, setCenter] = useState<LngLat | null>(null);

  useEffect(() => {
    document.documentElement.style.setProperty("--accent", config.color);
  }, [config.color]);

  const priceFor = (model: RoofModel | null, report: MeasurementReport) => {
    const takeoff = buildTakeoff(report, { ...config.takeoff, wastePct: report.suggestedWastePct });
    const m: RoofModel = model ?? { facets: [] };
    return priceAllTiers({ ...m, existingLayers: config.existingLayers, stories: config.stories }, report, takeoff, config.pricing);
  };

  const run = async () => {
    if (!address.trim()) return;
    setError(null);
    setStep("loading");
    try {
      const results = await geocode(address);
      const hit = results[0];
      if (!hit) throw new Error("We couldn't find that address. Try adding the city and state.");
      setCenter(hit.center);
      const fps = await fetchFootprints(hit.center, 35);
      const fp = fps[0];
      if (!fp) {
        setStep("manual");
        return;
      }
      const { model } = footprintToRoof(fp.polygon, { style: config.style, pitch: config.pitch, overhangFt: 1 });
      model.address = hit.displayName;
      const report = measureRoof(model);
      setQuote({ address: hit.displayName, center: hit.center, model, report, estimates: priceFor(model, report), source: "footprint" });
      setStep("quote");
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
    // Synthesize a report for a flat-area estimate with no edge detail.
    const report = measureRoof({ facets: [] });
    const synthetic: MeasurementReport = {
      ...report,
      facetCount: 0,
      totalAreaSqFt: sqft,
      totalPlanAreaSqFt: sqft,
      squares: sqft / 100,
      predominantPitch: config.pitch,
      areasByPitch: [{ pitch: config.pitch, areaSqFt: sqft, pct: 100 }],
      // Approximate perimeter from a 1.5:1 rectangle so starter/drip/cap are non-zero.
      lengthsFt: { ...report.lengthsFt, eave: 2 * Math.sqrt(sqft / 1.5) + 2 * Math.sqrt(sqft * 1.5) * 0.5, ridge: Math.sqrt(sqft * 1.5) * 0.4, hip: Math.sqrt(sqft) * 1.5 },
      complexity: "normal",
      suggestedWastePct: 13,
    };
    setQuote({
      address,
      center: center ?? { lng: -81.2, lat: 28.55 },
      model: null,
      report: synthetic,
      estimates: priceFor(null, synthetic),
      source: "manual",
    });
    setError(null);
    setStep("quote");
  };

  return (
    <div className="widget">
      <header className="w-header">
        <div className="w-company">{config.company}</div>
        {config.phone && (
          <a className="w-phone" href={`tel:${config.phone.replace(/[^0-9+]/g, "")}`}>
            {config.phone}
          </a>
        )}
      </header>

      {step === "address" && (
        <section className="w-card">
          <h1>{config.headline}</h1>
          <p className="w-sub">Enter your address and we'll measure your roof from satellite imagery in seconds.</p>
          <form
            className="w-addr"
            onSubmit={(e) => {
              e.preventDefault();
              void run();
            }}
          >
            <input autoFocus placeholder="123 Main St, Orlando, FL" value={address} onChange={(e) => setAddress(e.target.value)} />
            <button type="submit" className="w-btn">
              Get quote
            </button>
          </form>
          {error && <p className="w-error">{error}</p>}
        </section>
      )}

      {step === "loading" && (
        <section className="w-card w-center">
          <div className="w-spinner" />
          <p>Finding your roof…</p>
        </section>
      )}

      {step === "manual" && (
        <section className="w-card">
          <h2>We couldn't outline your roof automatically</h2>
          <p className="w-sub">No problem. Tell us roughly how big it is and we'll estimate from that.</p>
          <label className="w-label">
            Approximate roof size (sq ft)
            <input type="number" inputMode="numeric" placeholder="e.g. 2400" value={manualSqFt} onChange={(e) => setManualSqFt(e.target.value)} />
          </label>
          <p className="w-hint">Tip: for a single-story home, the roof is usually 1.1–1.3× the home's living area.</p>
          {error && <p className="w-error">{error}</p>}
          <div className="w-row">
            <button className="w-btn" onClick={runManual}>
              Estimate
            </button>
            <button className="w-link" onClick={() => setStep("address")}>
              Try another address
            </button>
          </div>
        </section>
      )}

      {step === "quote" && quote && (
        <QuoteView quote={quote} config={config} onSent={() => setStep("sent")} onReset={() => setStep("address")} />
      )}

      {step === "sent" && (
        <section className="w-card w-center">
          <h2>Thanks! We'll be in touch shortly.</h2>
          <p className="w-sub">{config.company} will confirm your exact price after a free inspection.</p>
          <button className="w-link" onClick={() => setStep("address")}>
            Start over
          </button>
        </section>
      )}

      <footer className="w-footer">
        Powered by <a href="https://github.com/gerelltroche/roof-estimator">Roof Estimator</a> (open source)
      </footer>
    </div>
  );
}

function QuoteView({ quote, config, onSent, onReset }: { quote: Quote; config: WidgetConfig; onSent: () => void; onReset: () => void }) {
  const [lead, setLead] = useState({ name: "", email: "", phone: "", notes: "" });
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const r = config.rangePct / 100;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!lead.name || (!lead.email && !lead.phone)) {
      setError("Please enter your name and an email or phone number.");
      return;
    }
    setSending(true);
    setError(null);
    const payload = {
      source: "roof-estimator-widget",
      submittedAt: new Date().toISOString(),
      lead,
      address: quote.address,
      location: quote.center,
      roof: {
        source: quote.source,
        areaSqFt: Math.round(quote.report.totalAreaSqFt),
        squares: Number(quote.report.squares.toFixed(2)),
        assumedPitch: formatPitch(config.pitch),
        lengthsFt: quote.report.lengthsFt,
        model: quote.model,
      },
      tiers: quote.estimates.map((e) => ({
        name: e.tierName,
        price: e.total,
        low: Math.round(e.total * (1 - r)),
        high: Math.round(e.total * (1 + r)),
      })),
    };
    try {
      if (config.webhook) {
        const res = await fetch(config.webhook, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
        if (!res.ok) throw new Error(`Lead delivery failed (${res.status})`);
      } else {
        console.info("[roof-estimator widget] no webhook configured; lead payload:", payload);
      }
      window.parent?.postMessage({ type: "roof-estimator:lead", payload }, "*");
      onSent();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      <section className="w-card w-quote">
        <div className="w-quote-head">
          <div>
            <div className="w-addr-line">{quote.address}</div>
            <div className="w-roof-stats">
              <strong>{Math.round(quote.report.totalAreaSqFt).toLocaleString()} ft²</strong> roof · {quote.report.squares.toFixed(1)} squares ·{" "}
              {formatPitch(config.pitch)} pitch assumed
              {quote.source === "manual" && " · size entered manually"}
            </div>
          </div>
          <button className="w-link" onClick={onReset}>
            Change address
          </button>
        </div>
        {quote.model && <RoofMap model={quote.model} center={quote.center} />}
      </section>

      <section className="w-tiers">
        {quote.estimates.map((e, i) => {
          const tier = config.pricing.tiers[i];
          const low = e.total * (1 - r);
          const high = e.total * (1 + r);
          const monthly =
            config.financingApr !== undefined && config.financingMonths ? monthlyPayment(e.total, config.financingApr, config.financingMonths) : null;
          return (
            <div key={e.tierName} className={`w-tier ${i === 1 ? "w-tier-featured" : ""}`}>
              {i === 1 && <div className="w-badge">Most popular</div>}
              <div className="w-tier-name">{e.tierName}</div>
              <div className="w-tier-price">
                {usd0(low)} – {usd0(high)}
              </div>
              {monthly !== null && (
                <div className="w-tier-monthly">
                  or ~{usd0(monthly)}/mo<span className="w-fine">*</span>
                </div>
              )}
              {tier?.description && <p className="w-tier-desc">{tier.description}</p>}
            </div>
          );
        })}
      </section>

      <section className="w-card">
        <h2>{config.cta}</h2>
        <form className="w-lead" onSubmit={(e) => void submit(e)}>
          <input placeholder="Your name" value={lead.name} onChange={(e) => setLead({ ...lead, name: e.target.value })} />
          <input type="email" placeholder="Email" value={lead.email} onChange={(e) => setLead({ ...lead, email: e.target.value })} />
          <input type="tel" placeholder="Phone" value={lead.phone} onChange={(e) => setLead({ ...lead, phone: e.target.value })} />
          <textarea placeholder="Anything we should know? (leaks, age of roof, insurance claim…)" rows={2} value={lead.notes} onChange={(e) => setLead({ ...lead, notes: e.target.value })} />
          {error && <p className="w-error">{error}</p>}
          <button type="submit" className="w-btn" disabled={sending}>
            {sending ? "Sending…" : config.cta}
          </button>
        </form>
        <p className="w-fine">
          {config.disclaimer}
          {config.financingApr !== undefined && config.financingMonths
            ? ` *Monthly figure assumes ${config.financingApr}% APR over ${config.financingMonths} months with approved credit; not an offer of credit.`
            : ""}
        </p>
      </section>
    </>
  );
}

function RoofMap({ model, center }: { model: RoofModel; center: LngLat }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!ref.current) return;
    const map = new maplibregl.Map({
      container: ref.current,
      style: SATELLITE_STYLE,
      center: [center.lng, center.lat],
      zoom: 19,
      interactive: false,
      attributionControl: { compact: true },
    });
    map.on("load", () => {
      const features: GeoJSON.Feature[] = model.facets.map((f) => ({
        type: "Feature",
        properties: {},
        geometry: { type: "Polygon", coordinates: [[...f.vertices, f.vertices[0]!].map((v) => [v.lng, v.lat])] },
      }));
      map.addSource("roof", { type: "geojson", data: { type: "FeatureCollection", features } });
      map.addLayer({ id: "roof-fill", type: "fill", source: "roof", paint: { "fill-color": "#ffffff", "fill-opacity": 0.25 } });
      map.addLayer({ id: "roof-line", type: "line", source: "roof", paint: { "line-color": getComputedStyle(document.documentElement).getPropertyValue("--accent").trim() || "#f59e0b", "line-width": 3 } });
      const b = new maplibregl.LngLatBounds();
      for (const f of model.facets) for (const v of f.vertices) b.extend([v.lng, v.lat]);
      map.fitBounds(b, { padding: 40, maxZoom: 20, duration: 0 });
    });
    return () => map.remove();
  }, [model, center]);
  return <div ref={ref} className="w-map" />;
}
