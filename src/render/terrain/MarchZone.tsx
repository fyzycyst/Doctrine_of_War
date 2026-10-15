import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { hexKey, type HexCoord } from "../../game/board";
import { useDisposable } from "../dispose";
import { hexToWorld } from "../hexWorld";
import { useLook } from "../look/LookContext";
import type { IslandBuild } from "./buildIsland";

/**
 * "Where this company can march" (T21 muster): distinct from the gold
 * deployment pulse. Each hex gets a faint cool fill, a bright silver-blue edge
 * band with a thin dark outline (legible on the bright dusk board and at
 * night alike), and a pair of footprint chevrons pointing away from the
 * marching company that drift outward (static under reduced motion).
 */
export function MarchZone({ island, hexes, from }: { island: IslandBuild; hexes: HexCoord[]; from: HexCoord | null }) {
  const { reducedMotion } = useLook();
  const tiles = useMemo(() => buildTiles(island, hexes), [island, hexes]);
  const chevrons = useMemo(() => buildChevrons(island, hexes, from), [island, hexes, from]);
  useEffect(() => () => tiles?.dispose(), [tiles]);
  useEffect(() => () => chevrons?.dispose(), [chevrons]);
  const tileMaterial = useDisposable(() => createTileMaterial(), []);
  const chevronMaterial = useDisposable(() => createChevronMaterial(), []);
  useFrame((_, dt) => {
    if (!reducedMotion) chevronMaterial.uniforms.uTime.value += dt;
  });
  return (
    <>
      {tiles && <mesh geometry={tiles} material={tileMaterial} renderOrder={3} raycast={() => null} />}
      {chevrons && <mesh geometry={chevrons} material={chevronMaterial} renderOrder={4} raycast={() => null} frustumCulled={false} />}
    </>
  );
}

/** Unit direction (world x/z) from `from` to `to`, or null if they coincide. */
export function marchDirection(from: HexCoord, to: HexCoord, center: { x: number; z: number }): [number, number] | null {
  const [x0, z0] = hexToWorld(from, center);
  const [x1, z1] = hexToWorld(to, center);
  const len = Math.hypot(x1 - x0, z1 - z0);
  return len > 1e-6 ? [(x1 - x0) / len, (z1 - z0) / len] : null;
}

function buildTiles(island: IslandBuild, hexes: HexCoord[]) {
  const parts = hexes.flatMap((hex) => {
    const y = island.surface.get(hexKey(hex));
    if (y === undefined) return [];
    const [x, z] = hexToWorld(hex, island.center);
    // thetaStart 0 puts a corner on +x, matching flat-top hexes; uv spans the circumcircle.
    const g = new THREE.CircleGeometry(0.93, 6);
    g.rotateX(-Math.PI / 2);
    g.translate(x, y + 0.019, z);
    return [g];
  });
  return parts.length ? mergeGeometries(parts) : null;
}

const CHEVRON = { half: 0.16, back: 0.12, width: 0.055, gap: 0.2, lift: 0.024 };

function buildChevrons(island: IslandBuild, hexes: HexCoord[], from: HexCoord | null) {
  const pos: number[] = [];
  const alpha: number[] = [];
  const flow: number[] = [];
  const dir: number[] = [];
  const tone: number[] = [];
  // Without a company, chevrons point out from the zone's centre.
  const center = from ?? centroid(hexes);
  for (const hex of hexes) {
    const y = island.surface.get(hexKey(hex));
    const d = center ? marchDirection(center, hex, island.center) : null;
    if (y === undefined || !d) continue;
    const [cx, cz] = hexToWorld(hex, island.center);
    const side: [number, number] = [-d[1], d[0]];
    for (const [phase, offset] of [
      [0, -CHEVRON.gap / 2],
      [0.5, CHEVRON.gap / 2],
    ] as const) {
      const tipX = cx + d[0] * (offset + CHEVRON.back / 2);
      const tipZ = cz + d[1] * (offset + CHEVRON.back / 2);
      // A dark under-stroke first (tone 0), then the bright chevron (tone 1).
      for (const t of [0, 1]) {
        const w = t === 0 ? CHEVRON.width * 1.9 : CHEVRON.width;
        const yc = y + CHEVRON.lift + t * 0.002;
        for (const s of [-1, 1]) {
          const ex = tipX - d[0] * CHEVRON.back + side[0] * CHEVRON.half * s;
          const ez = tipZ - d[1] * CHEVRON.back + side[1] * CHEVRON.half * s;
          const nx = -(ez - tipZ);
          const nz = ex - tipX;
          const nl = Math.hypot(nx, nz) || 1;
          const ox = (nx / nl) * w * 0.5;
          const oz = (nz / nl) * w * 0.5;
          const quad = [
            [tipX - ox, tipZ - oz],
            [ex - ox, ez - oz],
            [ex + ox, ez + oz],
            [tipX - ox, tipZ - oz],
            [ex + ox, ez + oz],
            [tipX + ox, tipZ + oz],
          ];
          for (const [qx, qz] of quad) {
            pos.push(qx, yc, qz);
            alpha.push(t === 0 ? 0.35 : 0.85);
            flow.push(phase);
            dir.push(d[0], d[1]);
            tone.push(t);
          }
        }
      }
    }
  }
  if (pos.length === 0) return null;
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("aAlpha", new THREE.Float32BufferAttribute(alpha, 1));
  g.setAttribute("aFlow", new THREE.Float32BufferAttribute(flow, 1));
  g.setAttribute("aDir", new THREE.Float32BufferAttribute(dir, 2));
  g.setAttribute("aTone", new THREE.Float32BufferAttribute(tone, 1));
  return g;
}

function centroid(hexes: HexCoord[]): HexCoord | null {
  if (hexes.length === 0) return null;
  const q = hexes.reduce((s, h) => s + h.q, 0) / hexes.length;
  const r = hexes.reduce((s, h) => s + h.r, 0) / hexes.length;
  return { q, r };
}

const SILVER = "#cfe0ff";
const SHADOW = "#101a28";

function createTileMaterial() {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    uniforms: { uSilver: { value: new THREE.Color(SILVER) }, uShadow: { value: new THREE.Color(SHADOW) } },
    vertexShader: /* glsl */ `
      varying vec2 vP;
      void main() {
        vP = uv * 2.0 - 1.0;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uSilver, uShadow;
      varying vec2 vP;
      void main() {
        // Flat-top hexagon distance: 1.0 on the edges of the circumscribed hexagon.
        vec2 p = abs(vP);
        float d = max(p.y, 0.866 * p.x + 0.5 * p.y) / 0.866;
        float fill = 0.045;
        float band = smoothstep(0.8, 0.86, d) * (1.0 - smoothstep(0.9, 0.92, d));
        float rim = smoothstep(0.91, 0.93, d) * (1.0 - smoothstep(0.97, 1.0, d));
        vec3 col = mix(uSilver, uShadow, rim / max(band + rim, 0.001));
        float a = max(fill, max(band * 0.8, rim * 0.45));
        gl_FragColor = vec4(col, a);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  });
}

function createChevronMaterial() {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    uniforms: { uTime: { value: 0 }, uSilver: { value: new THREE.Color(SILVER) }, uShadow: { value: new THREE.Color(SHADOW) } },
    vertexShader: /* glsl */ `
      attribute float aAlpha;
      attribute float aFlow;
      attribute vec2 aDir;
      attribute float aTone;
      uniform float uTime;
      varying float vA;
      varying float vTone;
      void main() {
        vec3 p = position;
        // Footsteps: each chevron drifts a short way outward and fades in and out.
        // Reduced motion freezes uTime, so they hold still at full strength.
        float f = fract(uTime * 0.45 + aFlow);
        float moving = step(0.0001, uTime);
        p.xz += aDir * (f - 0.5) * 0.14 * moving;
        vA = aAlpha * mix(1.0, 0.45 + 0.55 * sin(3.14159 * f), moving);
        vTone = aTone;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uSilver, uShadow;
      varying float vA;
      varying float vTone;
      void main() {
        gl_FragColor = vec4(mix(uShadow, uSilver, vTone), vA);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  });
}
