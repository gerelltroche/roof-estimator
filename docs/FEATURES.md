# Feature comparison with paid tools

Surveyed October 2026. Prices are list prices from vendor sites and review aggregators and change often.

## What the paid tools charge

| Product | Model | Price |
| --- | --- | --- |
| **EagleView** | Measurement reports from aerial imagery, per report | Roughly $15–60+ per report depending on tier (QuickSquares vs Premium) |
| **Roofr** | CRM + estimating platform, measurement reports per report | Free Starter ($19/report), Essentials $249/mo, Scale $349/mo; reports $13 each on paid plans |
| **RoofSnap** | DIY sketch on aerial imagery + estimating, per seat | $99–105/user/mo (annual discounts to $49–74); measurement orders from $12–13; SketchOS drawing service $9–35 per roof |
| **iRoofing** | Unlimited DIY measurement, digital catalog, visualizer | Subscription, roughly $129+/mo |
| **AccuLynx / JobNimbus** | Full roofing CRM; estimating is a module | $200+/mo, integrates EagleView/Hover reports |
| **Hover** | 3D model from smartphone photos | Per-property fee |
| **RoofStruct** | DIY measurement on satellite imagery, G/B/B estimates | Free tier, Pro $49/mo |

## The feature set they converge on

Every one of these products ships roughly the same core. This is the target feature set for this project.

### 1. Measurement

| Feature | EagleView | Roofr | RoofSnap | Roof Estimator |
| --- | --- | --- | --- | --- |
| Satellite / aerial imagery | ✅ (own oblique imagery) | ✅ | ✅ | ✅ Esri World Imagery |
| Address search | ✅ | ✅ | ✅ | ✅ OSM Nominatim |
| Draw facets yourself | — (done for you) | ✅ | ✅ | ✅ |
| Order a report drawn by someone else | ✅ | ✅ | ✅ | ❌ (by design) |
| Edge labels: eave, rake, ridge, hip, valley | ✅ | ✅ | ✅ | ✅ plus transition, wall, parapet |
| Per-facet pitch | ✅ | ✅ | ✅ | ✅ rise/12, degrees, or % |
| Pitch from imagery / camera | ✅ | partial | ✅ (iOS) | 🔜 roadmap |
| Multi-structure (house + detached garage) | ✅ | ✅ | ✅ | ✅ (one model, many facets) |
| Vertex snapping, drag editing | n/a | ✅ | ✅ | ✅ |
| Blueprint / PDF takeoff | — | — | ✅ | 🔜 roadmap |

### 2. Report

| Feature | EagleView Premium | Roofr | Roof Estimator |
| --- | --- | --- | --- |
| Total area, squares, facet count | ✅ | ✅ | ✅ |
| Predominant pitch, areas-per-pitch table | ✅ | ✅ | ✅ |
| Total ridges/hips, valleys, rakes, eaves | ✅ | ✅ | ✅ |
| Waste table (0–30%, ⅓-square rounding) | ✅ | partial | ✅ same format |
| Suggested waste by complexity | ✅ | — | ✅ heuristic |
| Length / pitch / area diagrams | ✅ | ✅ | ✅ plan diagram with colored edges and lengths |
| 3D model | ✅ | — | 🔜 roadmap |
| Branded PDF | ✅ | ✅ | ✅ print to PDF (branding on roadmap) |
| Structure complexity rating | ✅ | — | ✅ |

### 3. Takeoff

| Feature | Roofr | RoofSnap | iRoofing | Roof Estimator |
| --- | --- | --- | --- | --- |
| Shingle bundles with waste | ✅ | ✅ | ✅ | ✅ |
| Underlayment, ice & water | ✅ | ✅ | ✅ | ✅ |
| Starter, hip/ridge cap, drip edge | ✅ | ✅ | ✅ | ✅ |
| Valley metal, step flashing, boots, vents | ✅ | ✅ | ✅ | ✅ |
| Nails, cap nails, sealant | partial | ✅ | ✅ | ✅ |
| Editable coverage per product | ✅ | ✅ | ✅ | ✅ |
| Formula visible for every line | — | — | — | ✅ |
| Supplier catalog / ordering (ABC, SRS, Beacon) | ✅ | ✅ | ✅ | 🔜 roadmap (CSV export first) |
| Metal / tile / flat systems | partial | ✅ | ✅ | 🔜 roadmap |

### 4. Estimating & proposals

| Feature | Roofr | RoofSnap | Roof Estimator |
| --- | --- | --- | --- |
| Material + labor + other costs | ✅ | ✅ | ✅ |
| Labor by pitch / stories / layers | ✅ | ✅ | ✅ area-weighted pitch tiers |
| Overhead & profit margin | ✅ | ✅ | ✅ |
| Good / Better / Best tiers | ✅ | ✅ | ✅ |
| Proposal PDF with e-signature | ✅ | ✅ | 🔜 proposal yes, signature later |
| Instant homeowner quote widget | ✅ | — | 🔜 roadmap |
| Insurance (Xactimate ESX) export | ✅ | ✅ | 🔜 roadmap |
| CRM, invoicing, payments | ✅ | partial | ❌ out of scope |

## What we deliberately don't build

- **Human-drawn report services**: the point is you draw it.
- **CRM / payments / scheduling**: use what you already have; we'll export cleanly.
- **Proprietary imagery**: we use open or free-to-use tiles. If you have a Google or Mapbox key, plugging it in is a one-line change.
