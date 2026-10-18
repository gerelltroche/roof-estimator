import { EDGE_TYPES, formatPitch, type MeasurementReport } from "@roof-estimator/core";
import { EDGE_COLORS } from "../MapView";
import { ft, num, sqft } from "../format";

export function ReportPanel({ report }: { report: MeasurementReport | null }) {
  if (!report) return <EmptyState />;
  return (
    <div className="panel">
      <section>
        <h3>Summary</h3>
        <dl className="kv">
          <dt>Total roof area</dt>
          <dd>
            <strong>{sqft(report.totalAreaSqFt)}</strong> · {num(report.squares, 2)} squares
          </dd>
          <dt>Footprint (plan) area</dt>
          <dd>{sqft(report.totalPlanAreaSqFt)}</dd>
          <dt>Facets</dt>
          <dd>{report.facetCount}</dd>
          <dt>Predominant pitch</dt>
          <dd>{formatPitch(report.predominantPitch)}</dd>
          <dt>Complexity</dt>
          <dd className="cap">{report.complexity}</dd>
          <dt>Suggested waste</dt>
          <dd>{report.suggestedWastePct}%</dd>
        </dl>
      </section>

      <section>
        <h3>Lengths</h3>
        <table className="table">
          <tbody>
            {EDGE_TYPES.filter((t) => report.lengthsFt[t] > 0).map((t) => (
              <tr key={t}>
                <td>
                  <span className="swatch" style={{ background: EDGE_COLORS[t] }} /> <span className="cap">{t}s</span>
                </td>
                <td className="num">{ft(report.lengthsFt[t])}</td>
              </tr>
            ))}
            <tr className="total">
              <td>Ridges + hips</td>
              <td className="num">{ft(report.lengthsFt.ridge + report.lengthsFt.hip)}</td>
            </tr>
            <tr className="total">
              <td>Eaves + rakes (perimeter)</td>
              <td className="num">{ft(report.lengthsFt.eave + report.lengthsFt.rake)}</td>
            </tr>
          </tbody>
        </table>
      </section>

      <section>
        <h3>Areas per pitch</h3>
        <table className="table">
          <thead>
            <tr>
              <th>Pitch</th>
              <th className="num">Area</th>
              <th className="num">% of roof</th>
            </tr>
          </thead>
          <tbody>
            {report.areasByPitch.map((r) => (
              <tr key={r.pitch}>
                <td>{formatPitch(r.pitch)}</td>
                <td className="num">{sqft(r.areaSqFt)}</td>
                <td className="num">{num(r.pct, 1)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section>
        <h3>Waste calculation</h3>
        <p className="hint">Squares rounded up to the nearest ⅓ (one bundle). Ridge, hip, and starter material not included.</p>
        <table className="table waste">
          <thead>
            <tr>
              <th>Waste</th>
              <th className="num">Area</th>
              <th className="num">Squares</th>
            </tr>
          </thead>
          <tbody>
            {report.wasteTable.map((r) => (
              <tr key={r.wastePct} className={r.wastePct === report.suggestedWastePct ? "suggested" : ""}>
                <td>
                  {r.wastePct}%{r.wastePct === report.suggestedWastePct && <span className="tag">suggested</span>}
                </td>
                <td className="num">{sqft(r.areaSqFt)}</td>
                <td className="num">{num(r.squares, 2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section>
        <h3>Facets</h3>
        <table className="table">
          <thead>
            <tr>
              <th>Facet</th>
              <th>Pitch</th>
              <th className="num">Area</th>
            </tr>
          </thead>
          <tbody>
            {report.facets.map((f) => (
              <tr key={f.id}>
                <td>{f.label ?? f.id}</td>
                <td>{formatPitch(f.pitch)}</td>
                <td className="num">{sqft(f.areaSqFt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {report.warnings.length > 0 && (
        <section className="warnings">
          <h3>Warnings</h3>
          <ul>
            {report.warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

export function EmptyState() {
  return (
    <div className="panel">
      <p className="hint">Draw at least one facet to see measurements.</p>
    </div>
  );
}
