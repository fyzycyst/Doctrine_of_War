import { useFrame } from "@react-three/fiber";
import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useAppStore, type RenderQuality } from "../../app/store";
import { AtmosphereRuntime } from "../atmosphere/atmosphereRuntime";
import { REDUCED_MOTION_SCALE, useReducedMotion } from "../motion";
import { blendPresets } from "./blendPresets";
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
  /** Reduced motion (OS preference or the app override). */
  reducedMotion: boolean;
  /** Multiplier for ambient animation time: 1, or REDUCED_MOTION_SCALE when reduced. */
  motion: number;
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
  const reducedMotion = useReducedMotion();
  const runtime = useRef<AtmosphereRuntime | null>(null);
  if (!runtime.current) runtime.current = new AtmosphereRuntime(skin.weather, weather);
  const atmosphere = runtime.current;

  useEffect(() => atmosphere.setPresets(skin.weather), [atmosphere, skin.weather]);
  useEffect(() => atmosphere.setWeather(weather), [atmosphere, weather]);

  const preset = useTimeOfDayFade(skin, timeOfDay, reducedMotion);

  const value = useMemo<Look>(
    () => ({
      skin,
      timeOfDay,
      weather,
      preset,
      quality,
      atmosphere,
      reducedMotion,
      motion: reducedMotion ? REDUCED_MOTION_SCALE : 1,
    }),
    [skin, timeOfDay, weather, preset, quality, atmosphere, reducedMotion],
  );

  return <LookContext.Provider value={value}>{children}</LookContext.Provider>;
}

/** Time-of-day cross-fade length (e.g. Hold for Dawn's predawn → sunrise between phases). */
export const TIME_OF_DAY_FADE = 3;
const FADE_STEPS_PER_SECOND = 12;

/**
 * The lighting preset in effect: when `timeOfDay` changes, it blends from the
 * preset on screen to the new one over TIME_OF_DAY_FADE seconds (stepped, so
 * dependants re-render ~12×/s during the fade only). Instant under reduced
 * motion or on a skin change.
 */
function useTimeOfDayFade(skin: Skin, timeOfDay: TimeOfDay, reducedMotion: boolean): LightingPreset {
  const target = skin.lighting[timeOfDay];
  const [shown, setShown] = useState(target);
  const shownRef = useRef(target);
  const skinRef = useRef(skin);
  useEffect(() => {
    if (skinRef.current !== skin || reducedMotion) {
      skinRef.current = skin;
      shownRef.current = target;
      setShown(target);
      return;
    }
    const from = shownRef.current;
    if (from === target) return;
    const start = performance.now();
    const timer = window.setInterval(() => {
      const t = Math.min(1, (performance.now() - start) / 1000 / TIME_OF_DAY_FADE);
      const next = t >= 1 ? target : blendPresets(from, target, t);
      shownRef.current = next;
      setShown(next);
      if (t >= 1) window.clearInterval(timer);
    }, 1000 / FADE_STEPS_PER_SECOND);
    return () => window.clearInterval(timer);
  }, [skin, target, reducedMotion]);
  return shown;
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
    reducedMotion: false,
    motion: 1,
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
