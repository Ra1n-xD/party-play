import ReactDOM from "react-dom/client";
import "./platform/reloadOnUpdate";
import { AppRoot } from "./platform/AppRoot";
import "./styles/global.css";

const container = document.getElementById("root")!;
const initialPath =
  container.dataset.appPath ?? (window.location.pathname.replace(/\/$/, "") || "/");
const application = <AppRoot initialPath={initialPath} />;

if (container.dataset.appPath) {
  ReactDOM.hydrateRoot(container, application);
} else {
  // Vite development serves an empty root, without prerendered HTML.
  ReactDOM.createRoot(container).render(application);
}
