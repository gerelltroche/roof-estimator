import type { Estimate, PricingConfig, Takeoff } from "@roof-estimator/core";
import { useState } from "react";
import { num, usd, usd0 } from "../format";
import { EmptyState } from "./ReportPanel";

interface Props {
  estimates: Estimate[] | null;
  takeoff: Takeoff | null;
  config: PricingConfig;
  onConfig: (c: PricingConfig) => void;
}

export function EstimatePanel({ estimates, takeoff, config, onConfig }: Props) {
  const [tierIdx, setTierIdx] = useState(0);
  if (!estimates || !takeoff) return <EmptyState />;
  const est = estimates[Math.min(tierIdx, estimates.length - 1)]!;

  const setPrice = (key: string, v: number) => onConfig({ ...config, prices: { ...config.prices, [key]: v } });
  const setLabor = (patch: Partial<PricingConfig["labor"]>) => onConfig({ ...config, labor: { ...config.labor, ...patch } });
  const setOther = (patch: Partial<PricingConfig["other"]>) => onConfig({ ...config, other: { ...config.other, ...patch } });

  return (
    <div className="panel">
      <section>
        <div className="tiers">
          {estimates.map((e, i) => (
            <button key={e.tierName} className={`tier ${i === tierIdx ? "active" : ""}`} onClick={() => setTierIdx(i)}>
              <div className="tier-name">{e.tierName}</div>
              <div className="tier-price">{usd0(e.total)}</div>
              <div className="tier-sub">{usd0(e.pricePerSquare)}/sq</div>
            </button>
          ))}
        </div>
        {config.tiers[tierIdx]?.description && <p className="hint">{config.tiers[tierIdx]!.description}</p>}
      </section>

      {[est.materials, est.labor, est.other].map((sec) => (
        <section key={sec.name}>
          <h3>
            {sec.name} <span className="right">{usd(sec.subtotal)}</span>
          </h3>
          <table className="table">
            <tbody>
              {sec.lines.map((l, i) => (
                <tr key={i}>
                  <td>{l.description}</td>
                  <td className="num muted">
                    {num(l.quantity, 2)} {l.unit} × {usd(l.unitPrice)}
                  </td>
                  <td className="num">{usd(l.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ))}

      <section>
        <table className="table totals">
          <tbody>
            <tr>
              <td>Sales tax on materials ({config.materialsTaxPct}%)</td>
              <td className="num">{usd(est.salesTax)}</td>
            </tr>
            <tr>
              <td>Direct cost</td>
              <td className="num">{usd(est.directCost)}</td>
            </tr>
            <tr>
              <td>Overhead ({config.overheadPct}%)</td>
              <td className="num">{usd(est.overhead)}</td>
            </tr>
            <tr>
              <td>Profit ({config.profitPct}% margin)</td>
              <td className="num">{usd(est.profit)}</td>
            </tr>
            <tr className="total">
              <td>Total</td>
              <td className="num">
                <strong>{usd(est.total)}</strong>
              </td>
            </tr>
          </tbody>
        </table>
      </section>

      <section>
        <h3>Material prices ({est.tierName})</h3>
        <p className="hint">Base prices; tiers override some of these. Edit the tier overrides in the exported settings JSON.</p>
        <div className="grid2">
          {takeoff.lines.map((l) => (
            <label key={l.key}>
              {l.description} ({l.unit})
              <input type="number" step={0.01} min={0} value={config.prices[l.key] ?? 0} onChange={(e) => setPrice(l.key, Number(e.target.value))} />
            </label>
          ))}
        </div>
      </section>

      <section>
        <h3>Labor</h3>
        <div className="grid2">
          <label>
            Install $/sq (walkable)
            <input type="number" value={config.labor.installPerSquare} onChange={(e) => setLabor({ installPerSquare: Number(e.target.value) })} />
          </label>
          <label>
            Tear-off $/sq/layer
            <input type="number" value={config.labor.tearOffPerSquarePerLayer} onChange={(e) => setLabor({ tearOffPerSquarePerLayer: Number(e.target.value) })} />
          </label>
          <label>
            Steep (7–9/12) ×
            <input type="number" step={0.05} value={config.labor.steepnessMultiplier.steep} onChange={(e) => setLabor({ steepnessMultiplier: { ...config.labor.steepnessMultiplier, steep: Number(e.target.value) } })} />
          </label>
          <label>
            Very steep (10+/12) ×
            <input type="number" step={0.05} value={config.labor.steepnessMultiplier["very-steep"]} onChange={(e) => setLabor({ steepnessMultiplier: { ...config.labor.steepnessMultiplier, "very-steep": Number(e.target.value) } })} />
          </label>
          <label>
            Extra story $/sq
            <input type="number" value={config.labor.perExtraStoryPerSquare} onChange={(e) => setLabor({ perExtraStoryPerSquare: Number(e.target.value) })} />
          </label>
          <label>
            Per penetration $
            <input type="number" value={config.labor.perPenetration} onChange={(e) => setLabor({ perPenetration: Number(e.target.value) })} />
          </label>
        </div>
      </section>

      <section>
        <h3>Other costs & margins</h3>
        <div className="grid2">
          <label>
            Dumpster flat $
            <input type="number" value={config.other.disposalFlat} onChange={(e) => setOther({ disposalFlat: Number(e.target.value) })} />
          </label>
          <label>
            Disposal $/sq/layer
            <input type="number" value={config.other.disposalPerSquarePerLayer} onChange={(e) => setOther({ disposalPerSquarePerLayer: Number(e.target.value) })} />
          </label>
          <label>
            Permit $
            <input type="number" value={config.other.permit} onChange={(e) => setOther({ permit: Number(e.target.value) })} />
          </label>
          <label>
            Delivery $
            <input type="number" value={config.other.deliveryFlat} onChange={(e) => setOther({ deliveryFlat: Number(e.target.value) })} />
          </label>
          <label>
            Decking sheets
            <input type="number" min={0} value={config.other.deckingSheets} onChange={(e) => setOther({ deckingSheets: Number(e.target.value) })} />
          </label>
          <label>
            $ / sheet
            <input type="number" value={config.other.deckingPricePerSheet} onChange={(e) => setOther({ deckingPricePerSheet: Number(e.target.value) })} />
          </label>
          <label>
            Overhead %
            <input type="number" value={config.overheadPct} onChange={(e) => onConfig({ ...config, overheadPct: Number(e.target.value) })} />
          </label>
          <label>
            Profit margin %
            <input type="number" max={90} value={config.profitPct} onChange={(e) => onConfig({ ...config, profitPct: Number(e.target.value) })} />
          </label>
          <label>
            Materials tax %
            <input type="number" step={0.1} value={config.materialsTaxPct} onChange={(e) => onConfig({ ...config, materialsTaxPct: Number(e.target.value) })} />
          </label>
        </div>
      </section>
    </div>
  );
}
