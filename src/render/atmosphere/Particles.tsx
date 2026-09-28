import { useFrame, useThree } from "@react-three/fiber";
import { useMemo } from "react";
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
  const { preset, quality } = useLook();
  const { kind, rate } = preset.particles;
  const scale = quality === "high" ? 1 : 0.35;

  if (kind === "rain") return <Rain count={Math.round(1400 * rate * scale)} extent={extent} />;
  return <Embers count={Math.round(320 * rate * scale)} extent={extent} />;
}

function seeds(count: number, salt: number) {
  const rand = mulberry32(salt);
  const arr = new Float32Array(count * 4);
  for (let i = 0; i < arr.length; i += 1) arr[i] = rand();
  return arr;
}

function Embers({ count, extent }: { count: number; extent: number }) {
  const { preset } = useLook();
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
        },
        vertexShader: /* glsl */ `
          attribute vec4 aSeed;
          uniform float uTime, uSpeed, uSize, uExtent, uPixel, uAsh;
          varying float vAlpha;
          varying float vHot;
          void main() {
            float life = 7.0 + aSeed.x * 7.0;
            float t = mod(uTime * uSpeed + aSeed.y * life, life);
            float k = t / life;
            vec3 start = vec3(-uExtent - 1.0 + aSeed.z * uExtent * 1.3,
                              -0.2 + aSeed.w * 1.6,
                              (aSeed.y * 2.0 - 1.0) * uExtent * 0.8);
            vec3 pos = start + vec3(t * 1.1,
                                    t * 0.16 + sin(t * 1.3 + aSeed.x * 20.0) * 0.18,
                                    sin(t * 0.8 + aSeed.z * 10.0) * 0.45);
            vec4 mv = modelViewMatrix * vec4(pos, 1.0);
            gl_Position = projectionMatrix * mv;
            float flicker = 0.55 + 0.45 * sin(uTime * (6.0 + aSeed.w * 8.0) + aSeed.x * 50.0);
            vAlpha = sin(k * 3.14159) * flicker;
            vHot = step(0.35, aSeed.w) * (1.0 - uAsh) + uAsh * step(0.8, aSeed.w);
            float size = (0.6 + aSeed.z * 1.2) * uSize;
            gl_PointSize = size * 26.0 * uPixel / -mv.z;
          }
        `,
        fragmentShader: /* glsl */ `
          uniform vec3 uColor;
          uniform float uAsh;
          varying float vAlpha;
          varying float vHot;
          void main() {
            float d = length(gl_PointCoord - 0.5);
            float a = smoothstep(0.5, 0.0, d);
            vec3 ash = vec3(0.35, 0.33, 0.32);
            vec3 col = mix(ash * 0.6, uColor * 4.0, vHot);
            gl_FragColor = vec4(col * a * vAlpha, 1.0);
          }
        `,
      }),
    [extent, dpr],
  );

  useMemo(() => {
    const u = material.uniforms;
    u.uColor.value.set(preset.particles.color);
    u.uSpeed.value = preset.particles.speed;
    u.uSize.value = preset.particles.size;
    u.uAsh.value = preset.particles.kind === "ash" ? 1 : 0;
  }, [material, preset]);

  useFrame((_, dt) => {
    material.uniforms.uTime.value += dt;
  });

  return <points geometry={geometry} material={material} renderOrder={5} />;
}

function Rain({ count, extent }: { count: number; extent: number }) {
  const { preset } = useLook();

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
          varying float vA;
          void main() {
            gl_FragColor = vec4(uColor, 0.38 * vA);
          }
        `,
      }),
    [extent],
  );

  useMemo(() => {
    material.uniforms.uColor.value.set(preset.particles.color);
    material.uniforms.uSpeed.value = preset.particles.speed;
  }, [material, preset]);

  useFrame((_, dt) => {
    material.uniforms.uTime.value += dt;
  });

  return <lineSegments geometry={geometry} material={material} renderOrder={5} />;
}
