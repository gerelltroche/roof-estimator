import { DEFAULT_WIDGET_CONFIG, encodeWidgetConfig, type WidgetConfig } from "../widget/config";

// A fictional contractor's configuration. In the real app this is produced by
// the Widget tab, with the contractor's own pricing baked in.
const config: WidgetConfig = {
  ...DEFAULT_WIDGET_CONFIG,
  company: "Sunshine State Roofing",
  phone: "(407) 555-0142",
  color: "#0f766e",
  headline: "Get your instant roof quote",
  cta: "Lock in this price with a free inspection",
  pitch: 6,
  style: "hip",
  rangePct: 10,
  financingApr: 8.99,
  financingMonths: 144,
  webhook: "",
};

const url = new URL("widget.html", location.href);
url.searchParams.set("c", encodeWidgetConfig(config));
(document.getElementById("quote-widget") as HTMLIFrameElement).src = url.toString();

// Catch leads without any server: the widget posts them to the parent page.
window.addEventListener("message", (e: MessageEvent) => {
  if (e.data?.type !== "roof-estimator:lead") return;
  const out = document.getElementById("lead-output")!;
  out.textContent = JSON.stringify(e.data.payload, null, 2);
  out.scrollIntoView({ behavior: "smooth", block: "nearest" });
});
