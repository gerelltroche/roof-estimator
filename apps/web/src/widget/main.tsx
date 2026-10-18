import React from "react";
import ReactDOM from "react-dom/client";
import "maplibre-gl/dist/maplibre-gl.css";
import { Widget } from "./Widget";
import "./widget.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Widget />
  </React.StrictMode>,
);
