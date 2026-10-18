import type { Takeoff, TakeoffConfig } from "@roof-estimator/core";
import { num } from "../format";
import { EmptyState } from "./ReportPanel";

interface Props {
  takeoff: Takeoff | null;
  config: TakeoffConfig;
  suggestedWaste: number;
  onConfig: (c: TakeoffConfig) => void;
}

export function TakeoffPanel({ takeoff, config, suggestedWaste, onConfig }: Props) {
  if (!takeoff) return <EmptyState />;
  const set = <K extends keyof TakeoffConfig>(key: K, patch: Partial<TakeoffConfig[K]>) =>
    onConfig({ ...config, [key]: { ...(config[key] as object), ...patch } });

  const categories = Array.from(new Set(takeoff.lines.map((l) => l.category)));

  return (
    <div className="panel">
      <section>
        <h3>Waste factor</h3>
        <div className="row">
          <input
            type="range"
            min={0}
            max={30}
            step={1}
            value={config.wastePct}
            onChange={(e) => onConfig({ ...config, wastePct: Number(e.target.value) })}
          />
          <strong>{config.wastePct}%</strong>
          <button className="small" onClick={() => onConfig({ ...config, wastePct: suggestedWaste })}>
            Use suggested ({suggestedWaste}%)
          </button>
        </div>
      </section>

      {categories.map((cat) => (
        <section key={cat}>
          <h3 className="cap">{cat}</h3>
          <table className="table">
            <tbody>
              {takeoff.lines
                .filter((l) => l.category === cat)
                .map((l) => (
                  <tr key={l.key}>
                    <td>
                      {l.description}
                      <div className="formula">{l.formula}</div>
                    </td>
                    <td className="num">
                      <strong>{num(l.quantity)}</strong> {l.unit}
                      {l.quantity !== 1 && l.unit !== "lf" && l.unit !== "each" ? "s" : ""}
                      <div className="formula">
                        {num(l.rawQuantity, 1)} {l.rawUnit}
                      </div>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </section>
      ))}

      <section>
        <h3>Coverage assumptions</h3>
        <p className="hint">Match these to what your supplier stocks.</p>
        <div className="grid2">
          <label>
            Shingle product
            <input value={config.shingle.name} onChange={(e) => set("shingle", { name: e.target.value })} />
          </label>
          <label>
            Bundles / square
            <input type="number" step={1} min={1} value={config.shingle.bundlesPerSquare} onChange={(e) => set("shingle", { bundlesPerSquare: Number(e.target.value) })} />
          </label>
          <label>
            Underlayment
            <input value={config.underlayment.name} onChange={(e) => set("underlayment", { name: e.target.value })} />
          </label>
          <label>
            Squares / roll
            <input type="number" min={1} value={config.underlayment.squaresPerRoll} onChange={(e) => set("underlayment", { squaresPerRoll: Number(e.target.value) })} />
          </label>
          <label>
            Starter ft / bundle
            <input type="number" min={1} value={config.starter.lfPerBundle} onChange={(e) => set("starter", { lfPerBundle: Number(e.target.value) })} />
          </label>
          <label className="check">
            <input type="checkbox" checked={config.starter.includeRakes} onChange={(e) => set("starter", { includeRakes: e.target.checked })} />
            Starter on rakes
          </label>
          <label>
            Cap ft / bundle
            <input type="number" min={1} value={config.hipRidgeCap.lfPerBundle} onChange={(e) => set("hipRidgeCap", { lfPerBundle: Number(e.target.value) })} />
          </label>
          <label>
            Drip edge stick (ft)
            <input type="number" min={1} value={config.dripEdge.stickLengthFt} onChange={(e) => set("dripEdge", { stickLengthFt: Number(e.target.value) })} />
          </label>
          <label className="check">
            <input type="checkbox" checked={config.iceAndWater.enabled} onChange={(e) => set("iceAndWater", { enabled: e.target.checked })} />
            Ice & water shield
          </label>
          <label>
            I&W eave courses
            <input type="number" min={1} max={3} value={config.iceAndWater.eaveCourses} onChange={(e) => set("iceAndWater", { eaveCourses: Number(e.target.value) })} />
          </label>
          <label className="check">
            <input type="checkbox" checked={config.ridgeVent.enabled} onChange={(e) => set("ridgeVent", { enabled: e.target.checked })} />
            Ridge vent
          </label>
          <label className="check">
            <input type="checkbox" checked={config.valleyMetal.enabled} onChange={(e) => set("valleyMetal", { enabled: e.target.checked })} />
            Open valley metal
          </label>
          <label>
            Nails / square
            <select value={config.nails.perSquare} onChange={(e) => set("nails", { perSquare: Number(e.target.value) })}>
              <option value={320}>320 (4-nail)</option>
              <option value={480}>480 (6-nail, high wind)</option>
            </select>
          </label>
        </div>
      </section>
    </div>
  );
}
