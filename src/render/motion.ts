import { useEffect, useState } from "react";
import { useAppStore } from "../app/store";

/**
 * True when motion should be reduced: the OS setting, unless the in-game Settings
 * override it ("reduce" or "full").
 */
export function usePrefersReducedMotion(): boolean {
  const override = useAppStore((s) => s.motion);
  const query = "(prefers-reduced-motion: reduce)";
  const get = () => typeof window !== "undefined" && !!window.matchMedia?.(query).matches;
  const [reduced, setReduced] = useState(get);
  useEffect(() => {
    const mq = window.matchMedia?.(query);
    if (!mq) return;
    const on = () => setReduced(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return override === "system" ? reduced : override === "reduce";
}
