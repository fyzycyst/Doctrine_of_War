// Reduced motion for CSS (T19b). The renderer and the director already follow
// useReducedMotion() (Settings, else the OS); CSS animations only saw the OS media query.
// Two root classes carry the resolved choice to the stylesheet:
// - html.reduce-motion: reduced (by Settings, or by the OS under "Like my system");
// - html.motion-full: the player chose Full, so the OS media query must not reduce it.
import { useLayoutEffect } from "react";
import { useReducedMotion } from "../render/motion";
import { useAppStore } from "./store";

/** Keeps the root classes in step, before paint, so even the first frame is right. */
export function useMotionClass() {
  const reduced = useReducedMotion();
  const full = useAppStore((s) => s.motion === "full");
  useLayoutEffect(() => {
    const root = document.documentElement;
    root.classList.toggle("reduce-motion", reduced);
    root.classList.toggle("motion-full", full);
  }, [reduced, full]);
}
