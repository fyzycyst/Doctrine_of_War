import { useEffect, useState } from "react";
import { useAppStore, type MotionPreference } from "../app/store";

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

/** The OS preference, overridden by the in-game Settings ("reduce" / "full"). */
export function resolveReducedMotion(setting: MotionPreference, osPrefersReduced: boolean): boolean {
  return setting === "system" ? osPrefersReduced : setting === "reduce";
}

/**
 * Resolved reduced motion for the renderer and UI. Single source of truth:
 * `useAppStore.motion`, written by Settings.
 */
export function useReducedMotion(): boolean {
  const os = useOsPrefersReducedMotion();
  const setting = useAppStore((s) => s.motion);
  return resolveReducedMotion(setting, os);
}

/** @deprecated use useReducedMotion (kept for existing call sites). */
export const usePrefersReducedMotion = useReducedMotion;

/** Time multiplier for ambient motion (embers, water, fire, cloth…) under reduced motion. */
export const REDUCED_MOTION_SCALE = 0.15;
