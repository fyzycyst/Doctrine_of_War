import * as THREE from "three";
import { BACKDROP_GLSL, BACKDROP_UNIFORMS } from "./shaders/backdrop";
import type { MaterialStyle } from "./skins/types";

/**
 * Shared material factories. Shader tweaks are injected with onBeforeCompile so
 * everything keeps three's lighting, shadows and fog.
 */

export interface DepthFadeUniforms {
  uFadeColor: { value: THREE.Color };
  uFadeTop: { value: number };
  uFadeBottom: { value: number };
}

/**
 * Island material: vertex-coloured, flat shaded, and fading toward `uFadeColor`
 * with depth so the cliff roots dissolve into the sky below the island.
 */
export function createIslandMaterial(style: MaterialStyle): THREE.Material & { userData: { fade: DepthFadeUniforms } } {
  const fade: DepthFadeUniforms = {
    uFadeColor: { value: new THREE.Color("#3a2530") },
    uFadeTop: { value: -0.3 },
    uFadeBottom: { value: -3.2 },
  };
  const material =
    style.shading === "toon"
      ? new THREE.MeshToonMaterial({ vertexColors: true })
      : new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: style.roughness, metalness: 0 });

  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, fade, BACKDROP_UNIFORMS);
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nvarying float vWorldY;")
      .replace(
        "#include <worldpos_vertex>",
        "#include <worldpos_vertex>\nvWorldY = (modelMatrix * vec4(transformed, 1.0)).y;",
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>\nvarying float vWorldY;\nuniform vec3 uFadeColor;\nuniform float uFadeTop;\nuniform float uFadeBottom;\n${BACKDROP_GLSL}`,
      )
      .replace(
        "#include <opaque_fragment>",
        `float depthFade = smoothstep(uFadeTop, uFadeBottom, vWorldY);
// Dissolve into the backdrop pixel behind us (lightly tinted by the skin).
vec3 fadeTarget = mix(backdropColor(gl_FragCoord.xy), uFadeColor, 0.15);
outgoingLight = mix(outgoingLight, fadeTarget, depthFade * depthFade * (3.0 - 2.0 * depthFade));
#include <opaque_fragment>`,
      );
  };
  material.customProgramCacheKey = () => `island-${style.shading}`;
  material.userData.fade = fade;
  return material as unknown as THREE.Material & { userData: { fade: DepthFadeUniforms } };
}

export interface RimUniforms {
  uRimColor: { value: THREE.Color };
  uRimStrength: { value: number };
}

/**
 * Adds a fresnel rim light so small figures pop off the terrain. The rim colour
 * is the faction glow; it is added after lighting, so it reads even in shadow.
 */
export function addRimLight<M extends THREE.Material>(material: M, rimColor: string, strength: number, cacheKey: string): M {
  const rim: RimUniforms = {
    uRimColor: { value: new THREE.Color(rimColor) },
    uRimStrength: { value: strength },
  };
  const previous = material.onBeforeCompile;
  material.onBeforeCompile = (shader, renderer) => {
    previous?.call(material, shader, renderer);
    Object.assign(shader.uniforms, rim);
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", "#include <common>\nuniform vec3 uRimColor;\nuniform float uRimStrength;")
      .replace(
        "#include <opaque_fragment>",
        `{
  vec3 viewDir = normalize(vViewPosition);
  float fres = pow(1.0 - clamp(dot(normalize(normal), viewDir), 0.0, 1.0), 2.5);
  outgoingLight += uRimColor * fres * uRimStrength;
}
#include <opaque_fragment>`,
      );
  };
  material.customProgramCacheKey = () => `rim-${cacheKey}`;
  material.userData.rim = rim;
  return material;
}

/**
 * Inverted-hull ink outline (used when a skin sets `material.outline`). Cheap
 * and good enough to prove the skin flag; not art-directed.
 */
export function createOutlineMaterial(colorHex: string, thickness = 0.012): THREE.Material {
  const material = new THREE.MeshBasicMaterial({ color: colorHex, side: THREE.BackSide });
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader.replace(
      "#include <begin_vertex>",
      `#include <begin_vertex>\ntransformed += normalize(normal) * ${thickness.toFixed(4)};`,
    );
  };
  material.customProgramCacheKey = () => `outline-${thickness}`;
  return material;
}
