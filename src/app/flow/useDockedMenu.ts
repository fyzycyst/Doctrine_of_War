// T25 §3: the menus over the islands (Skirmish, Choose a campaign) dock their panel on the
// left and frame the islands on the right, from this width up; narrower windows keep the
// centred panel.
import { useEffect, useState } from "react";

export const DOCK_MIN_WIDTH = 1000;
const QUERY = `(min-width: ${DOCK_MIN_WIDTH}px)`;

const wide = () => (typeof window === "undefined" ? true : (window.matchMedia?.(QUERY).matches ?? window.innerWidth >= DOCK_MIN_WIDTH));

/** True while the window is wide enough to dock the menu panel beside the islands. */
export function useDockedMenu(): boolean {
  const [docked, setDocked] = useState(wide);
  useEffect(() => {
    const media = window.matchMedia?.(QUERY);
    const update = () => setDocked(wide());
    media?.addEventListener("change", update);
    window.addEventListener("resize", update);
    return () => {
      media?.removeEventListener("change", update);
      window.removeEventListener("resize", update);
    };
  }, []);
  return docked;
}
