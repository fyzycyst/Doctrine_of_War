import { useFrame } from "@react-three/fiber";
import { useMemo } from "react";
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { useLook } from "../look/LookContext";
import { NOISE_GLSL } from "../shaders/noise";
import type { IslandBuild } from "./buildIsland";

/**
 * Ford water with an animated sheen that flows toward the waterfall, and the
 * waterfall itself spilling off the island edge. At night the preset's
 * `waterGlow` turns the river into burning oil (the Ember Ford key light).
 */
export function Water({ island }: { island: IslandBuild }) {
  const { skin, preset } = useLook();

  const geometry = useMemo(() => {
    if (island.water.length === 0) return null;
    const parts = island.water.map((w) => {
      const g = new THREE.CircleGeometry(1.0, 6);
      g.rotateX(-Math.PI / 2);
      g.translate(w.x, w.level, w.z);
      return g;
    });
    return mergeGeometries(parts);
  }, [island]);

  const flow = useMemo(() => {
    const f = island.waterfall;
    return f ? new THREE.Vector2(f.dirX, f.dirZ) : new THREE.Vector2(-1, 0);
  }, [island]);

  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        fog: true,
        uniforms: THREE.UniformsUtils.merge([
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
        vertexShader: /* glsl */ `
          #include <fog_pars_vertex>
          varying vec2 vPos;
          varying vec3 vWorld;
          void main() {
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
          uniform float uTime, uGlow;
          uniform vec3 uColor, uDeep, uSky, uSheen, uGlowColor;
          uniform vec2 uFlow;
          varying vec2 vPos;
          varying vec3 vWorld;
          ${NOISE_GLSL}
          void main() {
            vec2 perp = vec2(-uFlow.y, uFlow.x);
            vec2 p = vPos;
            float along = dot(p, uFlow);
            float across = dot(p, perp);
            float n = fbm(vec2(along * 1.4 - uTime * 0.35, across * 2.2));
            float n2 = fbm(vec2(along * 3.0 - uTime * 0.8, across * 5.0) + 7.0);
            vec3 col = mix(uDeep, uColor, 0.15 + 0.7 * n);
            // Fresnel sky reflection.
            vec3 viewDir = normalize(cameraPosition - vWorld);
            float fres = pow(1.0 - max(viewDir.y, 0.0), 3.0);
            col = mix(col, uSky, fres * 0.12);
            // Moving sheen streaks.
            float streak = smoothstep(0.62, 0.9, n2) * (0.6 + 0.4 * sin(across * 14.0 + n * 6.0));
            col += uSheen * streak * 0.12;
            // Burning river (night fires preset).
            float flick = 0.65 + 0.35 * sin(uTime * 3.1 + n * 9.0) * sin(uTime * 1.7 + n2 * 5.0);
            // Patches of burning oil rather than a uniform sheet (keeps it orange, not white).
            float patches = smoothstep(0.45, 0.75, fbm(vec2(along * 2.0 - uTime * 0.25, across * 3.0) + 3.0));
            col = mix(col, col * 0.35, clamp(uGlow, 0.0, 1.0));
            col += uGlowColor * uGlow * flick * (patches * 0.55 + pow(patches, 4.0) * 0.6);
            gl_FragColor = vec4(col, 1.0);
            #include <tonemapping_fragment>
            #include <colorspace_fragment>
            #include <fog_fragment>
          }
        `,
      }),
    [],
  );

  const fall = useMemo(
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
          uniform float uTime, uGlow;
          uniform vec3 uColor, uFoam, uGlowColor;
          varying vec2 vUv;
          ${NOISE_GLSL}
          void main() {
            float t = 1.0 - vUv.y;
            float n = fbm(vec2(vUv.x * 9.0, vUv.y * 3.0 + uTime * 1.6));
            float streaks = smoothstep(0.45, 0.8, fbm(vec2(vUv.x * 22.0, vUv.y * 1.5 + uTime * 2.2)));
            vec3 col = mix(uColor, uFoam, streaks * 0.8 + smoothstep(0.08, 0.0, t) * 0.8);
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
    u.uSky.value.set(preset.sky.mid).lerp(new THREE.Color(preset.sky.horizon), 0.35);
    u.uSheen.value.set(preset.sun.color).multiplyScalar(Math.min(1, preset.sun.intensity / 3.5));
    // Deeper red-orange than the flames: ACES turns bright orange peach.
    u.uGlowColor.value.set(preset.fires.color).lerp(new THREE.Color("#ff2a05"), 0.5);
    u.uGlow.value = preset.waterGlow;
    u.uFlow.value.copy(flow);
    fall.uniforms.uColor.value.set(skin.island.water);
    fall.uniforms.uFoam.value.set("#e8eef0").lerp(new THREE.Color(preset.sky.horizon), 0.35);
    fall.uniforms.uGlowColor.value.set(preset.fires.color);
    fall.uniforms.uGlow.value = preset.waterGlow;
  }, [material, fall, skin, preset, flow]);

  useFrame((_, dt) => {
    material.uniforms.uTime.value += dt;
    fall.uniforms.uTime.value += dt;
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
