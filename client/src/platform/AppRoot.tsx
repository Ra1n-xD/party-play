import { StrictMode } from "react";
import App from "../App";
import { AppErrorBoundary } from "./components/AppErrorBoundary";

/** The build and the browser render exactly the same initial tree. */
export function AppRoot({ initialPath }: { initialPath: string }) {
  return (
    <StrictMode>
      <AppErrorBoundary>
        <App initialPath={initialPath} />
      </AppErrorBoundary>
    </StrictMode>
  );
}
