import { BlendFunction, Effect } from "postprocessing";
import * as THREE from "three";

/**
 * Final colour grade, run after tone mapping: saturation, contrast, soft-light
 * split toning (cool shadows / warm highlights) and an elliptical vignette.
 * All values come from the active lighting preset's `grading`.
 */
const fragmentShader = /* glsl */ `
uniform float saturation;
uniform float contrast;
uniform float brightness;
uniform vec3 shadowTint;
uniform vec3 highlightTint;
uniform float splitStrength;
uniform float vignetteDarkness;
uniform float vignetteOffset;

vec3 softLight(vec3 a, vec3 b) {
  return mix(2.0 * a * b + a * a * (1.0 - 2.0 * b), sqrt(a) * (2.0 * b - 1.0) + 2.0 * a * (1.0 - b), step(0.5, b));
}

void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
  // Grade in a gamma-ish space so controls behave perceptually.
  vec3 g = pow(max(inputColor.rgb, 0.0), vec3(1.0 / 2.2));
  float l = dot(g, vec3(0.2126, 0.7152, 0.0722));
  g = mix(vec3(l), g, 1.0 + saturation);
  g = (g - 0.5) * (1.0 + contrast) + 0.5 + brightness;
  g = clamp(g, 0.0, 1.0);

  vec3 sT = pow(shadowTint, vec3(1.0 / 2.2));
  vec3 hT = pow(highlightTint, vec3(1.0 / 2.2));
  vec3 tint = mix(sT, hT, smoothstep(0.1, 0.8, l));
  g = mix(g, softLight(g, tint), splitStrength);

  vec2 d = (uv - 0.5) * vec2(1.0, 0.82);
  float v = smoothstep(vignetteOffset, vignetteOffset + 0.55, length(d) * 1.4);
  g *= 1.0 - vignetteDarkness * v;

  outputColor = vec4(pow(g, vec3(2.2)), inputColor.a);
}
`;

export interface GradeOptions {
  saturation: number;
  contrast: number;
  brightness: number;
  shadowTint: string;
  highlightTint: string;
  splitStrength: number;
  vignetteDarkness: number;
  vignetteOffset: number;
}

export class GradeEffect extends Effect {
  constructor(options: GradeOptions) {
    super("GradeEffect", fragmentShader, {
      blendFunction: BlendFunction.NORMAL,
      uniforms: new Map<string, THREE.Uniform>([
        ["saturation", new THREE.Uniform(options.saturation)],
        ["contrast", new THREE.Uniform(options.contrast)],
        ["brightness", new THREE.Uniform(options.brightness)],
        ["shadowTint", new THREE.Uniform(new THREE.Color(options.shadowTint))],
        ["highlightTint", new THREE.Uniform(new THREE.Color(options.highlightTint))],
        ["splitStrength", new THREE.Uniform(options.splitStrength)],
        ["vignetteDarkness", new THREE.Uniform(options.vignetteDarkness)],
        ["vignetteOffset", new THREE.Uniform(options.vignetteOffset)],
      ]),
    });
  }

  setGrade(options: GradeOptions) {
    const u = this.uniforms;
    u.get("saturation")!.value = options.saturation;
    u.get("contrast")!.value = options.contrast;
    u.get("brightness")!.value = options.brightness;
    (u.get("shadowTint")!.value as THREE.Color).set(options.shadowTint);
    (u.get("highlightTint")!.value as THREE.Color).set(options.highlightTint);
    u.get("splitStrength")!.value = options.splitStrength;
    u.get("vignetteDarkness")!.value = options.vignetteDarkness;
    u.get("vignetteOffset")!.value = options.vignetteOffset;
  }
}
