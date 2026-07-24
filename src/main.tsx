import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { DesignPlayground } from "./components/DesignPlayground";
import { DiagnosticsView } from "./components/DiagnosticsView";
import "./styles.css";

const params = new URLSearchParams(window.location.search);

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>{params.has("diagnostics") ? <DiagnosticsView /> : params.has("designer") ? <DesignPlayground /> : <App />}</React.StrictMode>,
);
