import type * as THREE from "three";

/**
 * Scene-wide uniforms shared by several materials (one diorama at a time):
 * - fog of war: the mist grid texture (B = fog amount per texel) so terrain
 *   under unseen hexes desaturates;
 * - weather: wetness (darker, glossier terrain; ripples on water).
 * Written by GroundMist / AtmosphereTicker, read in shaders.
 */
export const FOG_UNIFORMS = {
  uFogGrid: { value: null as THREE.Texture | null },
  uFogExtent: { value: 1 },
  uFogStrength: { value: 0 },
};

export const SURFACE_UNIFORMS = {
  uWet: { value: 0 },
};
