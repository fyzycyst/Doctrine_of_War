import { useEffect, useState } from "react";

/** True when the user asks for reduced motion (OS setting). */
export function usePrefersReducedMotion(): boolean {
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
  return reduced;
}
