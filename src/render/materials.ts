import * as THREE from "three";
import { BACKDROP_GLSL, BACKDROP_UNIFORMS } from "./shaders/backdrop";
import { FOG_UNIFORMS, SURFACE_UNIFORMS } from "./shaders/surface";
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
    uFadeTop: { value: -1.4 },
    uFadeBottom: { value: -6.8 },
  };
  const material =
    style.shading === "toon"
      ? new THREE.MeshToonMaterial({ vertexColors: true })
      : new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: style.roughness, metalness: 0 });

  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, fade, BACKDROP_UNIFORMS, FOG_UNIFORMS, SURFACE_UNIFORMS);
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nvarying float vWorldY;\nvarying vec2 vWorldXZ;")
      .replace(
        "#include <worldpos_vertex>",
        "#include <worldpos_vertex>\nvec4 wp = modelMatrix * vec4(transformed, 1.0);\nvWorldY = wp.y;\nvWorldXZ = wp.xz;",
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>\nvarying float vWorldY;\nvarying vec2 vWorldXZ;\nuniform vec3 uFadeColor;\nuniform float uFadeTop;\nuniform float uFadeBottom;\nuniform sampler2D uFogGrid;\nuniform float uFogExtent;\nuniform float uFogStrength;\nuniform float uWet;\n${BACKDROP_GLSL}`,
      )
      // Weather: wet ground is darker (and glossier, below).
      .replace("#include <color_fragment>", "#include <color_fragment>\ndiffuseColor.rgb *= 1.0 - 0.3 * uWet * step(-0.2, vWorldY);")
      .replace(
        "#include <roughnessmap_fragment>",
        "#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.3, 0.75 * uWet * step(-0.2, vWorldY));",
      )
      .replace(
        "#include <opaque_fragment>",
        `// Fog of war: terrain under unseen hexes is desaturated and dimmed.
if (uFogStrength > 0.0) {
  float fogv = texture2D(uFogGrid, vWorldXZ / (uFogExtent * 2.0) + 0.5).b;
  vec3 grey = vec3(dot(outgoingLight, vec3(0.2126, 0.7152, 0.0722)));
  outgoingLight = mix(outgoingLight, grey * 0.72, fogv * 0.6);
}
float depthFade = smoothstep(uFadeTop, uFadeBottom, vWorldY);
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

/**
 * Toy-soldier material: vertex colours, a tight fresnel rim in the faction glow,
 * emissive ember glints from the geometry's `glow` channel, and a per-instance
 * `aFade` (InstancedBufferAttribute, 0..1) that dithers figures out without any
 * transparency sorting — used by the fall and rout tweens.
 */
export function createFigureMaterial(opts: {
  shading: MaterialStyle["shading"];
  rimColor: string;
  rimStrength: number;
  glintColor: string;
  cacheKey: string;
  /** Last-known silhouette: near-black, no glints, cool rim. */
  ghost?: boolean;
}): THREE.Material {
  const material =
    opts.shading === "toon"
      ? new THREE.MeshToonMaterial({ vertexColors: true })
      : new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.55, metalness: 0.05 });
  const uniforms = {
    uRimColor: { value: new THREE.Color(opts.rimColor) },
    uRimStrength: { value: opts.rimStrength },
    uGlint: { value: new THREE.Color(opts.glintColor).multiplyScalar(opts.ghost ? 0 : 2) },
  };
  if (opts.ghost) {
    uniforms.uRimColor.value.set("#8a94a8");
    uniforms.uRimStrength.value = 0.35;
  }
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        `#include <common>
attribute float glow;
varying float vGlow;
varying float vFade;
#ifdef USE_INSTANCING
attribute float aFade;
#endif`,
      )
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
vGlow = glow;
#ifdef USE_INSTANCING
vFade = aFade;
#else
vFade = 1.0;
#endif`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
uniform vec3 uRimColor;
uniform float uRimStrength;
uniform vec3 uGlint;
varying float vGlow;
varying float vFade;`,
      )
      .replace(
        "#include <color_fragment>",
        opts.ghost
          ? "#include <color_fragment>\ndiffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.025, 0.025, 0.03), 0.9);"
          : "#include <color_fragment>",
      )
      .replace(
        "#include <clipping_planes_fragment>",
        `#include <clipping_planes_fragment>
if (vFade < 0.999) {
  float th = fract(sin(dot(floor(gl_FragCoord.xy), vec2(12.9898, 78.233))) * 43758.5453);
  if (vFade <= th) discard;
}`,
      )
      .replace(
        "#include <opaque_fragment>",
        `{
  vec3 viewDir = normalize(vViewPosition);
  float fres = pow(1.0 - clamp(dot(normalize(normal), viewDir), 0.0, 1.0), 3.5);
  outgoingLight += uRimColor * fres * uRimStrength;
  outgoingLight += uGlint * vGlow;
}
#include <opaque_fragment>`,
      );
  };
  material.customProgramCacheKey = () => `figure-${opts.cacheKey}${opts.ghost ? "-ghost" : ""}`;
  material.userData.figure = uniforms;
  return material;
}
