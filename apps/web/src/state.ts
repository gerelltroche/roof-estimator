import {
  DEFAULT_PRICING,
  DEFAULT_TAKEOFF_CONFIG,
  parseModel,
  type EdgeType,
  type Facet,
  type LngLat,
  type Penetration,
  type PricingConfig,
  type RoofModel,
  type TakeoffConfig,
} from "@roof-estimator/core";
import { useEffect, useReducer } from "react";

export type Mode = "select" | "draw";

export interface Selection {
  facetId: string | null;
  edgeIndex: number | null;
}

export interface AppState {
  model: RoofModel;
  takeoffConfig: TakeoffConfig;
  pricingConfig: PricingConfig;
  mode: Mode;
  selection: Selection;
  /** Vertices of the polygon currently being drawn. */
  draft: LngLat[];
  history: RoofModel[];
  future: RoofModel[];
  /** Pitch applied to newly drawn facets. */
  defaultPitch: number;
}

export type Action =
  | { type: "load"; model: RoofModel }
  | { type: "reset" }
  | { type: "setMode"; mode: Mode }
  | { type: "select"; selection: Selection }
  | { type: "draft:add"; point: LngLat }
  | { type: "draft:undo" }
  | { type: "draft:cancel" }
  | { type: "draft:finish" }
  | { type: "facet:delete"; id: string }
  | { type: "facet:update"; id: string; patch: Partial<Pick<Facet, "pitch" | "label">> }
  | { type: "facet:setAllEdges"; id: string; edgeType: EdgeType }
  | { type: "edge:setType"; facetId: string; edgeIndex: number; edgeType: EdgeType }
  | { type: "vertex:move"; facetId: string; index: number; point: LngLat }
  | { type: "vertex:insert"; facetId: string; afterIndex: number; point: LngLat }
  | { type: "vertex:delete"; facetId: string; index: number }
  | { type: "model:meta"; patch: Partial<Pick<RoofModel, "name" | "address" | "existingLayers" | "stories" | "notes">> }
  | { type: "model:penetrations"; penetrations: Penetration[] }
  | { type: "takeoffConfig"; config: TakeoffConfig }
  | { type: "pricingConfig"; config: PricingConfig }
  | { type: "defaultPitch"; pitch: number }
  | { type: "undo" }
  | { type: "redo" };

const STORAGE_KEY = "roof-estimator:v1";

export function emptyModel(): RoofModel {
  return { name: "Untitled roof", facets: [], penetrations: [], existingLayers: 1, stories: 1 };
}

function newFacetId(model: RoofModel): string {
  let n = model.facets.length + 1;
  while (model.facets.some((f) => f.id === `facet-${n}`)) n++;
  return `facet-${n}`;
}

function withHistory(state: AppState, model: RoofModel): AppState {
  return { ...state, model, history: [...state.history.slice(-49), state.model], future: [] };
}

function updateFacet(state: AppState, id: string, fn: (f: Facet) => Facet): AppState {
  const model = { ...state.model, facets: state.model.facets.map((f) => (f.id === id ? fn(f) : f)) };
  return withHistory(state, model);
}

export function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case "load":
      return { ...state, model: action.model, selection: { facetId: null, edgeIndex: null }, draft: [], history: [], future: [] };
    case "reset":
      return withHistory({ ...state, selection: { facetId: null, edgeIndex: null }, draft: [] }, emptyModel());
    case "setMode":
      return { ...state, mode: action.mode, draft: action.mode === "draw" ? state.draft : [] };
    case "select":
      return { ...state, selection: action.selection };
    case "draft:add":
      return { ...state, draft: [...state.draft, action.point] };
    case "draft:undo":
      return { ...state, draft: state.draft.slice(0, -1) };
    case "draft:cancel":
      return { ...state, draft: [] };
    case "draft:finish": {
      if (state.draft.length < 3) return { ...state, draft: [] };
      const id = newFacetId(state.model);
      const facet: Facet = {
        id,
        label: `Facet ${state.model.facets.length + 1}`,
        pitch: state.defaultPitch,
        vertices: state.draft,
        edges: state.draft.map(() => ({ type: "unlabeled" as EdgeType })),
      };
      const next = withHistory(state, { ...state.model, facets: [...state.model.facets, facet] });
      return { ...next, draft: [], selection: { facetId: id, edgeIndex: null } };
    }
    case "facet:delete": {
      const next = withHistory(state, { ...state.model, facets: state.model.facets.filter((f) => f.id !== action.id) });
      return { ...next, selection: { facetId: null, edgeIndex: null } };
    }
    case "facet:update":
      return updateFacet(state, action.id, (f) => ({ ...f, ...action.patch }));
    case "facet:setAllEdges":
      return updateFacet(state, action.id, (f) => ({ ...f, edges: f.edges.map(() => ({ type: action.edgeType })) }));
    case "edge:setType":
      return updateFacet(state, action.facetId, (f) => ({
        ...f,
        edges: f.edges.map((e, i) => (i === action.edgeIndex ? { type: action.edgeType } : e)),
      }));
    case "vertex:move":
      return updateFacet(state, action.facetId, (f) => ({
        ...f,
        vertices: f.vertices.map((v, i) => (i === action.index ? action.point : v)),
      }));
    case "vertex:insert":
      return updateFacet(state, action.facetId, (f) => {
        const vertices = [...f.vertices];
        const edges = [...f.edges];
        vertices.splice(action.afterIndex + 1, 0, action.point);
        edges.splice(action.afterIndex + 1, 0, { type: edges[action.afterIndex]?.type ?? "unlabeled" });
        return { ...f, vertices, edges };
      });
    case "vertex:delete":
      return updateFacet(state, action.facetId, (f) => {
        if (f.vertices.length <= 3) return f;
        return {
          ...f,
          vertices: f.vertices.filter((_, i) => i !== action.index),
          edges: f.edges.filter((_, i) => i !== action.index),
        };
      });
    case "model:meta":
      return withHistory(state, { ...state.model, ...action.patch });
    case "model:penetrations":
      return withHistory(state, { ...state.model, penetrations: action.penetrations });
    case "takeoffConfig":
      return { ...state, takeoffConfig: action.config };
    case "pricingConfig":
      return { ...state, pricingConfig: action.config };
    case "defaultPitch":
      return { ...state, defaultPitch: action.pitch };
    case "undo": {
      const prev = state.history[state.history.length - 1];
      if (!prev) return state;
      return { ...state, model: prev, history: state.history.slice(0, -1), future: [state.model, ...state.future] };
    }
    case "redo": {
      const [next, ...rest] = state.future;
      if (!next) return state;
      return { ...state, model: next, history: [...state.history, state.model], future: rest };
    }
  }
}

function loadInitial(): AppState {
  const base: AppState = {
    model: emptyModel(),
    takeoffConfig: DEFAULT_TAKEOFF_CONFIG,
    pricingConfig: DEFAULT_PRICING,
    mode: "select",
    selection: { facetId: null, edgeIndex: null },
    draft: [],
    history: [],
    future: [],
    defaultPitch: 6,
  };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return base;
    const saved = JSON.parse(raw) as Partial<AppState>;
    return {
      ...base,
      model: saved.model ? parseModel(saved.model) : base.model,
      takeoffConfig: { ...base.takeoffConfig, ...(saved.takeoffConfig ?? {}) },
      pricingConfig: { ...base.pricingConfig, ...(saved.pricingConfig ?? {}) },
      defaultPitch: saved.defaultPitch ?? base.defaultPitch,
    };
  } catch {
    return base;
  }
}

export function useAppState(): [AppState, React.Dispatch<Action>] {
  const [state, dispatch] = useReducer(reducer, undefined, loadInitial);
  useEffect(() => {
    try {
      const { model, takeoffConfig, pricingConfig, defaultPitch } = state;
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ model, takeoffConfig, pricingConfig, defaultPitch }));
    } catch {
      /* storage unavailable; ignore */
    }
  }, [state.model, state.takeoffConfig, state.pricingConfig, state.defaultPitch]);
  return [state, dispatch];
}
