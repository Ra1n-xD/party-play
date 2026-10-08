import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { brandStorage } from "../brandStorage";

const STORAGE_KEY = "partyside_navigation_collapsed_v1";
const NavigationContext = createContext({
  collapsed: false,
  animate: false,
  toggleCollapsed: () => {},
});

export function NavigationProvider({ children }: { children: ReactNode }) {
  // The server and the first browser render always start with the expanded panel.
  const [collapsed, setCollapsed] = useState(false);
  const [animate, setAnimate] = useState(false);
  useEffect(() => {
    try {
      setCollapsed(brandStorage.getItem(STORAGE_KEY) === "true");
    } catch {
      // Navigation still works when browser storage is unavailable.
    }
  }, []);

  const toggleCollapsed = () => {
    const next = !collapsed;
    setAnimate(true);
    setCollapsed(next);
    try {
      brandStorage.setItem(STORAGE_KEY, String(next));
    } catch {
      // Keep the preference for this session even if it cannot be persisted.
    }
  };

  return (
    <NavigationContext.Provider value={{ collapsed, animate, toggleCollapsed }}>
      {children}
    </NavigationContext.Provider>
  );
}

export const useNavigation = () => useContext(NavigationContext);
