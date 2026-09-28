import { useFrame, useThree } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import { mulberry32 } from "../hexWorld";
import { useLook } from "../look/LookContext";

/**
 * GPU-animated weather particles (no per-frame CPU work):
 * - embers/ash: additive glowing motes drifting from the west (Host side) to the
 *   east, rising and swirling; HDR colour so bloom picks them up.
 * - rain: slanted streaks falling through the scene.
 */
export function Particles({ extent = 9 }: { extent?: number }) {
  const { preset, quality, atmosphere } = useLook();
  const { kind, rate } = preset.particles;
  const scale = quality === "high" ? 1 : 0.35;

  // Weather layers ride on top of the time-of-day particles and fade with
  // their weather weight, so a phase-to-phase shift cross-fades.
  const rainLayer = useMemo<Layer>(
    () => ({
      opacity: () => atmosphere.mix.rain,
      apply: (u) => {
        u.uColor.value.copy(atmosphere.mix.rainColor);
        u.uSpeed.value = atmosphere.mix.rainSpeed;
      },
    }),
    [atmosphere],
  );
  const ashLayer = useMemo<Layer>(
    () => ({
      opacity: () => atmosphere.mix.ash,
      apply: (u) => {
        u.uColor.value.copy(atmosphere.mix.ashColor);
        u.uSpeed.value = atmosphere.mix.ashSpeed;
        u.uSize.value = 1.9;
        u.uAsh.value = 1;
        u.uWind.value = 1;
      },
    }),
    [atmosphere],
  );

  return (
    <>
      {kind === "rain" ? (
        <Rain count={Math.round(1400 * rate * scale)} extent={extent} />
      ) : (
        <Embers count={Math.round(320 * rate * scale)} extent={extent} />
      )}
      <Rain count={Math.round(1400 * 2.6 * scale)} extent={extent} layer={rainLayer} />
      <Embers count={Math.round(320 * 3.2 * scale)} extent={extent} layer={ashLayer} />
    </>
  );
}

type Uniforms = Record<string, THREE.IUniform>;

/** A weather-driven particle layer: per-frame opacity plus uniform overrides. */
interface Layer {
  opacity: () => number;
  apply: (u: Uniforms) => void;
}

function seeds(count: number, salt: number) {
  const rand = mulberry32(salt);
  const arr = new Float32Array(count * 4);
  for (let i = 0; i < arr.length; i += 1) arr[i] = rand();
  return arr;
}

function Embers({ count, extent, layer }: { count: number; extent: number; layer?: Layer }) {
  const { preset, motion } = useLook();
  const dpr = useThree((state) => state.viewport.dpr);

  const geometry = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(new Float32Array(count * 3), 3));
    g.setAttribute("aSeed", new THREE.Float32BufferAttribute(seeds(count, 99), 4));
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), extent * 2);
    return g;
  }, [count, extent]);

  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        uniforms: {
          uTime: { value: 0 },
          uColor: { value: new THREE.Color() },
          uSpeed: { value: 1 },
          uSize: { value: 1 },
          uExtent: { value: extent },
          uPixel: { value: dpr },
          uAsh: { value: 0 },
          uWind: { value: 0 },
          uOpacity: { value: 1 },
        },
        vertexShader: /* glsl */ `
          attribute vec4 aSeed;
          uniform float uTime, uSpeed, uSize, uExtent, uPixel, uAsh, uWind;
          varying float vAlpha;
          varying float vHot;
          void main() {
            float life = 7.0 + aSeed.x * 7.0;
            float t = mod(uTime * uSpeed + aSeed.y * life, life);
            float k = t / life;
            // Spawn along the Host's (west) edge and drift east across the whole
            // board over one lifetime (look-lock #9).
            vec3 start = vec3(-uExtent * 1.05 + aSeed.z * uExtent * 0.35,
                              -0.2 + aSeed.w * 1.6,
                              (aSeed.y * 2.0 - 1.0) * uExtent * 0.8);
            float vx = (uExtent * 2.0) / life;
            vec3 pos = start + vec3(t * vx,
                                    t * 0.16 + sin(t * 1.3 + aSeed.x * 20.0) * 0.18,
                                    sin(t * 0.8 + aSeed.z * 10.0) * 0.45);
            // Ash-wind: gusty, tumbling flakes low over the board.
            pos += uWind * vec3(sin(t * 2.7 + aSeed.w * 30.0) * 0.35,
                                -t * 0.12 + sin(t * 3.1 + aSeed.x * 9.0) * 0.12,
                                sin(t * 1.9 + aSeed.y * 17.0) * 0.4);
            vec4 mv = modelViewMatrix * vec4(pos, 1.0);
            gl_Position = projectionMatrix * mv;
            float flicker = 0.55 + 0.45 * sin(uTime * (6.0 + aSeed.w * 8.0) + aSeed.x * 50.0);
            vAlpha = smoothstep(0.0, 0.08, k) * (1.0 - smoothstep(0.75, 1.0, k)) * flicker;
            vHot = step(0.35, aSeed.w) * (1.0 - uAsh) + uAsh * step(0.8, aSeed.w);
            float size = (0.6 + aSeed.z * 1.2) * uSize;
            gl_PointSize = size * 26.0 * uPixel / -mv.z;
          }
        `,
        fragmentShader: /* glsl */ `
          uniform vec3 uColor;
          uniform float uAsh, uWind, uOpacity;
          varying float vAlpha;
          varying float vHot;
          void main() {
            float d = length(gl_PointCoord - 0.5);
            float a = smoothstep(0.5, 0.0, d);
            vec3 ash = mix(vec3(0.35, 0.33, 0.32) * 0.6, uColor * 1.6, uWind);
            vec3 hot = uWind > 0.5 ? vec3(1.0, 0.45, 0.15) * 3.0 : uColor * 4.0;
            vec3 col = mix(ash, hot, vHot);
            gl_FragColor = vec4(col * a * vAlpha * uOpacity, 1.0);
          }
        `,
      }),
    [extent, dpr],
  );

  useMemo(() => {
    if (layer) return;
    const u = material.uniforms;
    u.uColor.value.set(preset.particles.color);
    u.uSpeed.value = preset.particles.speed;
    u.uSize.value = preset.particles.size;
    u.uAsh.value = preset.particles.kind === "ash" ? 1 : 0;
  }, [material, preset, layer]);

  const points = useRef<THREE.Points>(null);
  useFrame((_, dt) => {
    material.uniforms.uTime.value += dt * motion;
    if (layer) {
      const o = layer.opacity();
      material.uniforms.uOpacity.value = o;
      layer.apply(material.uniforms);
      if (points.current) points.current.visible = o > 0.002;
    }
  });

  return <points ref={points} geometry={geometry} material={material} renderOrder={5} />;
}

function Rain({ count, extent, layer }: { count: number; extent: number; layer?: Layer }) {
  const { preset, motion } = useLook();

  const geometry = useMemo(() => {
    const g = new THREE.BufferGeometry();
    const s = seeds(count, 7);
    const seed = new Float32Array(count * 2 * 4);
    const end = new Float32Array(count * 2);
    for (let i = 0; i < count; i += 1) {
      for (let v = 0; v < 2; v += 1) {
        seed.set(s.subarray(i * 4, i * 4 + 4), (i * 2 + v) * 4);
        end[i * 2 + v] = v;
      }
    }
    g.setAttribute("position", new THREE.Float32BufferAttribute(new Float32Array(count * 2 * 3), 3));
    g.setAttribute("aSeed", new THREE.Float32BufferAttribute(seed, 4));
    g.setAttribute("aEnd", new THREE.Float32BufferAttribute(end, 1));
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), extent * 2);
    return g;
  }, [count, extent]);

  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        uniforms: {
          uTime: { value: 0 },
          uColor: { value: new THREE.Color() },
          uSpeed: { value: 7 },
          uExtent: { value: extent },
          uOpacity: { value: 1 },
        },
        vertexShader: /* glsl */ `
          attribute vec4 aSeed;
          attribute float aEnd;
          uniform float uTime, uSpeed, uExtent;
          varying float vA;
          void main() {
            float H = 9.0;
            float y = 7.0 - mod(uTime * uSpeed * (0.8 + aSeed.w * 0.4) + aSeed.x * H, H);
            vec3 vel = normalize(vec3(0.25, -1.0, 0.08));
            vec3 pos = vec3((aSeed.y * 2.0 - 1.0) * uExtent, y, (aSeed.z * 2.0 - 1.0) * uExtent) + vel * aEnd * 0.28;
            vA = mix(0.0, 1.0, aEnd) * smoothstep(-2.0, 0.5, y);
            gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
          }
        `,
        fragmentShader: /* glsl */ `
          uniform vec3 uColor;
          uniform float uOpacity;
          varying float vA;
          void main() {
            gl_FragColor = vec4(uColor, 0.38 * vA * uOpacity);
          }
        `,
      }),
    [extent],
  );

  useMemo(() => {
    if (layer) return;
    material.uniforms.uColor.value.set(preset.particles.color);
    material.uniforms.uSpeed.value = preset.particles.speed;
  }, [material, preset, layer]);

  const lines = useRef<THREE.LineSegments>(null);
  useFrame((_, dt) => {
    material.uniforms.uTime.value += dt * motion;
    if (layer) {
      const o = layer.opacity();
      material.uniforms.uOpacity.value = o;
      layer.apply(material.uniforms);
      if (lines.current) lines.current.visible = o > 0.002;
    }
  });

  return <lineSegments ref={lines} geometry={geometry} material={material} renderOrder={5} />;
}
