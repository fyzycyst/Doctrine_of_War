import { createContext, useContext, useMemo, type ReactNode } from "react";
import { useAppStore, type RenderQuality } from "../../app/store";
import { emberDusk } from "../skins/emberDusk";
import type { LightingPreset, Skin, TimeOfDay } from "../skins/types";

/**
 * The resolved look for the current scene: the active skin plus the lighting
 * preset it maps the scenario's semantic time of day to. Every renderer
 * component reads colours from here instead of hard-coding them.
 */
export interface Look {
  skin: Skin;
  timeOfDay: TimeOfDay;
  preset: LightingPreset;
  quality: RenderQuality;
}

const LookContext = createContext<Look | null>(null);

export function LookProvider({
  skin,
  timeOfDay,
  children,
}: {
  skin: Skin;
  timeOfDay: TimeOfDay;
  children: ReactNode;
}) {
  const quality = useAppStore((state) => state.quality);
  const value = useMemo<Look>(
    () => ({ skin, timeOfDay, preset: skin.lighting[timeOfDay], quality }),
    [skin, timeOfDay, quality],
  );

  return <LookContext.Provider value={value}>{children}</LookContext.Provider>;
}

export function useLook(): Look {
  const look = useContext(LookContext);
  if (look) return look;
  // Fallback so components still render outside a provider (e.g. in isolation).
  return { skin: emberDusk, timeOfDay: "dusk", preset: emberDusk.lighting.dusk, quality: "high" };
}
