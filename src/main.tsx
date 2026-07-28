import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { DiagnosticsView } from "./components/DiagnosticsView";
import "./styles.css";

const params = new URLSearchParams(window.location.search);
if (import.meta.env.VITE_DOCS_CAPTURE === "1" && params.get("capture-scale") === "2") {
  document.documentElement.classList.add("docs-capture-2x");
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>{params.has("diagnostics") ? <DiagnosticsView /> : <App />}</React.StrictMode>,
);
