import { decodeWidgetConfig, RoofQuote } from "@roof-estimator/widget/react";
import React from "react";
import ReactDOM from "react-dom/client";
import "@roof-estimator/widget/styles.css";
import { MAPBOX_TOKEN } from "../providers";

/**
 * Hosted standalone page: /widget.html?c=<encoded config>. Used by the
 * Widget tab's "Preview" link. The hosted page supplies the site's own
 * Mapbox token when the config doesn't carry one.
 */
const config = decodeWidgetConfig(new URLSearchParams(location.search).get("c"));
if (!config.mapboxToken && MAPBOX_TOKEN) config.mapboxToken = MAPBOX_TOKEN;

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <RoofQuote config={config} />
  </React.StrictMode>,
);
