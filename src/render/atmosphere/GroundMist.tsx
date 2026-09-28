import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { hexKey } from "../../game/board";
import { useLook } from "../look/LookContext";
import { NOISE_GLSL } from "../shaders/noise";
import type { IslandBuild, IslandHex } from "../terrain/buildIsland";

/**
 * Low-lying animated ground mist (Grey Dawn's mist on the Ember Dusk base).
 *
 * Density is driven by a small world-space grid texture: R = mist density,
 * G = terrain height. Per-hex density can be overridden via `densityByHex`
 * (keyed by `hexKey`), which is the hook fog of war will use later.
 */

const GRID = 64;
const MAX_DENSITY = 3;

export type MistDensityMap = Record<string, number>;

function defaultDensity(hex: IslandHex, radius: number): number {
  // Cool haze gathers on the Host's (west) side, in the ford and at the edges.
  const west = THREE.MathUtils.clamp(-hex.x / (radius * 0.8), 0, 1);
  let d = 0.15 + west * 0.35;
  if (hex.kind === "shore") d += 0.35;
  
  if (hex.terrain === "ridge") d -= 0.25;
  if (hex.terrain === "wall") d -= 0.15;
  return THREE.MathUtils.clamp(d, 0, 1.2);
}

function buildGrid(island: IslandBuild, overrides: MistDensityMap | undefined, extent: number) {
  const data = new Uint8Array(GRID * GRID * 4);
  const density = new Float32Array(GRID * GRID);
  const height = new Float32Array(GRID * GRID).fill(-1);
  const hexDensity = island.hexes.map((h) => {
    const base = defaultDensity(h, island.radius);
    const o = overrides?.[hexKey(h.coord)];
    return o === undefined ? base : o;
  });

  for (let j = 0; j < GRID; j += 1) {
    for (let i = 0; i < GRID; i += 1) {
      const x = ((i + 0.5) / GRID - 0.5) * extent * 2;
      const z = ((j + 0.5) / GRID - 0.5) * extent * 2;
      let best = -1;
      let bestD = Infinity;
      island.hexes.forEach((h, index) => {
        const d = (h.x - x) ** 2 + (h.z - z) ** 2;
        if (d < bestD) {
          bestD = d;
          best = index;
        }
      });
      const idx = j * GRID + i;
      if (best >= 0 && bestD < 1.0) {
        density[idx] = hexDensity[best];
        height[idx] = island.hexes[best].top;
      } else {
        // Thin mist spills a little past the island edge.
        density[idx] = best >= 0 && bestD < 2.2 ? 0.2 : 0;
        height[idx] = -1;
      }
    }
  }

  // Two box-blur passes so density and height fade smoothly across hex edges.
  const blur = (src: Float32Array) => {
    const out = new Float32Array(src.length);
    for (let j = 0; j < GRID; j += 1) {
      for (let i = 0; i < GRID; i += 1) {
        let sum = 0;
        let n = 0;
        for (let dj = -1; dj <= 1; dj += 1) {
          for (let di = -1; di <= 1; di += 1) {
            const ii = i + di;
            const jj = j + dj;
            if (ii < 0 || jj < 0 || ii >= GRID || jj >= GRID) continue;
            sum += src[jj * GRID + ii];
            n += 1;
          }
        }
        out[j * GRID + i] = sum / n;
      }
    }
    return out;
  };
  let d = blur(blur(density));
  let h = height;
  // Height: take the max of neighbours first so mist fades before tall hexes.
  const dilate = (src: Float32Array) => {
    const out = new Float32Array(src.length);
    for (let j = 0; j < GRID; j += 1) {
      for (let i = 0; i < GRID; i += 1) {
        let m = -1;
        for (let dj = -1; dj <= 1; dj += 1) {
          for (let di = -1; di <= 1; di += 1) {
            const ii = Math.min(GRID - 1, Math.max(0, i + di));
            const jj = Math.min(GRID - 1, Math.max(0, j + dj));
            m = Math.max(m, src[jj * GRID + ii]);
          }
        }
        out[j * GRID + i] = m;
      }
    }
    return out;
  };
  h = blur(dilate(h));
  // Stored as density / MAX_DENSITY so fog of war can go well past the defaults.
  d = d.map((v) => Math.min(1, v / MAX_DENSITY));

  for (let k = 0; k < GRID * GRID; k += 1) {
    data[k * 4] = Math.round(THREE.MathUtils.clamp(d[k], 0, 1) * 255);
    data[k * 4 + 1] = Math.round(THREE.MathUtils.clamp((h[k] + 1) / 2, 0, 1) * 255);
    data[k * 4 + 3] = 255;
  }
  const texture = new THREE.DataTexture(data, GRID, GRID, THREE.RGBAFormat);
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  return texture;
}

const LAYERS = 5;

export function GroundMist({ island, densityByHex }: { island: IslandBuild; densityByHex?: MistDensityMap }) {
  const { preset, quality } = useLook();
  const extent = island.radius + 1.5;

  const texture = useMemo(() => buildGrid(island, densityByHex, extent), [island, densityByHex, extent]);
  useEffect(() => () => texture.dispose(), [texture]);

  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        fog: true,
        uniforms: THREE.UniformsUtils.merge([
          THREE.UniformsLib.fog,
          {
            uTime: { value: 0 },
            uGrid: { value: null },
            uExtent: { value: 1 },
            uColor: { value: new THREE.Color() },
            uDensity: { value: 0.5 },
            uSpeed: { value: 0.05 },
            uTop: { value: 0.6 },
          },
        ]),
        vertexShader: /* glsl */ `
          #include <fog_pars_vertex>
          attribute float aLayer;
          varying vec3 vWorld;
          varying float vLayer;
          void main() {
            vec4 world = modelMatrix * vec4(position, 1.0);
            vWorld = world.xyz;
            vLayer = aLayer;
            vec4 mvPosition = viewMatrix * world;
            gl_Position = projectionMatrix * mvPosition;
            #include <fog_vertex>
          }
        `,
        fragmentShader: /* glsl */ `
          #include <common>
          #include <fog_pars_fragment>
          uniform float uTime, uExtent, uDensity, uSpeed, uTop;
          uniform sampler2D uGrid;
          uniform vec3 uColor;
          varying vec3 vWorld;
          varying float vLayer;
          ${NOISE_GLSL}
          void main() {
            vec2 uv = vWorld.xz / (uExtent * 2.0) + 0.5;
            vec4 g = texture2D(uGrid, uv);
            float terrain = g.g * 2.0 - 1.0;
            float above = vWorld.y - terrain;
            float hFade = smoothstep(0.0, 0.14, above) * (1.0 - smoothstep(uTop * 0.5, uTop, above));
            vec2 p = vWorld.xz * 0.55 + vec2(uTime * uSpeed * 6.0, uTime * uSpeed * 1.5) + vLayer * 3.7;
            float n = fbm(p);
            float n2 = fbm(p * 2.3 - vec2(uTime * uSpeed * 4.0, 0.0));
            float wisps = smoothstep(0.35, 0.85, n * 0.8 + n2 * 0.4);
            float a = min(1.0, g.r * 3.0 * wisps * hFade * uDensity * 0.55);
            gl_FragColor = vec4(uColor, a);
            #include <tonemapping_fragment>
            #include <colorspace_fragment>
            #include <fog_fragment>
          }
        `,
      }),
    [],
  );

  const geometry = useMemo(() => {
    const layers = quality === "high" ? LAYERS : 3;
    const parts: THREE.BufferGeometry[] = [];
    for (let l = 0; l < layers; l += 1) {
      const g = new THREE.PlaneGeometry(extent * 2, extent * 2, 1, 1);
      g.rotateX(-Math.PI / 2);
      g.translate(0, island.waterLevel + 0.03 + (l / layers) * preset.mist.height, 0);
      g.setAttribute("aLayer", new THREE.Float32BufferAttribute(new Array(g.getAttribute("position").count).fill(l), 1));
      parts.push(g);
    }
    const merged = new THREE.BufferGeometry();
    const positions: number[] = [];
    const layerAttr: number[] = [];
    for (const g of parts) {
      const nonIndexed = g.toNonIndexed();
      positions.push(...(nonIndexed.getAttribute("position").array as Float32Array));
      layerAttr.push(...(nonIndexed.getAttribute("aLayer").array as Float32Array));
    }
    merged.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    merged.setAttribute("aLayer", new THREE.Float32BufferAttribute(layerAttr, 1));
    return merged;
  }, [extent, island.waterLevel, preset.mist.height, quality]);

  useMemo(() => {
    const u = material.uniforms;
    u.uGrid.value = texture;
    u.uExtent.value = extent;
    u.uColor.value.set(preset.mist.color);
    u.uDensity.value = preset.mist.density;
    u.uSpeed.value = preset.mist.speed;
    u.uTop.value = preset.mist.height + 0.25;
  }, [material, texture, extent, preset]);

  useFrame((_, dt) => {
    material.uniforms.uTime.value += dt;
  });

  return <mesh geometry={geometry} material={material} renderOrder={3} frustumCulled={false} />;
}
