import { EDGE_TYPES, formatPitch, measureRoof, parsePitch, type EdgeType, type Penetration } from "@roof-estimator/core";
import { useMemo, useState } from "react";
import { EDGE_COLORS } from "../MapView";
import { num, sqft } from "../format";
import type { Action, AppState } from "../state";

const EDGE_KEYS: Partial<Record<EdgeType, string>> = {
  eave: "E",
  rake: "K",
  ridge: "R",
  hip: "H",
  valley: "V",
  transition: "T",
  wall: "W",
  parapet: "P",
};

const PEN_TYPES: Penetration["type"][] = ["pipe-boot", "vent", "skylight", "chimney", "satellite", "other"];

export function FacetPanel({ state, dispatch }: { state: AppState; dispatch: React.Dispatch<Action> }) {
  const { model, selection, mode, draft } = state;
  const facet = model.facets.find((f) => f.id === selection.facetId) ?? null;
  const report = useMemo(() => (model.facets.length ? measureRoof(model) : null), [model]);
  const fm = report?.facets.find((f) => f.id === facet?.id);
  const [pitchText, setPitchText] = useState<string | null>(null);

  const setPitch = (txt: string) => {
    if (!facet) return;
    try {
      dispatch({ type: "facet:update", id: facet.id, patch: { pitch: parsePitch(txt) } });
      setPitchText(null);
    } catch {
      setPitchText(txt);
    }
  };

  return (
    <div className="panel">
      <section>
        <h3>Drawing</h3>
        <div className="row">
          <button className={mode === "select" ? "primary" : ""} onClick={() => dispatch({ type: "setMode", mode: "select" })}>
            Select
          </button>
          <button className={mode === "draw" ? "primary" : ""} onClick={() => dispatch({ type: "setMode", mode: "draw" })}>
            Draw facet
          </button>
        </div>
        {mode === "draw" && (
          <p className="hint">
            Click corners of one roof plane. Click the first point, double-click, or press <kbd>Enter</kbd> to close.{" "}
            <kbd>Backspace</kbd> removes the last point, <kbd>Esc</kbd> cancels. {draft.length} point{draft.length === 1 ? "" : "s"}.
          </p>
        )}
        {mode === "select" && (
          <p className="hint">
            Click a facet or edge. Drag corners to adjust. <kbd>Shift</kbd>+click an edge to add a corner; right-click a corner to
            remove it.
          </p>
        )}
        <label>
          Pitch for new facets
          <input
            defaultValue={formatPitch(state.defaultPitch)}
            onBlur={(e) => {
              try {
                dispatch({ type: "defaultPitch", pitch: parsePitch(e.target.value) });
              } catch {
                /* ignore */
              }
            }}
          />
        </label>
      </section>

      {facet && (
        <section>
          <h3>
            {facet.label ?? facet.id}{" "}
            <button className="danger small" onClick={() => dispatch({ type: "facet:delete", id: facet.id })}>
              Delete
            </button>
          </h3>
          <label>
            Label
            <input
              value={facet.label ?? ""}
              onChange={(e) => dispatch({ type: "facet:update", id: facet.id, patch: { label: e.target.value } })}
            />
          </label>
          <label>
            Pitch (rise/12, degrees, or %)
            <input
              value={pitchText ?? formatPitch(facet.pitch)}
              onChange={(e) => setPitchText(e.target.value)}
              onBlur={(e) => setPitch(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && setPitch((e.target as HTMLInputElement).value)}
              className={pitchText !== null ? "invalid" : ""}
            />
          </label>
          <div className="row">
            {[3, 4, 5, 6, 7, 8, 9, 10, 12].map((p) => (
              <button key={p} className="small" onClick={() => dispatch({ type: "facet:update", id: facet.id, patch: { pitch: p } })}>
                {p}/12
              </button>
            ))}
          </div>
          {fm && (
            <dl className="kv">
              <dt>Plan area</dt>
              <dd>{sqft(fm.planAreaSqFt)}</dd>
              <dt>Sloped area</dt>
              <dd>
                {sqft(fm.areaSqFt)} ({num(fm.areaSqFt / 100, 2)} sq)
              </dd>
              <dt>Pitch factor</dt>
              <dd>{num(fm.pitchFactor, 3)}</dd>
            </dl>
          )}

          <h4>Edges</h4>
          <p className="hint">Select an edge on the map or in the list, then pick a type or press its shortcut key.</p>
          <ul className="edge-list">
            {facet.edges.map((e, i) => {
              const m = fm?.edges[i];
              const selected = selection.edgeIndex === i;
              return (
                <li
                  key={i}
                  className={selected ? "selected" : ""}
                  onClick={() => dispatch({ type: "select", selection: { facetId: facet.id, edgeIndex: i } })}
                >
                  <span className="swatch" style={{ background: EDGE_COLORS[e.type] }} />
                  <span className="edge-name">
                    {i + 1}. {e.type}
                  </span>
                  <span className="edge-len">{m ? `${num(m.lengthFt, 1)} ft` : ""}</span>
                </li>
              );
            })}
          </ul>
          <div className="edge-types">
            {EDGE_TYPES.filter((t) => t !== "unlabeled").map((t) => (
              <button
                key={t}
                className="small"
                style={{ borderColor: EDGE_COLORS[t] }}
                disabled={selection.edgeIndex === null}
                onClick={() =>
                  selection.edgeIndex !== null &&
                  dispatch({ type: "edge:setType", facetId: facet.id, edgeIndex: selection.edgeIndex, edgeType: t })
                }
                title={EDGE_KEYS[t] ? `Shortcut: ${EDGE_KEYS[t]}` : undefined}
              >
                <span className="swatch" style={{ background: EDGE_COLORS[t] }} /> {t}
                {EDGE_KEYS[t] && <kbd>{EDGE_KEYS[t]}</kbd>}
              </button>
            ))}
          </div>
          <div className="row">
            <button className="small" onClick={() => dispatch({ type: "facet:setAllEdges", id: facet.id, edgeType: "eave" })}>
              All edges → eave
            </button>
          </div>
        </section>
      )}

      <section>
        <h3>Job details</h3>
        <label>
          Name
          <input value={model.name ?? ""} onChange={(e) => dispatch({ type: "model:meta", patch: { name: e.target.value } })} />
        </label>
        <label>
          Address
          <input value={model.address ?? ""} onChange={(e) => dispatch({ type: "model:meta", patch: { address: e.target.value } })} />
        </label>
        <div className="row">
          <label>
            Existing layers
            <input
              type="number"
              min={0}
              max={3}
              value={model.existingLayers ?? 1}
              onChange={(e) => dispatch({ type: "model:meta", patch: { existingLayers: Number(e.target.value) } })}
            />
          </label>
          <label>
            Stories
            <input
              type="number"
              min={1}
              max={4}
              value={model.stories ?? 1}
              onChange={(e) => dispatch({ type: "model:meta", patch: { stories: Number(e.target.value) } })}
            />
          </label>
        </div>
        <h4>Penetrations</h4>
        <div className="pen-grid">
          {PEN_TYPES.map((t) => {
            const existing = (model.penetrations ?? []).find((p) => p.type === t);
            return (
              <label key={t}>
                {t.replace("-", " ")}
                <input
                  type="number"
                  min={0}
                  value={existing?.count ?? 0}
                  onChange={(e) => {
                    const count = Number(e.target.value);
                    const rest = (model.penetrations ?? []).filter((p) => p.type !== t);
                    dispatch({ type: "model:penetrations", penetrations: count > 0 ? [...rest, { type: t, count }] : rest });
                  }}
                />
              </label>
            );
          })}
        </div>
        <label>
          Notes
          <textarea rows={3} value={model.notes ?? ""} onChange={(e) => dispatch({ type: "model:meta", patch: { notes: e.target.value } })} />
        </label>
      </section>
    </div>
  );
}
