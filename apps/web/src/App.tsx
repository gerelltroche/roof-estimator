import {
  buildTakeoff,
  footprintToRoof,
  gableRoof,
  hipRoof,
  measureRoof,
  parseModel,
  priceAllTiers,
  serializeModel,
  type EdgeType,
  type LngLat,
  type RoofStyle,
} from "@roof-estimator/core";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fetchFootprints } from "./footprint";
import { geocode, type GeocodeResult } from "./geocode";
import { WidgetPanel } from "./panels/WidgetPanel";
import { MapView, type MapHandle } from "./MapView";
import { EstimatePanel } from "./panels/EstimatePanel";
import { FacetPanel } from "./panels/FacetPanel";
import { ReportPanel } from "./panels/ReportPanel";
import { TakeoffPanel } from "./panels/TakeoffPanel";
import { PrintReport } from "./PrintReport";
import { useAppState } from "./state";

type Tab = "draw" | "report" | "takeoff" | "estimate" | "widget";

const EDGE_SHORTCUTS: Record<string, EdgeType> = {
  e: "eave",
  k: "rake",
  r: "ridge",
  h: "hip",
  v: "valley",
  t: "transition",
  w: "wall",
  p: "parapet",
};

export function App() {
  const [state, dispatch] = useAppState();
  const [tab, setTab] = useState<Tab>("draw");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<GeocodeResult[]>([]);
  const [searching, setSearching] = useState(false);
  const mapRef = useRef<MapHandle | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [detectStyle, setDetectStyle] = useState<RoofStyle>("hip");
  const [detecting, setDetecting] = useState(false);
  const [lastSearch, setLastSearch] = useState<LngLat | null>(null);

  const report = useMemo(() => (state.model.facets.length ? measureRoof(state.model) : null), [state.model]);
  const takeoff = useMemo(
    () => (report ? buildTakeoff(report, state.takeoffConfig, state.model.penetrations ?? []) : null),
    [report, state.takeoffConfig, state.model.penetrations],
  );
  const estimates = useMemo(
    () => (report && takeoff ? priceAllTiers(state.model, report, takeoff, state.pricingConfig) : null),
    [state.model, report, takeoff, state.pricingConfig],
  );

  // Keyboard shortcuts.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT")) return;
      const key = e.key.toLowerCase();
      if ((e.metaKey || e.ctrlKey) && key === "z") {
        e.preventDefault();
        dispatch({ type: e.shiftKey ? "redo" : "undo" });
        return;
      }
      if (state.mode === "draw") {
        if (e.key === "Enter") dispatch({ type: "draft:finish" });
        else if (e.key === "Escape") {
          if (state.draft.length) dispatch({ type: "draft:cancel" });
          else dispatch({ type: "setMode", mode: "select" });
        } else if (e.key === "Backspace") dispatch({ type: "draft:undo" });
        return;
      }
      if (key === "d") dispatch({ type: "setMode", mode: "draw" });
      else if (e.key === "Escape") dispatch({ type: "select", selection: { facetId: null, edgeIndex: null } });
      else if ((e.key === "Delete" || e.key === "Backspace") && state.selection.facetId && state.selection.edgeIndex === null)
        dispatch({ type: "facet:delete", id: state.selection.facetId });
      else if (EDGE_SHORTCUTS[key] && state.selection.facetId && state.selection.edgeIndex !== null) {
        dispatch({ type: "edge:setType", facetId: state.selection.facetId, edgeIndex: state.selection.edgeIndex, edgeType: EDGE_SHORTCUTS[key]! });
        // Advance to the next edge so you can label a facet by typing e.g. "E K R K".
        const facet = state.model.facets.find((f) => f.id === state.selection.facetId);
        if (facet) dispatch({ type: "select", selection: { facetId: facet.id, edgeIndex: (state.selection.edgeIndex + 1) % facet.edges.length } });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [state.mode, state.draft.length, state.selection, state.model.facets, dispatch]);

  const search = useCallback(async () => {
    if (!query.trim()) return;
    setSearching(true);
    try {
      const r = await geocode(query);
      setResults(r);
      const first = r[0];
      if (first) {
        setLastSearch(first.center);
        mapRef.current?.flyTo(first.center, 20);
        if (!state.model.address) dispatch({ type: "model:meta", patch: { address: first.displayName.split(",").slice(0, 3).join(",") } });
      }
    } catch (err) {
      alert(`Search failed: ${(err as Error).message}`);
    } finally {
      setSearching(false);
    }
  }, [query, state.model.address, dispatch]);

  const exportJSON = () => {
    const blob = new Blob([serializeModel(state.model)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${(state.model.name ?? "roof").replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.roof.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };
  const importJSON = async (file: File) => {
    try {
      const model = parseModel(await file.text());
      dispatch({ type: "load", model });
      setTimeout(() => mapRef.current?.fitToRoof(), 50);
    } catch (err) {
      alert(`Could not import: ${(err as Error).message}`);
    }
  };
  const addPreset = (kind: "gable" | "hip") => {
    const c = mapRef.current?.getCenter();
    if (!c) return;
    const preset = kind === "gable" ? gableRoof(c, 50, 30, state.defaultPitch) : hipRoof(c, 50, 30, state.defaultPitch);
    const n = state.model.facets.length;
    const facets = preset.facets.map((f, i) => ({ ...f, id: `facet-${n + i + 1}`, label: `${f.label} ${n + i + 1}` }));
    dispatch({ type: "load", model: { ...state.model, facets: [...state.model.facets, ...facets] } });
  };
  const detectRoof = async (at?: LngLat) => {
    const point = at ?? lastSearch ?? mapRef.current?.getCenter();
    if (!point) return;
    setDetecting(true);
    try {
      const fps = await fetchFootprints(point);
      const fp = fps[0];
      if (!fp) {
        alert("No building found here in OpenStreetMap. Zoom to the roof and try again, or draw it manually.");
        return;
      }
      const { model, autoSplit } = footprintToRoof(fp.polygon, {
        style: detectStyle,
        pitch: state.defaultPitch,
        overhangFt: 1,
        idPrefix: `facet-${state.model.facets.length + 1}`,
      });
      dispatch({ type: "load", model: { ...state.model, facets: [...state.model.facets, ...model.facets] } });
      setTimeout(() => mapRef.current?.fitToRoof(), 50);
      if (!autoSplit && detectStyle !== "outline")
        alert("Footprint isn't a simple rectangle, so it was added as an outline. Split it into facets and label the edges.");
    } catch (err) {
      alert((err as Error).message);
    } finally {
      setDetecting(false);
    }
  };

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="logo">▲</span> Roof Estimator
        </div>
        <form
          className="search"
          onSubmit={(e) => {
            e.preventDefault();
            void search();
          }}
        >
          <input placeholder="Search an address…" value={query} onChange={(e) => setQuery(e.target.value)} />
          <button type="submit" disabled={searching}>
            {searching ? "…" : "Go"}
          </button>
          {results.length > 1 && (
            <ul className="results">
              {results.map((r) => (
                <li
                  key={r.displayName}
                  onClick={() => {
                    setLastSearch(r.center);
                    mapRef.current?.flyTo(r.center, 20);
                    setResults([]);
                  }}
                >
                  {r.displayName}
                </li>
              ))}
            </ul>
          )}
        </form>
        <div className="toolbar">
          <button onClick={() => dispatch({ type: "undo" })} disabled={!state.history.length} title="Undo (Ctrl+Z)">
            ↶
          </button>
          <button onClick={() => dispatch({ type: "redo" })} disabled={!state.future.length} title="Redo (Ctrl+Shift+Z)">
            ↷
          </button>
          <span className="sep" />
          <span className="detect">
            <button className="primary" onClick={() => void detectRoof()} disabled={detecting} title="Find the building at the searched address (or map center) in OpenStreetMap and build a roof from it">
              {detecting ? "Detecting…" : "Detect roof"}
            </button>
            <select value={detectStyle} onChange={(e) => setDetectStyle(e.target.value as RoofStyle)} title="Roof style to generate">
              <option value="hip">Hip</option>
              <option value="gable">Gable</option>
              <option value="outline">Outline only</option>
            </select>
          </span>
          <button onClick={() => addPreset("gable")} title="Drop a 50×30 gable at the map center">
            + Gable
          </button>
          <button onClick={() => addPreset("hip")} title="Drop a 50×30 hip at the map center">
            + Hip
          </button>
          <button onClick={() => mapRef.current?.fitToRoof()} disabled={!report}>
            Fit
          </button>
          <span className="sep" />
          <button onClick={() => fileRef.current?.click()}>Import</button>
          <input ref={fileRef} type="file" accept=".json" hidden onChange={(e) => e.target.files?.[0] && void importJSON(e.target.files[0])} />
          <button onClick={exportJSON} disabled={!report}>
            Export
          </button>
          <button onClick={() => window.print()} disabled={!report}>
            Print / PDF
          </button>
          <button
            className="danger"
            onClick={() => {
              if (confirm("Clear all facets?")) dispatch({ type: "reset" });
            }}
            disabled={!state.model.facets.length}
          >
            Clear
          </button>
        </div>
      </header>

      <main className="workspace">
        <MapView state={state} dispatch={dispatch} onReady={(h) => (mapRef.current = h)} />
        <aside className="sidebar">
          <nav className="tabs">
            {(
              [
                ["draw", "Draw"],
                ["report", "Report"],
                ["takeoff", "Takeoff"],
                ["estimate", "Estimate"],
                ["widget", "Widget"],
              ] as [Tab, string][]
            ).map(([id, label]) => (
              <button key={id} className={tab === id ? "active" : ""} onClick={() => setTab(id)}>
                {label}
              </button>
            ))}
          </nav>
          {report && (
            <div className="statbar">
              <span>
                <strong>{Math.round(report.totalAreaSqFt).toLocaleString()}</strong> ft²
              </span>
              <span>
                <strong>{report.squares.toFixed(1)}</strong> sq
              </span>
              <span>
                <strong>{report.facetCount}</strong> facets
              </span>
              {estimates && (
                <span>
                  <strong>${Math.round(estimates[0]!.total).toLocaleString()}</strong> {estimates[0]!.tierName}
                </span>
              )}
            </div>
          )}
          {tab === "draw" && <FacetPanel state={state} dispatch={dispatch} />}
          {tab === "report" && <ReportPanel report={report} />}
          {tab === "takeoff" && (
            <TakeoffPanel
              takeoff={takeoff}
              config={state.takeoffConfig}
              suggestedWaste={report?.suggestedWastePct ?? 10}
              onConfig={(config) => dispatch({ type: "takeoffConfig", config })}
            />
          )}
          {tab === "widget" && <WidgetPanel state={state} />}
          {tab === "estimate" && (
            <EstimatePanel estimates={estimates} takeoff={takeoff} config={state.pricingConfig} onConfig={(config) => dispatch({ type: "pricingConfig", config })} />
          )}
        </aside>
      </main>

      {report && takeoff && estimates && <PrintReport model={state.model} report={report} takeoff={takeoff} estimates={estimates} />}
    </div>
  );
}
