import "@roof-estimator/widget"; // registers <roof-quote>
import type { RoofQuoteLeadEvent, RoofQuoteQuoteEvent } from "@roof-estimator/widget";
import { MAPBOX_TOKEN } from "../providers";

// The demo page supplies the site's Mapbox token to the element. A client
// site would put their own token in the mapbox-token attribute.
const el = document.querySelector("roof-quote")!;
if (MAPBOX_TOKEN) el.setAttribute("mapbox-token", MAPBOX_TOKEN);

// Programmatic config: anything not expressible as an attribute (pricing,
// takeoff assumptions, text overrides) goes through the `config` property.
el.config = {
  texts: { getQuote: "See my price" },
  pricing: {
    ...el.config.pricing!,
  },
};

const out = document.getElementById("lead-output")!;
el.addEventListener("roof-quote:quote", (e: CustomEvent<RoofQuoteQuoteEvent>) => {
  out.textContent = "Quote shown:\n" + JSON.stringify(e.detail, null, 2);
});
el.addEventListener("roof-quote:lead", (e: CustomEvent<RoofQuoteLeadEvent>) => {
  // No webhook on the demo; handle the lead right here instead.
  e.preventDefault();
  out.textContent = "Lead submitted:\n" + JSON.stringify(e.detail, null, 2);
  out.scrollIntoView({ behavior: "smooth", block: "nearest" });
});
