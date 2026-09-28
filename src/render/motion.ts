import { useEffect, useState } from "react";
import { resolveReducedMotion, useMotionStore } from "../app/motionStore";

const QUERY = "(prefers-reduced-motion: reduce)";

/** True when the OS asks for reduced motion. */
export function useOsPrefersReducedMotion(): boolean {
  const get = () => typeof window !== "undefined" && !!window.matchMedia?.(QUERY).matches;
  const [reduced, setReduced] = useState(get);
  useEffect(() => {
    const mq = window.matchMedia?.(QUERY);
    if (!mq) return;
    const on = () => setReduced(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return reduced;
}

/**
 * Resolved reduced motion for the renderer: the OS preference, overridden by
 * the app setting (`useMotionStore.reducedMotion`: "system" | "on" | "off").
 */
export function useReducedMotion(): boolean {
  const os = useOsPrefersReducedMotion();
  const setting = useMotionStore((s) => s.reducedMotion);
  return resolveReducedMotion(setting, os);
}

/** @deprecated use useReducedMotion (kept for existing call sites). */
export const usePrefersReducedMotion = useReducedMotion;

/** Time multiplier for ambient motion (embers, water, fire, cloth…) under reduced motion. */
export const REDUCED_MOTION_SCALE = 0.15;
