# Roof Estimator

Open source roof measurement, material takeoff, and estimating. The free alternative to the per-report and per-seat pricing of RoofSnap, Roofr, EagleView, and iRoofing.

Draw a roof over satellite imagery, label the edges, set the pitch, and get a measurement report, a full material takeoff with formulas shown, and a Good / Better / Best estimate. No account, no server, no per-report fees. Everything runs in your browser; your data stays on your machine.

**[Live demo](https://gerelltroche.github.io/roof-estimator/)** · [Feature comparison](docs/FEATURES.md) · [Roadmap](docs/ROADMAP.md) · [Contributing](CONTRIBUTING.md)

## What it does

| Area | Features |
| --- | --- |
| **Measure** | Address search, satellite imagery, draw facets by clicking corners, vertex snapping, drag to adjust, per-facet pitch (rise/12, degrees, or %), edge labels: eave, rake, ridge, hip, valley, transition, wall, parapet. Keyboard shortcuts for fast labeling. |
| **Report** | Total area, squares, footprint area, areas-per-pitch table, predominant pitch, linear feet of every edge type (shared ridges/hips/valleys counted once), complexity rating, suggested waste, and a 0–30% waste table rounded to ⅓ square, matching the format of an EagleView Premium report. |
| **Takeoff** | Shingle bundles, underlayment rolls, ice & water, starter, hip/ridge cap, drip edge, valley metal, step flashing, pipe boots and other penetrations, ridge vent, nails, cap nails, sealant. Every quantity shows the formula it came from. All coverage assumptions are editable. |
| **Estimate** | Material pricing, labor by pitch tier (walkable / steep / very steep, area-weighted), tear-off per layer, multi-story, penetrations, disposal, permit, delivery, decking allowance, overhead, profit margin, sales tax. Three tiers out of the box. |
| **Output** | Print-ready report with a plan-view diagram (use Save as PDF), JSON import/export, autosave. |

## Quick start

```bash
git clone https://github.com/gerelltroche/roof-estimator
cd roof-estimator
pnpm install
pnpm dev          # http://localhost:5173
```

Requires Node 20+ and [pnpm](https://pnpm.io).

### Workflow

1. Search an address. The map flies to it at roof-level zoom.
2. Click **Draw facet** (or press <kbd>D</kbd>), click each corner of one roof plane, then click the first corner or press <kbd>Enter</kbd> to close it. Repeat per plane. Corners snap to existing points so shared edges line up.
3. Select a facet, set its pitch, then click each edge and label it (<kbd>E</kbd> eave, <kbd>K</kbd> rake, <kbd>R</kbd> ridge, <kbd>H</kbd> hip, <kbd>V</kbd> valley, <kbd>W</kbd> wall). The selection advances automatically so you can label a whole facet by typing, e.g. `E K R K`.
4. Open **Report**, **Takeoff**, and **Estimate**. Adjust waste, coverage, and prices to match your supplier and crew.
5. **Print / PDF** for a report, or **Export** for a `.roof.json` you can reopen later.

Not sure where to start? **+ Gable** and **+ Hip** drop a pre-labeled 50×30 roof at the map center that you can drag into place.

## Using the engine in your own code

The measurement, takeoff, and pricing logic is a dependency-free TypeScript package.

```ts
import { measureRoof, buildTakeoff, priceAllTiers, hipRoof } from "@roof-estimator/core";

const model = hipRoof({ lng: -81.2, lat: 28.55 }, 60, 40, 6); // or your own facets
const report = measureRoof(model);
const takeoff = buildTakeoff(report, { ...DEFAULT_TAKEOFF_CONFIG, wastePct: report.suggestedWastePct });
const [good, better, best] = priceAllTiers(model, report, takeoff);

report.squares;          // 26.83
report.lengthsFt.hip;    // 120
takeoff.lines[0];        // { description: "Architectural shingles", quantity: 91, unit: "bundle", formula: "..." }
good.total;              // 15234.69
```

A roof model is plain JSON: facets as plan-view polygons (lng/lat), a pitch per facet, and an edge type per side. See [`examples/`](examples/) and [`packages/core/src/types.ts`](packages/core/src/types.ts).

### How the math works

- **Area**: facet polygons are projected to a local tangent plane in feet (accurate to <0.01% at house scale), then plan area × pitch factor `√(rise² + 144) / 12`.
- **Edge lengths**: once a facet has a labeled eave or ridge, its fall line is known, so any edge's true length is `√(plan² + rise²)` with rise taken along the fall line. This gets rakes, 45° hips, off-angle hips, and wall edges right without a lookup table. Facets with no horizontal edge fall back to the standard pitch and hip/valley factors.
- **Shared edges**: a ridge, hip, valley, or transition labeled on both adjoining facets is counted once.
- **Waste**: suggested waste is driven by a complexity score from hip/valley length relative to roof size and facet count (simple 10%, normal 13%, complex 17%). The table rounds squares up to ⅓ so bundles come out whole.
- **Labor**: install rate × an area-weighted steepness multiplier, so a roof that is 70% walkable and 30% steep is not priced as all-steep.

## Project layout

```
packages/core   @roof-estimator/core — geometry, measurement, takeoff, pricing, presets (tested)
apps/web        Vite + React + MapLibre app
examples/       Sample roof models
docs/           Feature comparison with paid tools, roadmap
```

## Why

Measurement reports cost $13–50 each and estimating seats run $100–350/month. The math behind them is well known (pitch factors, waste tables, bundles per square). Roofers, adjusters, and homeowners should be able to run it themselves and see every formula.

## License

MIT. Satellite imagery is provided by Esri World Imagery and address search by OpenStreetMap Nominatim under their respective terms.
