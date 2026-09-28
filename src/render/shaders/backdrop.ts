import * as THREE from "three";
import type { LightingPreset } from "../skins/types";

/**
 * The diorama backdrop is a screen-space gradient (zenith at the top of the
 * frame, glowing horizon at the bottom, warm bloom on the sun's side), as in
 * the mood-board sketch. The island's cliff roots fade into *the same* colour
 * at the same pixel, so they dissolve seamlessly into the sky without alpha.
 *
 * One shared uniform set: SkyDome updates it; any material may read it.
 */
export const BACKDROP_UNIFORMS = {
  uBgZenith: { value: new THREE.Color("#191a2c") },
  uBgMid: { value: new THREE.Color("#472c3c") },
  uBgHorizon: { value: new THREE.Color("#c77347") },
  uBgSun: { value: new THREE.Color("#ffb766") },
  uBgSunX: { value: -1 },
  uBgResolution: { value: new THREE.Vector2(1, 1) },
};

export const BACKDROP_GLSL = /* glsl */ `
uniform vec3 uBgZenith;
uniform vec3 uBgMid;
uniform vec3 uBgHorizon;
uniform vec3 uBgSun;
uniform float uBgSunX;
uniform vec2 uBgResolution;
vec3 backdropColor(vec2 fragCoord) {
  vec2 s = fragCoord / uBgResolution;
  vec3 col = mix(uBgHorizon, uBgMid, smoothstep(0.0, 0.55, s.y));
  col = mix(col, uBgZenith, smoothstep(0.45, 1.0, s.y));
  float side = uBgSunX >= 0.0 ? s.x : 1.0 - s.x;
  col += uBgSun * pow(side, 2.0) * (1.0 - smoothstep(0.0, 0.7, s.y)) * abs(uBgSunX) * 0.35;
  return col;
}
`;

export function applyBackdrop(preset: LightingPreset, sunDir: THREE.Vector3) {
  const u = BACKDROP_UNIFORMS;
  u.uBgZenith.value.set(preset.sky.zenith);
  u.uBgMid.value.set(preset.sky.mid);
  u.uBgHorizon.value.set(preset.sky.horizon);
  u.uBgSun.value.set(preset.sun.color);
  u.uBgSunX.value = sunDir.x;
}
