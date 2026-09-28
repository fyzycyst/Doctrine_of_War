import * as THREE from "three";
import type { GradingParams, Hex, LightingPreset } from "../skins/types";

/**
 * Pure blend of two lighting presets (colours in linear space, numbers
 * linearly). Discrete fields (particle kind, tone-mapping mode, id/label)
 * switch at the halfway point. Used to cross-fade time of day between phases
 * (Hold for Dawn: predawn → sunrise).
 */
export function blendPresets(a: LightingPreset, b: LightingPreset, t: number): LightingPreset {
  const u = Math.max(0, Math.min(1, t));
  if (u <= 0) return a;
  if (u >= 1) return b;
  const n = (x: number, y: number) => x + (y - x) * u;
  const c = (x: Hex, y: Hex): Hex => `#${new THREE.Color(x).lerp(new THREE.Color(y), u).getHexString()}`;
  const late = u >= 0.5;
  const grading: GradingParams = {
    saturation: n(a.grading.saturation, b.grading.saturation),
    contrast: n(a.grading.contrast, b.grading.contrast),
    brightness: n(a.grading.brightness, b.grading.brightness),
    shadowTint: c(a.grading.shadowTint, b.grading.shadowTint),
    highlightTint: c(a.grading.highlightTint, b.grading.highlightTint),
    splitStrength: n(a.grading.splitStrength, b.grading.splitStrength),
    vignetteDarkness: n(a.grading.vignetteDarkness, b.grading.vignetteDarkness),
    vignetteOffset: n(a.grading.vignetteOffset, b.grading.vignetteOffset),
    bloomIntensity: n(a.grading.bloomIntensity, b.grading.bloomIntensity),
    bloomThreshold: n(a.grading.bloomThreshold, b.grading.bloomThreshold),
    tiltShiftBlur: n(a.grading.tiltShiftBlur, b.grading.tiltShiftBlur),
  };
  const light = (x: LightingPreset["sun"], y: LightingPreset["sun"]) => ({
    color: c(x.color, y.color),
    intensity: n(x.intensity, y.intensity),
    azimuth: n(x.azimuth, y.azimuth),
    elevation: n(x.elevation, y.elevation),
  });
  return {
    id: late ? b.id : a.id,
    label: late ? b.label : a.label,
    sky: {
      zenith: c(a.sky.zenith, b.sky.zenith),
      mid: c(a.sky.mid, b.sky.mid),
      horizon: c(a.sky.horizon, b.sky.horizon),
      below: c(a.sky.below, b.sky.below),
    },
    sun: light(a.sun, b.sun),
    fill: light(a.fill, b.fill),
    hemisphere: {
      sky: c(a.hemisphere.sky, b.hemisphere.sky),
      ground: c(a.hemisphere.ground, b.hemisphere.ground),
      intensity: n(a.hemisphere.intensity, b.hemisphere.intensity),
    },
    fog: { color: c(a.fog.color, b.fog.color), near: n(a.fog.near, b.fog.near), far: n(a.fog.far, b.fog.far) },
    mist: {
      color: c(a.mist.color, b.mist.color),
      density: n(a.mist.density, b.mist.density),
      height: n(a.mist.height, b.mist.height),
      speed: n(a.mist.speed, b.mist.speed),
      fogOfWar: n(a.mist.fogOfWar ?? 1, b.mist.fogOfWar ?? 1),
    },
    particles: late ? { ...b.particles, rate: b.particles.rate * (u - 0.5) * 2 + 0.001 } : { ...a.particles, rate: a.particles.rate * (1 - u * 2) + 0.001 },
    fires: { color: c(a.fires.color, b.fires.color), intensity: n(a.fires.intensity, b.fires.intensity) },
    waterGlow: n(a.waterGlow, b.waterGlow),
    cliffFade: c(a.cliffFade, b.cliffFade),
    exposure: n(a.exposure, b.exposure),
    toneMapping: late ? b.toneMapping : a.toneMapping,
    grading,
  };
}
