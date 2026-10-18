import { EDGE_TYPES } from "./measurement.js";
import type { EdgeType, Facet, RoofModel } from "./types.js";

export const MODEL_SCHEMA_VERSION = 1;

export interface SerializedModel {
  schemaVersion: number;
  model: RoofModel;
}

export function serializeModel(model: RoofModel): string {
  const out: SerializedModel = { schemaVersion: MODEL_SCHEMA_VERSION, model };
  return JSON.stringify(out, null, 2);
}

/** Parse and validate a model JSON. Throws with a readable message on bad input. */
export function parseModel(json: string | unknown): RoofModel {
  const raw = typeof json === "string" ? JSON.parse(json) : json;
  const model: unknown = raw && typeof raw === "object" && "model" in raw ? (raw as SerializedModel).model : raw;
  if (!model || typeof model !== "object") throw new Error("Model must be an object");
  const m = model as Partial<RoofModel>;
  if (!Array.isArray(m.facets)) throw new Error("model.facets must be an array");
  const edgeSet = new Set<string>(EDGE_TYPES);
  const facets: Facet[] = m.facets.map((f, i) => {
    if (!f || typeof f !== "object") throw new Error(`facets[${i}] must be an object`);
    const ff = f as Partial<Facet>;
    if (!Array.isArray(ff.vertices) || ff.vertices.length < 3) throw new Error(`facets[${i}].vertices needs ≥ 3 points`);
    for (const v of ff.vertices) {
      if (typeof v?.lng !== "number" || typeof v?.lat !== "number") throw new Error(`facets[${i}] has a bad vertex`);
    }
    const pitch = Number(ff.pitch ?? 0);
    if (!Number.isFinite(pitch) || pitch < 0) throw new Error(`facets[${i}].pitch must be a non-negative number`);
    const edges = (ff.edges ?? []).map((e) => {
      const t = (e?.type ?? "unlabeled") as string;
      return { type: (edgeSet.has(t) ? t : "unlabeled") as EdgeType };
    });
    while (edges.length < ff.vertices.length) edges.push({ type: "unlabeled" });
    return {
      id: String(ff.id ?? `facet-${i + 1}`),
      label: ff.label,
      pitch,
      vertices: ff.vertices,
      edges: edges.slice(0, ff.vertices.length),
    };
  });
  return {
    id: m.id,
    name: m.name,
    address: m.address,
    facets,
    penetrations: m.penetrations ?? [],
    existingLayers: m.existingLayers,
    stories: m.stories,
    notes: m.notes,
  };
}
