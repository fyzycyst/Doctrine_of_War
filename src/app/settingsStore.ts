import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { Pace } from "./playback/timeline";
import { useAppStore, type DofMode, type MotionPreference } from "./store";

export type QualitySetting = "low" | "high" | "ultra";

/**
 * Player settings (T14), persisted in localStorage. Audio lives in audioStore (T08);
 * the render-facing values (quality, ultra DPR, motion) are pushed into the app store.
 */
export interface Settings {
  quality: QualitySetting;
  /** The pace new battles start at (the command bar still toggles it per battle). */
  defaultPace: Pace;
  /** "Doctrine only": fortune off for battles begun from now on. */
  doctrineOnly: boolean;
  motion: MotionPreference;
  /** Depth of field: "on" | "subtle" (default) | "off" (T20). */
  depthOfField: DofMode;
  set: (patch: Partial<Omit<Settings, "set">>) => void;
}

export const SETTINGS_STORAGE_KEY = "doctrine-of-war.settings";

export const useSettings = create<Settings>()(
  persist(
    (set) => ({
      quality: "high",
      defaultPace: "readable",
      doctrineOnly: false,
      motion: "system",
      depthOfField: "subtle",
      set: (patch) => set(patch),
    }),
    {
      name: SETTINGS_STORAGE_KEY,
      storage: createJSONStorage(() => localStorage),
      partialize: ({ quality, defaultPace, doctrineOnly, motion, depthOfField }) => ({ quality, defaultPace, doctrineOnly, motion, depthOfField }),
    },
  ),
);

/** Pushes the render-facing settings into the app store (now and on every change). */
function applyDisplay({ quality, motion, depthOfField }: Pick<Settings, "quality" | "motion" | "depthOfField">) {
  const app = useAppStore.getState();
  app.setQuality(quality === "low" ? "low" : "high");
  app.setDisplay({ ultra: quality === "ultra", motion, dofMode: depthOfField ?? "subtle" });
}
applyDisplay(useSettings.getState());
useSettings.subscribe((settings) => applyDisplay(settings));
