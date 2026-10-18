# Astro example

`src/components/RoofQuote.astro` wraps `<roof-quote>` as an Astro component with typed props. Copy it into your project, add `@roof-estimator/widget` as a dependency, put your Mapbox public token in `.env` as `PUBLIC_MAPBOX_TOKEN`, and use it on any page:

```astro
---
import RoofQuote from "../components/RoofQuote.astro";
---
<RoofQuote company="Sunshine State Roofing" phone="(407) 555-0142" color="#0f766e" webhook="https://hooks.zapier.com/…" />
```

To handle leads in your own code instead of a webhook, add a client script:

```astro
<script>
  document.querySelector("roof-quote")?.addEventListener("roof-quote:lead", (e) => {
    e.preventDefault();
    fetch("/api/leads", { method: "POST", body: JSON.stringify(e.detail) });
  });
</script>
```
