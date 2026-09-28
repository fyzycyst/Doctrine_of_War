import * as THREE from "three";
import { hexKey, type HexCoord } from "../../game/board";
import { WEATHER_KINDS, type WeatherKind, type WeatherPreset } from "../skins/types";

/**
 * Atmosphere state that changes over time: weather weights (so shifts between
 * phases cross-fade) and the per-hex fog-of-war field (so the mist parts when
 * an enemy is sighted). Plain TS, ticked once per frame; every consumer reads
 * `runtime.mix` / `runtime.fog` in its own useFrame.
 */

export type WeatherWeights = Record<WeatherKind, number>;

/** The blended weather overlay for the current frame. */
export interface WeatherMix {
  mistDensityAdd: number;
  mistColor: THREE.Color;
  mistColorMix: number;
  mistHeightAdd: number;
  rain: number;
  rainRate: number;
  rainSpeed: number;
  rainColor: THREE.Color;
  ash: number;
  ashRate: number;
  ashSpeed: number;
  ashColor: THREE.Color;
  wetness: number;
  sunScale: number;
  ambientScale: number;
  fogScale: number;
  exposureScale: number;
  skyTint: THREE.Color;
  skyMix: number;
  saturation: number;
  contrast: number;
  gradeTint: THREE.Color;
  gradeTintMix: number;
}

export function weightsFor(weather: WeatherKind): WeatherWeights {
  return { clear: 0, rain: 0, mist: 0, ashWind: 0, [weather]: 1 };
}

/** Pure: blend weather presets by weight (weights are expected to sum to 1). */
export function mixWeather(presets: Record<WeatherKind, WeatherPreset>, w: WeatherWeights): WeatherMix {
  const sum = (f: (p: WeatherPreset) => number) => WEATHER_KINDS.reduce((acc, k) => acc + w[k] * f(presets[k]), 0);
  // Colour blends weight each preset's colour by how strongly it applies.
  const blendColor = (colorOf: (p: WeatherPreset) => string, amountOf: (p: WeatherPreset) => number) => {
    const c = new THREE.Color(0, 0, 0);
    let total = 0;
    for (const k of WEATHER_KINDS) {
      const a = w[k] * amountOf(presets[k]);
      if (a <= 0) continue;
      c.add(new THREE.Color(colorOf(presets[k])).multiplyScalar(a));
      total += a;
    }
    return total > 0 ? c.multiplyScalar(1 / total) : new THREE.Color(1, 1, 1);
  };
  const rainW = WEATHER_KINDS.reduce((a, k) => a + (presets[k].particles.kind === "rain" && presets[k].particles.rate > 0 ? w[k] : 0), 0);
  const ashW = WEATHER_KINDS.reduce((a, k) => a + (presets[k].particles.kind === "ash" && presets[k].particles.rate > 0 ? w[k] : 0), 0);
  const pick = (kind: "rain" | "ash") =>
    WEATHER_KINDS.map((k) => presets[k]).find((p) => p.particles.kind === kind && p.particles.rate > 0)?.particles;
  const rainP = pick("rain");
  const ashP = pick("ash");
  return {
    mistDensityAdd: sum((p) => p.mist.densityAdd),
    mistColor: blendColor((p) => p.mist.color, (p) => p.mist.colorMix),
    mistColorMix: sum((p) => p.mist.colorMix),
    mistHeightAdd: sum((p) => p.mist.heightAdd),
    rain: rainW,
    rainRate: rainP?.rate ?? 0,
    rainSpeed: rainP?.speed ?? 7,
    rainColor: new THREE.Color(rainP?.color ?? "#c8d4e0"),
    ash: ashW,
    ashRate: ashP?.rate ?? 0,
    ashSpeed: ashP?.speed ?? 1.5,
    ashColor: new THREE.Color(ashP?.color ?? "#9a9088"),
    wetness: sum((p) => p.wetness),
    sunScale: sum((p) => p.light.sunScale),
    ambientScale: sum((p) => p.light.ambientScale),
    fogScale: sum((p) => p.light.fogScale),
    exposureScale: sum((p) => p.light.exposureScale),
    skyTint: blendColor((p) => p.sky.tint, (p) => p.sky.mix),
    skyMix: sum((p) => p.sky.mix),
    saturation: sum((p) => p.grading.saturation),
    contrast: sum((p) => p.grading.contrast),
    gradeTint: blendColor((p) => p.grading.tint, (p) => p.grading.tintMix),
    gradeTintMix: sum((p) => p.grading.tintMix),
  };
}

/** Weather cross-fade duration in seconds. */
export const WEATHER_FADE = 2.5;
/** Fog clears fast (a reveal) and closes in slowly. */
export const FOG_REVEAL_TIME = 1.1;
export const FOG_CONCEAL_TIME = 1.8;
/** Reveal swirls: how long the mist eddies around an emerging squad, and how many at once. */
export const SWIRL_TIME = 1.6;
export const MAX_SWIRLS = 3;

export interface MistSwirl {
  x: number;
  z: number;
  /** 0..1 through SWIRL_TIME. */
  age: number;
}

export class AtmosphereRuntime {
  weights: WeatherWeights;
  target: WeatherWeights;
  mix: WeatherMix;
  /** Current / target fog amount per board hex key (1 = unseen). */
  fog = new Map<string, number>();
  fogTarget = new Map<string, number>();
  /** Bumped whenever the fog field changed this frame (consumers re-upload). */
  fogVersion = 0;
  /** 1 = normal; 0 freezes weather and fog transitions (lab stills). */
  timeScale = 1;
  /** Recent reveal points (world x/z); the mist parts with a small eddy around each. */
  swirls: MistSwirl[] = [];

  constructor(
    private presets: Record<WeatherKind, WeatherPreset>,
    weather: WeatherKind,
  ) {
    this.weights = weightsFor(weather);
    this.target = weightsFor(weather);
    this.mix = mixWeather(presets, this.weights);
  }

  setPresets(presets: Record<WeatherKind, WeatherPreset>) {
    this.presets = presets;
    this.mix = mixWeather(presets, this.weights);
  }

  setWeather(weather: WeatherKind) {
    this.target = weightsFor(weather);
  }

  /**
   * Set which board hexes are fogged. With `immediate`, jumps there (first mount);
   * otherwise the field eases toward it.
   */
  setFog(boardHexes: HexCoord[], visible: HexCoord[] | null, immediate = false) {
    const seen = visible ? new Set(visible.map(hexKey)) : null;
    this.fogTarget.clear();
    for (const hex of boardHexes) {
      const key = hexKey(hex);
      const t = seen && !seen.has(key) ? 1 : 0;
      this.fogTarget.set(key, t);
      if (immediate || !this.fog.has(key)) this.fog.set(key, t);
    }
    for (const key of [...this.fog.keys()]) if (!this.fogTarget.has(key)) this.fog.delete(key);
    this.fogVersion += 1;
  }

  /** Start a reveal swirl at a world position (oldest dropped past MAX_SWIRLS). */
  swirl(x: number, z: number) {
    this.swirls.push({ x, z, age: 0 });
    if (this.swirls.length > MAX_SWIRLS) this.swirls.shift();
  }

  tick(dt: number) {
    const step = dt * this.timeScale;
    if (step <= 0) return;
    if (this.swirls.length) {
      for (const s of this.swirls) s.age += step / SWIRL_TIME;
      this.swirls = this.swirls.filter((s) => s.age < 1);
    }
    let changed = false;
    for (const k of WEATHER_KINDS) {
      const d = this.target[k] - this.weights[k];
      if (Math.abs(d) > 1e-4) {
        this.weights[k] += Math.sign(d) * Math.min(Math.abs(d), step / WEATHER_FADE);
        changed = true;
      }
    }
    if (changed) this.mix = mixWeather(this.presets, this.weights);

    let fogChanged = false;
    for (const [key, target] of this.fogTarget) {
      const cur = this.fog.get(key) ?? target;
      const d = target - cur;
      if (Math.abs(d) < 1e-4) continue;
      const rate = d < 0 ? step / FOG_REVEAL_TIME : step / FOG_CONCEAL_TIME;
      this.fog.set(key, cur + Math.sign(d) * Math.min(Math.abs(d), rate));
      fogChanged = true;
    }
    if (fogChanged) this.fogVersion += 1;
  }
}
