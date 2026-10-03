import React from "react";
import ReactDOM from "react-dom/client";
import "./platform/reloadOnUpdate";
import App from "./App";
import { AppErrorBoundary } from "./platform/components/AppErrorBoundary";
import "./styles/global.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <AppErrorBoundary>
      <App />
    </AppErrorBoundary>
  </React.StrictMode>,
);
