# @roof-estimator/widget

`<roof-quote>`: an instant roof quote widget for contractor websites. A homeowner types an address, the roof is measured from its building footprint, and they see Good / Better / Best price ranges, an optional monthly financing figure, and a lead form. No server, no account; everything runs in the browser.

Ships as a **web component** (works in Astro, plain HTML, WordPress, Vue, Svelte, anything) and as a **React component**.

## Astro

```bash
pnpm add @roof-estimator/widget
```

```astro
---
// src/components/RoofQuote.astro
const token = import.meta.env.PUBLIC_MAPBOX_TOKEN;
---
<roof-quote
  mapbox-token={token}
  company="Sunshine State Roofing"
  phone="(407) 555-0142"
  color="#0f766e"
  webhook="https://hooks.zapier.com/hooks/catch/…"
></roof-quote>

<script>
  import "@roof-estimator/widget";
</script>

<style>
  roof-quote { --rq-accent: #0f766e; --rq-radius: 10px; --rq-font: inherit; }
</style>
```

Astro bundles the `<script>` for the client, so the element registers on load. No framework integration or `client:` directive needed.

## Plain HTML

```html
<script type="module" src="https://gerelltroche.github.io/roof-estimator/widget/roof-quote.js"></script>

<roof-quote mapbox-token="pk.…" company="Sunshine State Roofing" color="#0f766e"></roof-quote>
```

## React

```tsx
import { RoofQuote } from "@roof-estimator/widget/react";
import "@roof-estimator/widget/styles.css";

<RoofQuote config={{ mapboxToken, company: "Sunshine State Roofing", color: "#0f766e" }} onLead={(lead) => save(lead)} />;
```

## Customizing

### Attributes / config

| Attribute | Config key | Default | Notes |
| --- | --- | --- | --- |
| `mapbox-token` | `mapboxToken` | — | Free public token. Needed for footprint detection and Mapbox imagery; without it the widget asks for an approximate roof size. |
| `company`, `phone`, `email` | same | — | Header. |
| `color` | `color` | `#f59e0b` | Accent. Also settable via `--rq-accent`. |
| `headline`, `cta`, `disclaimer` | same | sensible copy | Main copy. |
| `pitch` | `pitch` | `6` | Assumed rise/12 for every roof. |
| `style` | `style` | `hip` | `hip` or `gable`. |
| `existing-layers`, `stories` | same | `1`, `1` | Tear-off and height pricing. |
| `range-pct` | `rangePct` | `12` | Show each tier as ±this % around the computed price. |
| `financing-apr`, `financing-months` | same | `9.99`, `120` | Omit APR to hide the monthly figure. |
| `webhook` | `webhook` | — | POST lead JSON here. |
| `hide-branding` | — | — | Removes the "Powered by" line. |
| `config` | — | — | A base64url string from the app's **Widget** tab carrying full pricing, takeoff and branding. Other attributes override it. |

Anything not expressible as an attribute (material prices, labor rates, coverage assumptions, text overrides) goes through the `config` property:

```js
const el = document.querySelector("roof-quote");
el.config = {
  pricing: { prices: { shingles: 48 }, labor: { installPerSquare: 125 } },
  texts: { getQuote: "See my price", mostPopular: "Best value" },
};
```

The easiest way to get a complete, priced config is the **Widget** tab in the [Roof Estimator app](https://gerelltroche.github.io/roof-estimator/): set your prices in Takeoff and Estimate, fill in branding, copy the snippet.

### Styling

The widget renders in light DOM, so your page's CSS applies. Theme with custom properties on the element or any ancestor:

```css
roof-quote {
  --rq-accent: #0f766e;   /* buttons, highlights, roof outline */
  --rq-on-accent: #fff;
  --rq-bg: transparent;   /* outer background */
  --rq-card: #fff;
  --rq-text: #111827;
  --rq-muted: #6b7280;
  --rq-line: #e5e7eb;
  --rq-radius: 14px;
  --rq-radius-sm: 10px;
  --rq-font: inherit;
  --rq-shadow: none;
}
```

Or target classes directly: `.rq-card`, `.rq-btn`, `.rq-tier`, `.rq-tier-featured`, `.rq-tier-price`, `.rq-lead`, `.rq-map`, and each step has a class (`.rq-step-address`, `.rq-step-manual`, `.rq-step-sent`). Tiers carry `data-tier="good|better|best"`.

### Events

```js
el.addEventListener("roof-quote:quote", (e) => {
  // e.detail: { address, location, areaSqFt, squares, tiers: [{ name, price, low, high }] }
});
el.addEventListener("roof-quote:lead", (e) => {
  // e.detail adds: lead { name, email, phone, notes }, submittedAt, assumedPitch, lengthsFt, model
  e.preventDefault(); // optional: skip the webhook and deliver the lead yourself
});
```

Both bubble and cross shadow boundaries.

## How the quote is computed

Address → geocode → OSM building polygon from Mapbox Streets vector tiles → minimum-area rectangle fit → hip or gable facets at the assumed pitch → [`@roof-estimator/core`](../core) measurement, takeoff and pricing. Prices are the contractor's own; defaults are placeholders. See the main [README](../../README.md).

## License

MIT
