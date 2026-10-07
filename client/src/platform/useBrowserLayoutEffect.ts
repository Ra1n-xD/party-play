import { useEffect, useLayoutEffect } from "react";

// Layout work runs before browser paint; prerendering never reads the viewport.
export const useBrowserLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;
