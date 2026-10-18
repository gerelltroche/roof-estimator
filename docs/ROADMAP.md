# Roadmap

## v0.1 (now)
- [x] Core engine: geometry, measurement report, takeoff, pricing, presets, JSON schema
- [x] Web app: satellite map, draw/edit facets, edge labeling, pitch, report, takeoff, estimate tiers, print/PDF, import/export, autosave
- [x] Tests for the engine
- [x] GitHub Pages deploy

## v0.2 — report quality
- [ ] Company branding (logo, colors, contact) on the printed report
- [ ] Proposal page: scope of work, tier descriptions, terms, signature line
- [ ] Separate length / pitch / area diagrams like EagleView
- [ ] North arrow and scale bar on the diagram
- [ ] Facet direction (N/S/E/W) for solar-readiness and sun exposure
- [ ] Gutter / downspout takeoff from eave lengths

## v0.3 — measurement helpers
- [x] Auto-detect building footprint from OpenStreetMap (Overpass) as a starting polygon
- [ ] Pitch estimation from shadow length / image heuristics, and from phone camera (PWA)
- [x] Auto-split rectangular footprints into hip/gable facets
- [ ] Auto-split L/T/U footprints via straight skeleton
- [ ] Fall back to Microsoft / Overture building footprints where OSM has none
- [ ] Multiple structures on one property, each with its own summary
- [ ] Imperial / metric toggle

## v0.4 — more roof systems
- [ ] Metal panels (standing seam, exposed fastener): panel count by facet width, trim, closures, screws
- [ ] Tile: pieces per square, battens, bird stops
- [ ] Low-slope: TPO/modified rolls, cover board, fasteners, termination bar
- [ ] Per-facet product (e.g. shingles on main roof, flat section in TPO)

## v0.5 — integrations
- [ ] CSV / supplier order export (ABC, SRS, Beacon formats)
- [ ] Xactimate-compatible line items (RFG codes) and ESX-style export
- [ ] Hover / EagleView report import (JSON/XML) so existing reports flow into the takeoff
- [x] Homeowner instant-quote embed (price range by address using open footprints)
- [ ] Widget: e-mail the quote to the homeowner, product photos per tier, schedule-an-inspection link
- [ ] CLI: `roof-estimator report model.json`

## Later
- [ ] 3D model view
- [ ] Mobile-first PWA with offline mode
- [ ] Multi-user / team pricing presets (self-hosted sync)
- [ ] Drone / orthomosaic upload and georeferencing

Ideas and PRs welcome. Open an issue first for anything in the "Later" bucket.
