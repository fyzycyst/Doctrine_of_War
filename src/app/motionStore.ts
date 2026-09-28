import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

/**
 * App-level reduced-motion override (T13). "system" follows the OS
 * `prefers-reduced-motion`; "on" / "off" force it. The renderer reads the
 * resolved value via `useReducedMotion()` (src/render/motion.ts).
 */
export type ReducedMotionSetting = "system" | "on" | "off";

export interface MotionSettings {
  reducedMotion: ReducedMotionSetting;
  setReducedMotion: (setting: ReducedMotionSetting) => void;
}

export const MOTION_STORAGE_KEY = "doctrine-of-war.motion";

export const useMotionStore = create<MotionSettings>()(
  persist(
    (set) => ({
      reducedMotion: "system",
      setReducedMotion: (reducedMotion) => set({ reducedMotion }),
    }),
    {
      name: MOTION_STORAGE_KEY,
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({ reducedMotion: s.reducedMotion }),
    },
  ),
);

/** Pure resolution of the setting against the OS preference. */
export function resolveReducedMotion(setting: ReducedMotionSetting, osPrefersReduced: boolean): boolean {
  return setting === "system" ? osPrefersReduced : setting === "on";
}
