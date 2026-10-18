import {
  EDGE_TYPES,
  centroidLngLat,
  formatPitch,
  projectToLocalFeet,
  type Estimate,
  type MeasurementReport,
  type RoofModel,
  type Takeoff,
} from "@roof-estimator/core";
import { EDGE_COLORS } from "./MapView";
import { ft, num, sqft, usd, usd0 } from "./format";

/**
 * Print-only report. Hidden on screen; shown by the print stylesheet.
 * Use the browser's "Save as PDF" to get a shareable document.
 */
export function PrintReport({ model, report, takeoff, estimates }: { model: RoofModel; report: MeasurementReport; takeoff: Takeoff; estimates: Estimate[] }) {
  return (
    <div className="print-report">
      <h1>{model.name ?? "Roof measurement report"}</h1>
      {model.address && <p className="muted">{model.address}</p>}
      <p className="muted">
        Generated {new Date().toLocaleDateString()} · Roof Estimator (open source)
      </p>

      <h2>Summary</h2>
      <table className="table">
        <tbody>
          <tr>
            <td>Total roof area</td>
            <td className="num">
              {sqft(report.totalAreaSqFt)} ({num(report.squares, 2)} squares)
            </td>
          </tr>
          <tr>
            <td>Facets</td>
            <td className="num">{report.facetCount}</td>
          </tr>
          <tr>
            <td>Predominant pitch</td>
            <td className="num">{formatPitch(report.predominantPitch)}</td>
          </tr>
          {EDGE_TYPES.filter((t) => report.lengthsFt[t] > 0).map((t) => (
            <tr key={t}>
              <td className="cap">Total {t}s</td>
              <td className="num">{ft(report.lengthsFt[t])}</td>
            </tr>
          ))}
          <tr>
            <td>Suggested waste</td>
            <td className="num">{report.suggestedWastePct}%</td>
          </tr>
        </tbody>
      </table>

      <h2>Diagram</h2>
      <Diagram model={model} report={report} />

      <h2>Areas per pitch</h2>
      <table className="table">
        <thead>
          <tr>
            <th>Pitch</th>
            <th className="num">Area</th>
            <th className="num">%</th>
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

      <h2>Waste calculation</h2>
      <table className="table">
        <thead>
          <tr>
            {report.wasteTable.map((r) => (
              <th key={r.wastePct} className="num">
                {r.wastePct}%
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          <tr>
            {report.wasteTable.map((r) => (
              <td key={r.wastePct} className="num">
                {num(r.areaSqFt)}
              </td>
            ))}
          </tr>
          <tr>
            {report.wasteTable.map((r) => (
              <td key={r.wastePct} className="num">
                {num(r.squares, 2)} sq
              </td>
            ))}
          </tr>
        </tbody>
      </table>

      <h2 className="page-break">Material takeoff ({takeoff.wastePct}% waste)</h2>
      <table className="table">
        <thead>
          <tr>
            <th>Item</th>
            <th className="num">Qty</th>
            <th>Basis</th>
          </tr>
        </thead>
        <tbody>
          {takeoff.lines.map((l) => (
            <tr key={l.key}>
              <td>{l.description}</td>
              <td className="num">
                {num(l.quantity)} {l.unit}
              </td>
              <td className="muted small-text">{l.formula}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2 className="page-break">Estimate</h2>
      <table className="table">
        <thead>
          <tr>
            <th />
            {estimates.map((e) => (
              <th key={e.tierName} className="num">
                {e.tierName}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Materials</td>
            {estimates.map((e) => (
              <td key={e.tierName} className="num">
                {usd(e.materials.subtotal)}
              </td>
            ))}
          </tr>
          <tr>
            <td>Labor</td>
            {estimates.map((e) => (
              <td key={e.tierName} className="num">
                {usd(e.labor.subtotal)}
              </td>
            ))}
          </tr>
          <tr>
            <td>Other</td>
            {estimates.map((e) => (
              <td key={e.tierName} className="num">
                {usd(e.other.subtotal)}
              </td>
            ))}
          </tr>
          <tr className="total">
            <td>Total</td>
            {estimates.map((e) => (
              <td key={e.tierName} className="num">
                <strong>{usd0(e.total)}</strong>
              </td>
            ))}
          </tr>
        </tbody>
      </table>
      {model.notes && (
        <>
          <h2>Notes</h2>
          <p>{model.notes}</p>
        </>
      )}
    </div>
  );
}

/** Simple SVG plan-view diagram with edge colors and lengths. */
export function Diagram({ model, report }: { model: RoofModel; report: MeasurementReport }) {
  const all = model.facets.flatMap((f) => f.vertices);
  if (!all.length) return null;
  const origin = centroidLngLat(all);
  const pts = model.facets.map((f) => projectToLocalFeet(f.vertices, origin));
  const xs = pts.flat().map((p) => p.x);
  const ys = pts.flat().map((p) => p.y);
  const minX = Math.min(...xs) - 5;
  const maxX = Math.max(...xs) + 5;
  const minY = Math.min(...ys) - 5;
  const maxY = Math.max(...ys) + 5;
  const w = maxX - minX;
  const h = maxY - minY;
  const scale = 600 / Math.max(w, h);
  const X = (x: number) => (x - minX) * scale;
  const Y = (y: number) => (maxY - y) * scale; // flip so north is up

  return (
    <svg className="diagram" viewBox={`0 0 ${w * scale} ${h * scale}`} width="100%">
      {model.facets.map((f, fi) => {
        const p = pts[fi]!;
        const fm = report.facets.find((m) => m.id === f.id);
        const cx = p.reduce((s, q) => s + q.x, 0) / p.length;
        const cy = p.reduce((s, q) => s + q.y, 0) / p.length;
        return (
          <g key={f.id}>
            <polygon points={p.map((q) => `${X(q.x)},${Y(q.y)}`).join(" ")} fill="#f3f4f6" stroke="none" />
            {p.map((a, i) => {
              const b = p[(i + 1) % p.length]!;
              const type = f.edges[i]?.type ?? "unlabeled";
              const len = fm?.edges[i]?.lengthFt ?? 0;
              return (
                <g key={i}>
                  <line x1={X(a.x)} y1={Y(a.y)} x2={X(b.x)} y2={Y(b.y)} stroke={EDGE_COLORS[type]} strokeWidth={3} strokeLinecap="round" />
                  <text x={(X(a.x) + X(b.x)) / 2} y={(Y(a.y) + Y(b.y)) / 2} fontSize={11} textAnchor="middle" fill="#111" stroke="#fff" strokeWidth={3} paintOrder="stroke">
                    {len.toFixed(0)}'
                  </text>
                </g>
              );
            })}
            <text x={X(cx)} y={Y(cy)} fontSize={12} textAnchor="middle" fill="#374151">
              {f.label ?? f.id} · {formatPitch(f.pitch)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
