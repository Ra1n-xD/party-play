import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useBrowserLayoutEffect } from "../useBrowserLayoutEffect";

type GameView = "2d" | "3d";
const STORAGE_KEY = "partyside_game_view";
const GameViewPreferenceContext = createContext<{
  gameView: GameView;
  setGameView: (value: GameView) => void;
} | null>(null);

function parseGameView(value: string | null): GameView {
  return value === "2d" ? "2d" : "3d";
}

export function GameViewPreferenceProvider({ children }: { children: ReactNode }) {
  const [gameView, setValue] = useState<GameView>("3d");
  useBrowserLayoutEffect(() => {
    try {
      setValue(parseGameView(window.localStorage.getItem(STORAGE_KEY)));
    } catch {
      // Keep the default when browser storage is unavailable.
    }
  }, []);
  useEffect(() => {
    const sync = (event: StorageEvent) => {
      if (event.key !== STORAGE_KEY && event.key !== null) return;
      try {
        if (event.storageArea === window.localStorage) setValue(parseGameView(event.newValue));
      } catch {
        // The preference remains usable in this tab without storage.
      }
    };
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, []);
  const setGameView = (value: GameView) => {
    setValue(value);
    try {
      window.localStorage.setItem(STORAGE_KEY, value);
    } catch {
      // Apply immediately even if the browser cannot persist the preference.
    }
  };
  return (
    <GameViewPreferenceContext.Provider value={{ gameView, setGameView }}>
      {children}
    </GameViewPreferenceContext.Provider>
  );
}

export function useGameViewPreference() {
  const context = useContext(GameViewPreferenceContext);
  if (!context) throw new Error("GameViewPreferenceProvider is missing");
  return context;
}

/** In-game changes apply to the current table without replacing the saved default. */
export function useGameView() {
  const { gameView } = useGameViewPreference();
  const [override, setOverride] = useState<boolean | null>(null);
  const is3D = override ?? gameView === "3d";
  const setIs3D = (value: boolean | ((previous: boolean) => boolean)) => {
    setOverride((previous) =>
      typeof value === "function" ? value(previous ?? gameView === "3d") : value,
    );
  };
  return [is3D, setIs3D] as const;
}
