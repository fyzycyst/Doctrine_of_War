import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { hexKey, hexNeighbors, type BoardLayout, type HexCoord } from "../../game/board";
import { useDisposable } from "../dispose";
import { hexCorner, hexToWorld } from "../hexWorld";
import { useLook } from "../look/LookContext";
import type { IslandBuild } from "./buildIsland";

/**
 * "Way out" treatment for exit hexes (Saltmarsh's southern edge): a soft pale
 * glow on each hex, brightest on its off-board side, and two faint chevrons
 * that drift off the board. Static under reduced motion. Not pickable.
 */
export function ExitMarkers({ board, island, hexes }: { board: BoardLayout; island: IslandBuild; hexes: HexCoord[] }) {
  const { reducedMotion } = useLook();
  const geometry = useDisposable(() => buildExitGeometry(board, island, hexes), [board, island, hexes]);
  const material = useDisposable(() => createExitMaterial(), []);
  useFrame((_, dt) => {
    if (!reducedMotion) material.uniforms.uTime.value += dt;
  });
  if (!geometry) return null;
  return <mesh geometry={geometry} material={material} renderOrder={2} raycast={() => null} frustumCulled={false} />;
}

/** Outward (off-board) unit direction of an edge hex in world x/z, or null if it isn't on an edge. */
export function offBoardDirection(coord: HexCoord, board: BoardLayout, center: { x: number; z: number }): [number, number] | null {
  const onBoard = new Set(board.hexes.map((h) => hexKey(h.coord)));
  const [x0, z0] = hexToWorld(coord, center);
  let dx = 0;
  let dz = 0;
  for (const n of hexNeighbors(coord)) {
    if (onBoard.has(hexKey(n))) continue;
    const [x, z] = hexToWorld(n, center);
    dx += x - x0;
    dz += z - z0;
  }
  const len = Math.hypot(dx, dz);
  return len > 1e-6 ? [dx / len, dz / len] : null;
}

const GLOW_RADIUS = 0.86;
const CHEVRON = { half: 0.17, back: 0.11, width: 0.045, lift: 0.025 };

function buildExitGeometry(board: BoardLayout, island: IslandBuild, hexes: HexCoord[]): THREE.BufferGeometry | null {
  const pos: number[] = [];
  const alpha: number[] = [];
  const flow: number[] = [];
  const dir: number[] = [];
  const push = (x: number, y: number, z: number, a: number, f: number, d: [number, number]) => {
    pos.push(x, y, z);
    alpha.push(a);
    flow.push(f);
    dir.push(d[0], d[1]);
  };
  for (const coord of hexes) {
    const top = island.surface.get(hexKey(coord));
    const out = offBoardDirection(coord, board, island.center);
    if (top === undefined || !out) continue;
    const [cx, cz] = hexToWorld(coord, island.center);
    const y = top + 0.018;
    // Glow: a fan whose rim is brighter on the off-board side.
    for (let i = 0; i < 6; i += 1) {
      const [ax, az] = hexCorner(i, GLOW_RADIUS);
      const [bx, bz] = hexCorner(i + 1, GLOW_RADIUS);
      const rim = (x: number, z: number) => 0.01 + 0.1 * Math.max(0, (x * out[0] + z * out[1]) / GLOW_RADIUS);
      push(cx, y, cz, 0.02, -1, out);
      push(cx + bx, y, cz + bz, rim(bx, bz), -1, out);
      push(cx + ax, y, cz + az, rim(ax, az), -1, out);
    }
    // Chevrons pointing off the board; `flow` is their phase along the drift.
    const side: [number, number] = [-out[1], out[0]];
    for (const phase of [0, 0.5]) {
      const tipX = cx;
      const tipZ = cz;
      for (const s of [-1, 1]) {
        // One arm: from the tip back and out to the side, as a thin quad.
        const ex = tipX - out[0] * CHEVRON.back + side[0] * CHEVRON.half * s;
        const ez = tipZ - out[1] * CHEVRON.back + side[1] * CHEVRON.half * s;
        const nx = -(ez - tipZ);
        const nz = ex - tipX;
        const nl = Math.hypot(nx, nz) || 1;
        const ox = (nx / nl) * CHEVRON.width * 0.5;
        const oz = (nz / nl) * CHEVRON.width * 0.5;
        const yc = y + CHEVRON.lift;
        push(tipX - ox, yc, tipZ - oz, 0.4, phase, out);
        push(ex - ox, yc, ez - oz, 0.4, phase, out);
        push(ex + ox, yc, ez + oz, 0.4, phase, out);
        push(tipX - ox, yc, tipZ - oz, 0.4, phase, out);
        push(ex + ox, yc, ez + oz, 0.4, phase, out);
        push(tipX + ox, yc, tipZ + oz, 0.4, phase, out);
      }
    }
  }
  if (pos.length === 0) return null;
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("aAlpha", new THREE.Float32BufferAttribute(alpha, 1));
  g.setAttribute("aFlow", new THREE.Float32BufferAttribute(flow, 1));
  g.setAttribute("aDir", new THREE.Float32BufferAttribute(dir, 2));
  return g;
}

function createExitMaterial() {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    uniforms: { uTime: { value: 0 }, uColor: { value: new THREE.Color("#f2ead2") } },
    vertexShader: /* glsl */ `
      attribute float aAlpha;
      attribute float aFlow;
      attribute vec2 aDir;
      uniform float uTime;
      varying float vA;
      void main() {
        vec3 p = position;
        float a = aAlpha;
        if (aFlow >= 0.0) {
          // Chevrons drift outward and fade in/out along their run.
          float f = fract(uTime * 0.35 + aFlow);
          p.xz += aDir * (f - 0.5) * 0.55;
          a *= sin(3.14159 * f);
        }
        vA = a;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      varying float vA;
      void main() {
        gl_FragColor = vec4(uColor, vA);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  });
}
