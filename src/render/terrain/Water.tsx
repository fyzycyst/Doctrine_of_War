import { useFrame } from "@react-three/fiber";
import { useMemo } from "react";
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { useLook } from "../look/LookContext";
import { NOISE_GLSL } from "../shaders/noise";
import { SURFACE_UNIFORMS } from "../shaders/surface";
import type { IslandBuild } from "./buildIsland";
import { useDisposable } from "../dispose";

/**
 * Ford water with an animated sheen that flows toward the waterfall, and the
 * waterfall itself spilling off the island edge. At night the preset's
 * `waterGlow` turns the river into burning oil (the Ember Ford key light).
 */
export function Water({ island }: { island: IslandBuild }) {
  const { skin, preset, motion } = useLook();

  const geometry = useDisposable(() => {
    if (island.water.length === 0) return null;
    const parts = island.water.map((w) => {
      // Full hexes for fords/rivers; small round pools for marsh.
      const g = w.radius ? new THREE.CircleGeometry(w.radius, 10) : new THREE.CircleGeometry(1.0, 6);
      g.rotateX(-Math.PI / 2);
      g.translate(w.x, w.level, w.z);
      g.setAttribute("aDeep", new THREE.Float32BufferAttribute(new Array(g.getAttribute("position").count).fill(w.deep), 1));
      return g;
    });
    return mergeGeometries(parts);
  }, [island]);

  const flow = useMemo(() => {
    return new THREE.Vector2(island.flow[0], island.flow[1]);
  }, [island]);

  const material = useDisposable(
    () =>
      new THREE.ShaderMaterial({
        fog: true,
        uniforms: {
          ...THREE.UniformsUtils.merge([
          THREE.UniformsLib.fog,
          {
            uTime: { value: 0 },
            uColor: { value: new THREE.Color() },
            uDeep: { value: new THREE.Color() },
            uSky: { value: new THREE.Color() },
            uSheen: { value: new THREE.Color() },
            uGlowColor: { value: new THREE.Color() },
            uGlow: { value: 0 },
            uFlow: { value: new THREE.Vector2(-1, 0) },
          },
          ]),
          // Shared (not cloned), so weather wetness reaches the ripples.
          uWet: SURFACE_UNIFORMS.uWet,
        },
        vertexShader: /* glsl */ `
          #include <fog_pars_vertex>
          attribute float aDeep;
          varying vec2 vPos;
          varying vec3 vWorld;
          varying float vDeep;
          void main() {
            vDeep = aDeep;
            vec4 world = modelMatrix * vec4(position, 1.0);
            vPos = world.xz;
            vWorld = world.xyz;
            vec4 mvPosition = viewMatrix * world;
            gl_Position = projectionMatrix * mvPosition;
            #include <fog_vertex>
          }
        `,
        fragmentShader: /* glsl */ `
          #include <common>
          #include <fog_pars_fragment>
          uniform float uTime, uGlow, uWet;
          uniform vec3 uColor, uDeep, uSky, uSheen, uGlowColor;
          uniform vec2 uFlow;
          varying vec2 vPos;
          varying vec3 vWorld;
          varying float vDeep;
          ${NOISE_GLSL}
          void main() {
            vec2 perp = vec2(-uFlow.y, uFlow.x);
            vec2 p = vPos;
            float along = dot(p, uFlow);
            float across = dot(p, perp);
            float n = fbm(vec2(along * 1.4 - uTime * 0.35, across * 2.2));
            float n2 = fbm(vec2(along * 3.0 - uTime * 0.8, across * 5.0) + 7.0);
            // Dark, deep water that mirrors the sky above it (look-lock #5).
            vec3 viewDir = normalize(cameraPosition - vWorld);
            float fres = pow(1.0 - max(viewDir.y, 0.0), 2.0);
            // Deep river channels run darker than the shallow fords.
            vec3 base = mix(uDeep, uColor, (0.1 + 0.35 * n) * (1.0 - 0.7 * vDeep));
            vec3 col = mix(base, uSky, 0.35 + 0.45 * fres);
            col *= 0.85 + 0.3 * n2;
            // Long thin glints running with the current.
            float lines = smoothstep(0.72, 0.95, fbm(vec2(along * 0.9 - uTime * 0.45, across * 16.0)));
            col += uSheen * lines * 0.35;
            // Fire reflections as streaks (night fires), not blotches.
            float flick = 0.65 + 0.35 * sin(uTime * 3.1 + n * 9.0) * sin(uTime * 1.7 + n2 * 5.0);
            float fire = smoothstep(0.6, 0.9, fbm(vec2(along * 1.2 - uTime * 0.3, across * 11.0) + 3.0));
            col = mix(col, col * 0.45, clamp(uGlow, 0.0, 1.0));
            col += uGlowColor * uGlow * flick * fire * 0.9;
            // Rain: expanding ripple rings, large and sparse enough to read
            // at the wide shot. Each cell fires on a random cycle (about half
            // sit out), with a bright crest, a faint trailing ring and a
            // darker trough just inside.
            if (uWet > 0.01) {
              for (int k = 0; k < 2; k++) {
                vec2 q = vPos * (2.1 + float(k) * 0.9) + float(k) * 13.1;
                vec2 cell = floor(q);
                vec2 f = fract(q);
                float rate = 0.55 + 0.25 * hash12(cell + 5.7);
                float tt = uTime * rate + hash12(cell + 3.1);
                float ph = fract(tt);
                float live = step(0.5, hash12(cell + floor(tt) * 1.37));
                vec2 c = vec2(hash12(cell + floor(tt)), hash12(cell + 7.3 + floor(tt))) * 0.5 + 0.25;
                float d = length(f - c);
                float r = ph * 0.45;
                float w = 0.03 + 0.02 * ph;
                float crest = smoothstep(w, 0.0, abs(d - r));
                float trail = smoothstep(w, 0.0, abs(d - r * 0.6)) * 0.25;
                float trough = smoothstep(w * 1.6, 0.0, abs(d - r + w * 1.4));
                float fade = (1.0 - ph) * (1.0 - ph) * live * uWet;
                col += vec3(0.6, 0.65, 0.72) * (crest + trail) * fade * 0.7;
                col *= 1.0 - trough * fade * 0.25;
              }
            }
            gl_FragColor = vec4(col, 1.0);
            #include <tonemapping_fragment>
            #include <colorspace_fragment>
            #include <fog_fragment>
          }
        `,
      }),
    [],
  );

  const fall = useDisposable(
    () =>
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        uniforms: {
          uTime: { value: 0 },
          uColor: { value: new THREE.Color() },
          uFoam: { value: new THREE.Color() },
          uGlowColor: { value: new THREE.Color() },
          uGlow: { value: 0 },
          uLight: { value: 1 },
        },
        vertexShader: /* glsl */ `
          varying vec2 vUv;
          void main() {
            vUv = uv;
            vec3 p = position;
            float t = 1.0 - uv.y;
            // Arc outward as it falls (plane faces +z = outward).
            p.z += t * t * 0.9 + t * 0.12;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
          }
        `,
        fragmentShader: /* glsl */ `
          uniform float uTime, uGlow, uLight;
          uniform vec3 uColor, uFoam, uGlowColor;
          varying vec2 vUv;
          ${NOISE_GLSL}
          void main() {
            float t = 1.0 - vUv.y;
            float n = fbm(vec2(vUv.x * 9.0, vUv.y * 3.0 + uTime * 1.6));
            float streaks = smoothstep(0.45, 0.8, fbm(vec2(vUv.x * 22.0, vUv.y * 1.5 + uTime * 2.2)));
            // Unlit shader: scale by the scene's light level so night falls stay dark.
            vec3 col = mix(uColor, uFoam, streaks * 0.8 + smoothstep(0.08, 0.0, t) * 0.8) * uLight;
            col += uGlowColor * uGlow * 0.6 * n;
            float edge = smoothstep(0.0, 0.18, vUv.x) * smoothstep(1.0, 0.82, vUv.x);
            float alpha = edge * (1.0 - smoothstep(0.35, 1.0, t)) * (0.55 + 0.45 * n);
            gl_FragColor = vec4(col, alpha);
            #include <tonemapping_fragment>
            #include <colorspace_fragment>
          }
        `,
      }),
    [],
  );

  useMemo(() => {
    const u = material.uniforms;
    u.uColor.value.set(skin.island.water);
    u.uDeep.value.set(skin.island.waterDeep);
    // Reflect the upper sky (zenith → mid): dark at dusk and night.
    u.uSky.value.set(preset.sky.zenith).lerp(new THREE.Color(preset.sky.mid), 0.6);
    u.uSheen.value.set(preset.sun.color).multiplyScalar(Math.min(1, preset.sun.intensity / 3.5));
    // Deeper red-orange than the flames: ACES turns bright orange peach.
    u.uGlowColor.value.set(preset.fires.color).lerp(new THREE.Color("#ff2a05"), 0.5);
    u.uGlow.value = preset.waterGlow;
    u.uFlow.value.copy(flow);
    fall.uniforms.uColor.value.set(skin.island.water);
    // Foam follows the light level so the fall doesn't glow white at night.
    fall.uniforms.uFoam.value
      .set("#e8eef0")
      .lerp(new THREE.Color(preset.sky.horizon), 0.35)
      .multiplyScalar(preset.fires.intensity > 0 ? 0.18 : THREE.MathUtils.clamp(preset.sun.intensity / 3.5, 0.2, 1));
    fall.uniforms.uLight.value = preset.fires.intensity > 0 ? 0.3 : THREE.MathUtils.clamp(preset.sun.intensity / 3.5, 0.3, 1);
    fall.uniforms.uGlowColor.value.set(preset.fires.color);
    fall.uniforms.uGlow.value = preset.waterGlow;
  }, [material, fall, skin, preset, flow]);

  useFrame((_, dt) => {
    // Reduced motion calms the shimmer and the fall.
    material.uniforms.uTime.value += dt * motion;
    fall.uniforms.uTime.value += dt * motion;
  });

  const wf = island.waterfall;
  return (
    <>
      {geometry && <mesh geometry={geometry} material={material} receiveShadow />}
      {wf && (
        <mesh
          material={fall}
          position={[wf.x, wf.level - 1.6, wf.z]}
          rotation={[0, Math.atan2(wf.dirX, wf.dirZ), 0]}
          renderOrder={2}
        >
          <planeGeometry args={[wf.width, 3.2, 8, 16]} />
        </mesh>
      )}
    </>
  );
}
