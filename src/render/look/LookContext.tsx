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
  /** Seconds a time-of-day change cross-fades over (0 under reduced motion). */
  timeOfDayFade: number;
}

const LookContext = createContext<Look | null>(null);

export function LookProvider({
  skin,
  timeOfDay,
  weather = "clear",
  timeOfDayFade = TIME_OF_DAY_FADE,
  children,
}: {
  skin: Skin;
  timeOfDay: TimeOfDay;
  /** Engine weather; shifts cross-fade over `WEATHER_FADE` seconds. */
  weather?: WeatherKind;
  /**
   * Seconds a `timeOfDay` change cross-fades over (default TIME_OF_DAY_FADE).
   * Stage moments pass a shorter one (Hold for Dawn's dawn turn: ~2 s).
   */
  timeOfDayFade?: number;
  children: ReactNode;
}) {
  const quality = useAppStore((state) => state.quality);
  const reducedMotion = useReducedMotion();
  const runtime = useRef<AtmosphereRuntime | null>(null);
  if (!runtime.current) runtime.current = new AtmosphereRuntime(skin.weather, weather);
  const atmosphere = runtime.current;

  useEffect(() => atmosphere.setPresets(skin.weather), [atmosphere, skin.weather]);
  useEffect(() => atmosphere.setWeather(weather), [atmosphere, weather]);

  const fade = reducedMotion ? 0 : Math.max(0, timeOfDayFade);
  const preset = useTimeOfDayFade(skin, timeOfDay, fade);

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
      timeOfDayFade: fade,
    }),
    [skin, timeOfDay, weather, preset, quality, atmosphere, reducedMotion, fade],
  );

  return <LookContext.Provider value={value}>{children}</LookContext.Provider>;
}

/** Default time-of-day cross-fade length (e.g. Hold for Dawn's predawn → sunrise between phases). */
export const TIME_OF_DAY_FADE = 3;
const FADE_STEP = 1 / 12;

/**
 * The lighting preset in effect: when `timeOfDay` changes, it blends from the
 * preset on screen to the new one over `duration` seconds of the R3F clock (so
 * lab sequence captures are deterministic), stepped at ~12/s so dependants only
 * re-render during the fade. Instant when `duration` is 0 (reduced motion) or
 * on a skin change.
 */
function useTimeOfDayFade(skin: Skin, timeOfDay: TimeOfDay, duration: number): LightingPreset {
  const target = skin.lighting[timeOfDay];
  const [shown, setShown] = useState(target);
  const fade = useRef<{ from: LightingPreset; to: LightingPreset; start: number | null; step: number } | null>(null);
  const shownRef = useRef(target);
  const skinRef = useRef(skin);
  useEffect(() => {
    if (skinRef.current !== skin || duration <= 0) {
      skinRef.current = skin;
      fade.current = null;
      shownRef.current = target;
      setShown(target);
      return;
    }
    if (shownRef.current === target) return;
    fade.current = { from: shownRef.current, to: target, start: null, step: -1 };
  }, [skin, target, duration]);
  useFrame(({ clock }) => {
    const f = fade.current;
    if (!f) return;
    if (f.start === null) f.start = clock.elapsedTime;
    const t = Math.min(1, (clock.elapsedTime - f.start) / duration);
    const step = t >= 1 ? Infinity : Math.floor(t / (FADE_STEP / duration));
    if (step === f.step) return;
    f.step = step;
    const next = t >= 1 ? f.to : blendPresets(f.from, f.to, t);
    shownRef.current = next;
    setShown(next);
    if (t >= 1) fade.current = null;
  });
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
    timeOfDayFade: TIME_OF_DAY_FADE,
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
