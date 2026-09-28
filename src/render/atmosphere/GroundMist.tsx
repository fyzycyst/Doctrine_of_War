import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { hexKey } from "../../game/board";
import { useLook } from "../look/LookContext";
import { NOISE_GLSL } from "../shaders/noise";
import { FOG_UNIFORMS } from "../shaders/surface";
import { MAX_SWIRLS } from "./atmosphereRuntime";
import type { Anchor, IslandBuild, IslandHex } from "../terrain/buildIsland";
import { useDisposable } from "../dispose";

/**
 * Low-lying animated ground mist (Grey Dawn's mist on the Ember Dusk base),
 * plus the fog of war.
 *
 * A small world-space grid texture drives it:
 * - R: mist density (defaults per hex; `densityByHex` overrides),
 * - G: terrain height (so mist hugs the ground and fades before tall hexes),
 * - B: fog-of-war amount, animated per hex by the atmosphere runtime. Where it
 *   rises the mist becomes a tall wall; as it falls the wisps tear open first
 *   and the dense cores last, so a reveal reads as the mist *parting*.
 *
 * The same texture is shared (FOG_UNIFORMS) with the island material, which
 * desaturates unseen hexes.
 */

const GRID = 64;
const MAX_DENSITY = 3;

export type MistDensityMap = Record<string, number>;


function defaultDensity(hex: IslandHex, radius: number): number {
  // Cool haze gathers on the Host's (west) side and at the edges.
  const west = THREE.MathUtils.clamp(-hex.x / (radius * 0.8), 0, 1);
  let d = 0.15 + west * 0.35;
  if (hex.kind === "shore") d += 0.35;
  if (hex.terrain === "ridge") d -= 0.25;
  if (hex.terrain === "wall") d -= 0.15;
  return THREE.MathUtils.clamp(d, 0, 1.2);
}

function blur(src: Float32Array) {
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
}

function dilate(src: Float32Array) {
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
}

/** Texel → nearest island hex, computed once per island. */
class MistGrid {
  readonly texture: THREE.DataTexture;
  private data = new Uint8Array(GRID * GRID * 4);
  /** Island hex index per texel. */
  private nearest = new Int32Array(GRID * GRID);
  /** Distance² to the nearest hex (for the edge spill). */
  private nearestD = new Float32Array(GRID * GRID);

  constructor(
    private island: IslandBuild,
    readonly extent: number,
  ) {
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
        this.nearest[j * GRID + i] = best;
        this.nearestD[j * GRID + i] = bestD;
      }
    }
    // The height channel is static.
    const height = new Float32Array(GRID * GRID);
    for (let k = 0; k < GRID * GRID; k += 1) {
      height[k] = this.nearestD[k] < 1 ? island.hexes[this.nearest[k]].top : -1;
    }
    const h = blur(dilate(height));
    for (let k = 0; k < GRID * GRID; k += 1) {
      this.data[k * 4 + 1] = Math.round(THREE.MathUtils.clamp((h[k] + 1) / 2, 0, 1) * 255);
      this.data[k * 4 + 3] = 255;
    }
    this.texture = new THREE.DataTexture(this.data, GRID, GRID, THREE.RGBAFormat);
    this.texture.magFilter = THREE.LinearFilter;
    this.texture.minFilter = THREE.LinearFilter;
  }

  setDensity(overrides: MistDensityMap | undefined) {
    const perHex = this.island.hexes.map((h) => overrides?.[hexKey(h.coord)] ?? defaultDensity(h, this.island.radius));
    const d = new Float32Array(GRID * GRID);
    for (let k = 0; k < GRID * GRID; k += 1) {
      // Thin mist spills a little past the island edge.
      d[k] = this.nearestD[k] < 1 ? perHex[this.nearest[k]] : this.nearestD[k] < 2.2 ? 0.2 : 0;
    }
    const b = blur(blur(d));
    for (let k = 0; k < GRID * GRID; k += 1) this.data[k * 4] = Math.round(Math.min(1, b[k] / MAX_DENSITY) * 255);
    this.texture.needsUpdate = true;
  }

  /** Fog amount per board hex key (1 = unseen); other hexes stay clear. */
  setFog(fog: Map<string, number>) {
    const perHex = this.island.hexes.map((h) => (h.kind === "board" ? (fog.get(hexKey(h.coord)) ?? 0) : 0));
    const f = new Float32Array(GRID * GRID);
    for (let k = 0; k < GRID * GRID; k += 1) f[k] = this.nearestD[k] < 1 ? perHex[this.nearest[k]] : 0;
    const b = blur(f);
    for (let k = 0; k < GRID * GRID; k += 1) this.data[k * 4 + 2] = Math.round(THREE.MathUtils.clamp(b[k], 0, 1) * 255);
    this.texture.needsUpdate = true;
  }
}

const LAYERS_HIGH = 7;
const LAYERS_LOW = 4;
/** Height of the fog-of-war wall above the ground. */
const FOG_TOP = 0.85;
/** Fires that light the mist (nearest-first by kind: bridges, braziers, campfires, torches). */
const MAX_FIRES = 6;
/** Base fog-of-war opacity per slice; presets scale it (`mist.fogOfWar`). */
const FOG_ALPHA = 1.05;
const FIRE_ORDER: Record<NonNullable<Anchor["kind"]>, number> = { bridge: 0, brazier: 1, campfire: 2, torch: 3 };
const FIRE_WEIGHT: Record<NonNullable<Anchor["kind"]>, number> = { bridge: 1, brazier: 0.4, campfire: 0.4, torch: 0.2 };

export function GroundMist({ island, densityByHex }: { island: IslandBuild; densityByHex?: MistDensityMap }) {
  const { preset, quality, atmosphere, motion } = useLook();
  const extent = island.radius + 1.5;

  const grid = useMemo(() => new MistGrid(island, extent), [island, extent]);
  useEffect(() => grid.setDensity(densityByHex), [grid, densityByHex]);
  useEffect(() => () => grid.texture.dispose(), [grid]);

  const material = useDisposable(
    () =>
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        fog: true,
        // Low quality skips the domain warp (one fbm + one vnoise pair less per layer).
        defines: quality === "high" ? { FOG_WARP: "" } : {},
        uniforms: THREE.UniformsUtils.merge([
          THREE.UniformsLib.fog,
          {
            uTime: { value: 0 },
            uGrid: { value: null },
            uExtent: { value: 1 },
            uColor: { value: new THREE.Color() },
            uFogColor: { value: new THREE.Color() },
            uFogLit: { value: new THREE.Color() },
            uFireColor: { value: new THREE.Color() },
            uFires: { value: Array.from({ length: MAX_FIRES }, () => new THREE.Vector4()) },
            uSwirls: { value: Array.from({ length: MAX_SWIRLS }, () => new THREE.Vector4()) },
            uDensity: { value: 0.5 },
            uSpeed: { value: 0.05 },
            uTop: { value: 0.6 },
            uLayerNorm: { value: 1 },
            uFogAlpha: { value: FOG_ALPHA },
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
          uniform float uTime, uExtent, uDensity, uSpeed, uTop, uLayerNorm, uFogAlpha;
          uniform sampler2D uGrid;
          uniform vec3 uColor, uFogColor, uFogLit, uFireColor;
          uniform vec4 uFires[${MAX_FIRES}];
          uniform vec4 uSwirls[${MAX_SWIRLS}];
          varying vec3 vWorld;
          varying float vLayer;
          ${NOISE_GLSL}
          // Reveal swirls (x, z, age 0..1, active): the noise lookups are
          // twisted and pushed outward around an emerging squad, and the mist
          // there thins (carve) as it parts.
          vec2 swirlXZ(vec2 xz, out float carve) {
            carve = 0.0;
            for (int i = 0; i < ${MAX_SWIRLS}; i++) {
              vec4 s = uSwirls[i];
              if (s.w < 0.5) continue;
              vec2 d = xz - s.xy;
              float fall = exp(-dot(d, d) * 1.6);
              float life = 1.0 - s.z;
              float ang = life * life * 3.4 * fall;
              float c = cos(ang);
              float sn = sin(ang);
              d = mat2(c, -sn, sn, c) * d;
              d *= 1.0 - 0.35 * fall * sin(3.14159 * s.z);
              xz = s.xy + d;
              carve = max(carve, fall * sin(3.14159 * min(1.0, s.z * 1.6)));
            }
            return xz;
          }
          void main() {
            vec2 uv = vWorld.xz / (uExtent * 2.0) + 0.5;
            vec4 g = texture2D(uGrid, uv);
            float fog = g.b;
            // Most of each slice is open air past the island: skip it early.
            if (g.r < 0.004 && fog < 0.004) discard;
            float terrain = g.g * 2.0 - 1.0;
            float above = vWorld.y - terrain;
            float carve;
            vec2 sxz = swirlXZ(vWorld.xz, carve);

            // Firelight from the nearest fires (bridges first), on mist and fog.
            float fire = 0.0;
            for (int i = 0; i < ${MAX_FIRES}; i++) {
              vec3 d = vWorld - uFires[i].xyz;
              fire += uFires[i].w / (1.0 + dot(d, d) * 2.2);
            }
            vec3 fireCol = uFireColor * min(fire, 1.6);

            // Ground mist.
            float a = 0.0;
            if (g.r > 0.004) {
              vec2 p = sxz * 0.55 + vec2(uTime * uSpeed * 6.0, uTime * uSpeed * 1.5) + vLayer * 3.7;
              float field = fbm(p) * 0.8 + fbm(p * 2.3 - vec2(uTime * uSpeed * 4.0, 0.0)) * 0.4;
              float hFade = smoothstep(0.0, 0.14, above) * (1.0 - smoothstep(uTop * 0.5, uTop, above));
              float wisps = smoothstep(0.35, 0.85, field);
              // uLayerNorm keeps total opacity independent of the layer count and spacing.
              a = min(1.0, g.r * ${MAX_DENSITY.toFixed(1)} * wisps * hFade * uDensity * 0.55 * uLayerNorm);
            }

            // Fog of war: drifting battlefield mist rather than a wall.
            // - Banks: a slow, large noise that is the same in every slice, so
            //   from above the fog shows rolling banks, an uneven drifting top
            //   and thin gaps instead of a flat slab.
            // - Churn: finer noise sheared with height, so the slices line up
            //   into one moving volume instead of stacked planes.
            // - A reveal tears the thin parts open first (tear), cores last.
            float fa = 0.0;
            vec3 fogCol = uFogColor;
            if (fog > 0.004) {
              vec2 drift = vec2(uTime * 0.04, -uTime * 0.015);
              float bank = fbm(sxz * vec2(0.24, 0.55) + drift * 0.6);
              float fogTop = ${FOG_TOP.toFixed(2)} * (0.2 + 0.95 * bank) * (0.5 + 0.5 * fog);
              float hRel = above / max(fogTop, 0.05);
              float vert = smoothstep(0.0, 0.06, above) * (1.0 - smoothstep(0.2, 1.0, hRel));
              vec2 q = sxz * vec2(0.9, 2.2) + drift * vec2(1.0, 2.0) + vec2(above * 1.8, -above * 1.1);
              #ifdef FOG_WARP
              q += (vec2(vnoise(q * 0.5 + uTime * 0.05), vnoise(q * 0.5 + 5.2 - uTime * 0.04)) - 0.5) * 1.2;
              #endif
              float churn = vnoise(q) * 0.65 + vnoise(q * 2.1 + 3.3) * 0.35;
              float dens = smoothstep(0.1, 0.75, bank * 1.2 - 0.15 + (churn - 0.5) * 0.7 + (fog - 1.0) * 0.4);
              // A low veil under the banks, so unseen ground always reads as unseen.
              dens = max(dens, (0.35 + 0.2 * churn) * (1.0 - smoothstep(0.08, 0.3, above)));
              float tear = smoothstep(1.0 - fog, 1.3 - fog, churn * 0.6 + bank * 0.6);
              fa = fog * tear * dens * vert * uFogAlpha * uLayerNorm;
              // Crests and thin edges catch the key light (warm at dusk, silver
              // under the moon); the cores sit in their own shadow.
              float lit = smoothstep(0.4, 1.0, hRel) * (1.0 - 0.7 * dens) * 0.9 + 0.12;
              fogCol = uFogColor * (0.6 + 0.6 * churn) + uFogLit * lit + fireCol * (0.7 + 0.5 * (1.0 - dens));
            }
            vec3 mistCol = uColor + fireCol * 0.5;
            a *= 1.0 - 0.85 * carve;
            fa *= 1.0 - 0.85 * carve;
            vec3 col = mix(mistCol, fogCol, clamp(fa / max(a + fa, 0.001), 0.0, 1.0));
            gl_FragColor = vec4(col, min(0.95, a + fa));
            #include <tonemapping_fragment>
            #include <colorspace_fragment>
            #include <fog_fragment>
          }
        `,
      }),
    [quality],
  );

  const layers = quality === "high" ? LAYERS_HIGH : LAYERS_LOW;
  const geometry = useMemo(() => {
    const positions: number[] = [];
    const layerAttr: number[] = [];
    const top = Math.max(FOG_TOP, preset.mist.height + 0.4);
    for (let l = 0; l < layers; l += 1) {
      const g = new THREE.PlaneGeometry(extent * 2, extent * 2, 1, 1).toNonIndexed();
      g.rotateX(-Math.PI / 2);
      g.translate(0, island.waterLevel + 0.03 + (l / layers) * top, 0);
      positions.push(...(g.getAttribute("position").array as Float32Array));
      layerAttr.push(...new Array(g.getAttribute("position").count).fill(l));
      g.dispose();
    }
    const merged = new THREE.BufferGeometry();
    merged.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    merged.setAttribute("aLayer", new THREE.Float32BufferAttribute(layerAttr, 1));
    return merged;
  }, [extent, island.waterLevel, preset.mist.height, layers]);
  useEffect(() => () => geometry.dispose(), [geometry]);

  const tmp = useMemo(() => ({ base: new THREE.Color(), fog: new THREE.Color(), sky: new THREE.Color(), seen: -1 }), [grid]); // eslint-disable-line react-hooks/exhaustive-deps
  const fires = useMemo(
    () =>
      island.fireAnchors
        .filter((a) => a.kind)
        .sort((a, b) => FIRE_ORDER[a.kind!] - FIRE_ORDER[b.kind!])
        .slice(0, MAX_FIRES)
        .map((a) => ({ x: a.x, y: a.y + 0.2, z: a.z, weight: FIRE_WEIGHT[a.kind!] })),
    [island],
  );

  useEffect(() => {
    FOG_UNIFORMS.uFogGrid.value = grid.texture;
    FOG_UNIFORMS.uFogExtent.value = extent;
    material.uniforms.uGrid.value = grid.texture;
    material.uniforms.uExtent.value = extent;
  }, [grid, extent, material]);

  useFrame((_, dt) => {
    const u = material.uniforms;
    const m = atmosphere.mix;
    u.uTime.value += dt * motion;
    // Weather layers more (and differently coloured) mist on top of the preset.
    u.uDensity.value = preset.mist.density + m.mistDensityAdd;
    u.uColor.value.copy(tmp.base.set(preset.mist.color).lerp(m.mistColor, Math.min(1, m.mistColorMix)));
    // Fog of war is a dimmer, cooler body than the ground mist (unknown, not
    // weather), toned by the sky so it sits in each time of day.
    u.uFogColor.value.copy(tmp.fog.set(preset.fog.color).lerp(tmp.sky.set(preset.hemisphere.sky), 0.45).lerp(tmp.base.set(preset.mist.color), 0.25).multiplyScalar(0.6));
    // The key light tints the fog's tops: warm sun at dusk, silver moon at night.
    u.uFogLit.value.set(preset.sun.color).multiplyScalar(0.34 * Math.min(1, preset.sun.intensity / 3.5));
    u.uFireColor.value.set(preset.fires.color).multiplyScalar(0.5);
    const fireOn = Math.min(1, preset.fires.intensity / 5);
    const t = u.uTime.value;
    for (let i = 0; i < MAX_FIRES; i += 1) {
      const f = fires[i];
      const v = u.uFires.value[i] as THREE.Vector4;
      if (!f || fireOn <= 0) {
        v.set(0, -99, 0, 0);
        continue;
      }
      const flick = 0.85 + 0.15 * Math.sin(t * 7.3 + i * 1.7) * Math.sin(t * 3.1 + i);
      v.set(f.x, f.y, f.z, f.weight * fireOn * flick);
    }
    u.uSpeed.value = preset.mist.speed;
    u.uFogAlpha.value = FOG_ALPHA * (preset.mist.fogOfWar ?? 1);
    u.uTop.value = preset.mist.height + 0.25 + m.mistHeightAdd;
    // Calibrated against the original 5 layers spread over 0.55 world units.
    const top = Math.max(FOG_TOP, preset.mist.height + 0.4);
    u.uLayerNorm.value = (5 / layers) * (top / layers / (0.55 / 5)) * 0.9;
    for (let i = 0; i < MAX_SWIRLS; i += 1) {
      const sw = atmosphere.swirls[i];
      (u.uSwirls.value[i] as THREE.Vector4).set(sw?.x ?? 0, sw?.z ?? 0, sw?.age ?? 0, sw ? 1 : 0);
    }
    if (atmosphere.fogVersion !== tmp.seen) {
      tmp.seen = atmosphere.fogVersion;
      grid.setFog(atmosphere.fog);
      let any = 0;
      for (const v of atmosphere.fog.values()) any = Math.max(any, v);
      FOG_UNIFORMS.uFogStrength.value = any > 0 ? 1 : 0;
    }
  });

  return <mesh geometry={geometry} material={material} renderOrder={3} frustumCulled={false} />;
}
