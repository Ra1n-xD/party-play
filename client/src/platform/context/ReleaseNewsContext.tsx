import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { releaseHighlights, type ReleaseSection } from "../releaseHighlights";

export const announcedRelease = releaseHighlights.find((release) => release.announcement);
const sections = announcedRelease?.announcement?.sections ?? [];
const storageKey = `partyside_release_news_v1:${announcedRelease?.id ?? "none"}`;
interface ReadState {
  dismissed: boolean;
  visited: ReleaseSection[];
}
const emptyState: ReadState = { dismissed: false, visited: [] };

function merge(a: ReadState, b: ReadState): ReadState {
  return {
    dismissed: a.dismissed || b.dismissed,
    visited: [...new Set([...a.visited, ...b.visited])],
  };
}
function readState(): ReadState {
  let result = emptyState;
  for (const kind of ["localStorage", "sessionStorage"] as const) {
    try {
      const value: unknown = JSON.parse(window[kind].getItem(storageKey) ?? "null");
      if (value && typeof value === "object" && "dismissed" in value && "visited" in value) {
        result = merge(result, {
          dismissed: value.dismissed === true,
          visited: Array.isArray(value.visited)
            ? value.visited.filter((page): page is ReleaseSection => sections.includes(page))
            : [],
        });
      }
    } catch {
      /* Private mode and unavailable storage must never block the site. */
    }
  }
  return result;
}
function saveState(value: ReadState) {
  for (const kind of ["localStorage", "sessionStorage"] as const) {
    try {
      window[kind].setItem(storageKey, JSON.stringify(value));
    } catch {
      /* Keep in-memory state. */
    }
  }
}
interface ReleaseNews {
  ready: boolean;
  dismissed: boolean;
  hasNews: (page: string) => boolean;
  dismiss: () => void;
  visit: (page: ReleaseSection) => void;
}
const ReleaseNewsContext = createContext<ReleaseNews>({
  ready: false,
  dismissed: false,
  hasNews: () => false,
  dismiss: () => {},
  visit: () => {},
});

export function ReleaseNewsProvider({ children }: { children: ReactNode }) {
  // The prerender and the first browser render both have no unread marks or modal.
  const [ready, setReady] = useState(false);
  const [state, setState] = useState<ReadState>(emptyState);
  useEffect(() => {
    setState(readState());
    setReady(true);
    const sync = (event: StorageEvent) => {
      if (event.key === storageKey) setState((previous) => merge(previous, readState()));
    };
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, []);
  useEffect(() => {
    if (ready) saveState(merge(state, readState()));
  }, [ready, state]);
  const dismiss = useCallback(
    () => setState((previous) => ({ ...merge(previous, readState()), dismissed: true })),
    [],
  );
  const visit = useCallback((page: ReleaseSection) => {
    if (!sections.includes(page)) return;
    setState((previous) =>
      previous.visited.includes(page)
        ? previous
        : merge(merge(previous, readState()), { dismissed: false, visited: [page] }),
    );
  }, []);
  return (
    <ReleaseNewsContext.Provider
      value={{
        ready,
        dismissed: state.dismissed,
        hasNews: (page) =>
          ready && sections.some((section) => section === page && !state.visited.includes(section)),
        dismiss,
        visit,
      }}
    >
      {children}
    </ReleaseNewsContext.Provider>
  );
}
export const useReleaseNews = () => useContext(ReleaseNewsContext);
