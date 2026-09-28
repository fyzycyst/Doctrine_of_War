import { useFrame, useThree } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import { mulberry32 } from "../hexWorld";
import { useLook } from "../look/LookContext";
import type { Anchor, IslandBuild } from "../terrain/buildIsland";

/**
 * Fires by anchor kind: burning bridge wreckage (the Ember Ford key lights,
 * with smoke columns and rising embers), Host braziers, campfires and gate
 * torches. They burn when the lighting preset has fires (night fires, predawn).
 *
 * Lights stay mounted at all times and only change intensity, so switching
 * presets never forces a shader recompile. Point lights are budgeted
 * (MAX_LIGHTS, bridges first); the rest are flame-only.
 */

const MAX_LIGHTS = 6;
const PRIORITY: Record<NonNullable<Anchor["kind"]>, number> = { bridge: 0, brazier: 1, campfire: 2, torch: 3 };
const LIGHT: Record<NonNullable<Anchor["kind"]>, { intensity: number; distance: number; height: number }> = {
  bridge: { intensity: 2.2, distance: 4.2, height: 0.35 },
  brazier: { intensity: 0.9, distance: 2.4, height: 0.15 },
  campfire: { intensity: 0.8, distance: 3.2, height: 0.18 },
  torch: { intensity: 0.45, distance: 3.2, height: 0.18 },
};
const FLAMES: Record<NonNullable<Anchor["kind"]>, Array<[number, number, number, number, number]>> = {
  // [dx, dz, radius, height, phase]
  bridge: [
    [0, 0, 0.07, 0.3, 0],
    [0.08, 0.05, 0.05, 0.22, 1.3],
    [-0.07, -0.04, 0.055, 0.25, 2.1],
    [0.02, -0.09, 0.04, 0.18, 3.7],
  ],
  brazier: [
    [0, 0, 0.04, 0.12, 0],
    [0.02, 0.02, 0.028, 0.09, 1.7],
  ],
  campfire: [[0, 0, 0.045, 0.14, 0]],
  torch: [[0, 0, 0.03, 0.1, 0]],
};

export function Fires({ island }: { island: IslandBuild }) {
  const { preset, quality } = useLook();
  const lights = useRef<Array<THREE.PointLight | null>>([]);
  const flames = useRef<Array<THREE.Group | null>>([]);
  const riverLight = useRef<THREE.PointLight>(null);
  const on = preset.fires.intensity;

  const anchors = useMemo(
    () => island.fireAnchors.map((a, i) => ({ ...a, kind: a.kind ?? "campfire", index: i })),
    [island],
  );
  const lit = useMemo(() => {
    const ranked = [...anchors].sort((a, b) => PRIORITY[a.kind] - PRIORITY[b.kind]);
    return new Set(ranked.slice(0, MAX_LIGHTS).map((a) => a.index));
  }, [anchors]);

  const flameMaterial = useMemo(
    () => new THREE.MeshBasicMaterial({ color: new THREE.Color(preset.fires.color).multiplyScalar(6), toneMapped: true }),
    [preset.fires.color],
  );
  const coreMaterial = useMemo(() => new THREE.MeshBasicMaterial({ color: new THREE.Color("#ffd28a").multiplyScalar(8) }), []);

  const river = useMemo(() => {
    if (island.water.length === 0) return null;
    const x = island.water.reduce((s, w) => s + w.x, 0) / island.water.length;
    const z = island.water.reduce((s, w) => s + w.z, 0) / island.water.length;
    return new THREE.Vector3(x, island.waterLevel + 0.6, z);
  }, [island]);

  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    anchors.forEach((a) => {
      const i = a.index;
      const flick = 0.72 + 0.28 * Math.sin(t * 9 + i * 3.1) * Math.sin(t * 5.3 + i) + 0.08 * Math.sin(t * 23 + i);
      const light = lights.current[i];
      if (light) light.intensity = on * flick * LIGHT[a.kind].intensity;
      const group = flames.current[i];
      if (group) {
        group.children.forEach((flame, k) => {
          const f = 0.75 + 0.35 * Math.sin(t * (8 + k * 2.3) + i + k * 1.7);
          flame.scale.set(1, f, 1);
        });
      }
    });
    if (riverLight.current) {
      riverLight.current.intensity = preset.waterGlow * 6 * (0.8 + 0.2 * Math.sin(t * 2.3));
    }
  });

  const bridges = anchors.filter((a) => a.kind === "bridge");
  return (
    <>
      {anchors.map((a) => (
        <group key={a.index} position={[a.x, a.y, a.z]}>
          {lit.has(a.index) && (
            <pointLight
              ref={(el) => {
                lights.current[a.index] = el;
              }}
              color={preset.fires.color}
              intensity={0}
              distance={LIGHT[a.kind].distance}
              decay={1.6}
              position={[0, LIGHT[a.kind].height, 0]}
            />
          )}
          {on > 0 && (
            <group
              ref={(el) => {
                flames.current[a.index] = el;
              }}
            >
              {FLAMES[a.kind].map(([dx, dz, r, h], k) => (
                <group key={k} position={[dx, 0, dz]}>
                  <mesh material={flameMaterial} position={[0, h / 2, 0]}>
                    <coneGeometry args={[r, h, 5]} />
                  </mesh>
                  <mesh material={coreMaterial} position={[0, h * 0.3, 0]}>
                    <coneGeometry args={[r * 0.45, h * 0.5, 5]} />
                  </mesh>
                </group>
              ))}
            </group>
          )}
        </group>
      ))}
      {on > 0 && bridges.length > 0 && <SmokeAndEmbers sources={bridges} quality={quality} />}
      {river && (
        <pointLight ref={riverLight} position={river} color={preset.fires.color} intensity={0} distance={5} decay={1.4} />
      )}
    </>
  );
}

/** Rising smoke columns (normal blend) and sparks (additive) from each source. */
function SmokeAndEmbers({ sources, quality }: { sources: Anchor[]; quality: "high" | "low" }) {
  const dpr = useThree((s) => s.viewport.dpr);
  const perSource = quality === "high" ? 70 : 28;
  const geometry = useMemo(() => {
    const n = sources.length * perSource;
    const rand = mulberry32(777);
    const seed = new Float32Array(n * 4);
    const origin = new Float32Array(n * 3);
    for (let i = 0; i < n; i += 1) {
      const src = sources[Math.floor(i / perSource)];
      origin.set([src.x, src.y, src.z], i * 3);
      seed.set([rand(), rand(), rand(), rand()], i * 4);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(origin, 3));
    g.setAttribute("aSeed", new THREE.Float32BufferAttribute(seed, 4));
    g.computeBoundingSphere();
    g.boundingSphere!.radius += 4;
    return g;
  }, [sources, perSource]);

  const make = (spark: boolean) =>
    new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: spark ? THREE.AdditiveBlending : THREE.NormalBlending,
      uniforms: { uTime: { value: 0 }, uPixel: { value: dpr } },
      vertexShader: /* glsl */ `
        attribute vec4 aSeed;
        uniform float uTime, uPixel;
        varying float vA;
        varying float vK;
        void main() {
          float life = ${spark ? "1.6 + aSeed.x * 1.4" : "4.0 + aSeed.x * 3.0"};
          float t = mod(uTime + aSeed.y * life, life);
          float k = t / life;
          vec3 p = position;
          // Rise, drift east with the wind, and curl.
          p.y += t * ${spark ? "0.55" : "0.28"} + k * k * 0.4;
          p.x += t * t * 0.03 + sin(t * 1.7 + aSeed.z * 20.0) * ${spark ? "0.12" : "0.06"} * (0.3 + k);
          p.z += cos(t * 1.3 + aSeed.w * 20.0) * ${spark ? "0.12" : "0.08"} * (0.3 + k);
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_Position = projectionMatrix * mv;
          vK = k;
          vA = smoothstep(0.0, 0.12, k) * (1.0 - smoothstep(0.55, 1.0, k));
          float size = ${spark ? "0.5 + aSeed.z * 0.6" : "2.0 + k * 7.0"};
          gl_PointSize = size * 26.0 * uPixel / -mv.z;
        }
      `,
      fragmentShader: /* glsl */ `
        varying float vA;
        varying float vK;
        void main() {
          float d = length(gl_PointCoord - 0.5);
          float a = smoothstep(0.5, 0.0, d);
          ${
            spark
              ? "gl_FragColor = vec4(vec3(1.0, 0.5, 0.18) * 4.0 * a * vA, 1.0);"
              : "vec3 c = mix(vec3(0.35, 0.18, 0.1), vec3(0.08, 0.075, 0.08), smoothstep(0.0, 0.35, vK)); gl_FragColor = vec4(c, a * vA * 0.32);"
          }
        }
      `,
    });
  const smoke = useMemo(() => make(false), [dpr]); // eslint-disable-line react-hooks/exhaustive-deps
  const sparks = useMemo(() => make(true), [dpr]); // eslint-disable-line react-hooks/exhaustive-deps

  useFrame((_, dt) => {
    smoke.uniforms.uTime.value += dt;
    sparks.uniforms.uTime.value += dt;
  });
  return (
    <>
      <points geometry={geometry} material={smoke} renderOrder={4} />
      <points geometry={geometry} material={sparks} renderOrder={6} />
    </>
  );
}
