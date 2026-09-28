import { useFrame } from "@react-three/fiber";
import { createContext, useContext, useEffect, useMemo, useRef, type ReactNode } from "react";
import { useAppStore, type RenderQuality } from "../../app/store";
import { AtmosphereRuntime } from "../atmosphere/atmosphereRuntime";
import { SURFACE_UNIFORMS } from "../shaders/surface";
import { emberDusk } from "../skins/emberDusk";
import type { LightingPreset, Skin, TimeOfDay, WeatherKind } from "../skins/types";

/**
 * The resolved look for the current scene: the active skin, the lighting preset
 * it maps the scenario's semantic time of day to, and the atmosphere runtime
 * that cross-fades the weather overlay. Every renderer component reads colours
 * from here instead of hard-coding them.
 */
export interface Look {
  skin: Skin;
  timeOfDay: TimeOfDay;
  weather: WeatherKind;
  preset: LightingPreset;
  quality: RenderQuality;
  atmosphere: AtmosphereRuntime;
}

const LookContext = createContext<Look | null>(null);

export function LookProvider({
  skin,
  timeOfDay,
  weather = "clear",
  children,
}: {
  skin: Skin;
  timeOfDay: TimeOfDay;
  /** Engine weather; shifts cross-fade over `WEATHER_FADE` seconds. */
  weather?: WeatherKind;
  children: ReactNode;
}) {
  const quality = useAppStore((state) => state.quality);
  const runtime = useRef<AtmosphereRuntime | null>(null);
  if (!runtime.current) runtime.current = new AtmosphereRuntime(skin.weather, weather);
  const atmosphere = runtime.current;

  useEffect(() => atmosphere.setPresets(skin.weather), [atmosphere, skin.weather]);
  useEffect(() => atmosphere.setWeather(weather), [atmosphere, weather]);

  const value = useMemo<Look>(
    () => ({ skin, timeOfDay, weather, preset: skin.lighting[timeOfDay], quality, atmosphere }),
    [skin, timeOfDay, weather, quality, atmosphere],
  );

  return <LookContext.Provider value={value}>{children}</LookContext.Provider>;
}

const fallbackAtmosphere = new AtmosphereRuntime(emberDusk.weather, "clear");

export function useLook(): Look {
  const look = useContext(LookContext);
  if (look) return look;
  // Fallback so components still render outside a provider (e.g. in isolation).
  return {
    skin: emberDusk,
    timeOfDay: "dusk",
    weather: "clear",
    preset: emberDusk.lighting.dusk,
    quality: "high",
    atmosphere: fallbackAtmosphere,
  };
}

/** Advances weather and fog transitions; render it before other atmosphere consumers. */
export function AtmosphereTicker() {
  const { atmosphere } = useLook();
  useFrame((_, dt) => {
    atmosphere.tick(Math.min(dt, 0.1));
    SURFACE_UNIFORMS.uWet.value = atmosphere.mix.wetness;
  });
  return null;
}
