import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { hexKey, type HexCoord } from "../../game/board";
import type { FactionId } from "../../game/engine/types";
import { useLook } from "../look/LookContext";
import type { IslandBuild } from "./buildIsland";

/**
 * T27 §2a: an objective's remaining strength on the board, in the company rings'
 * symbology. A ring round the objective's hex (outside any company ring on it) in the
 * holder's colour: a faint full track, and a lit arc that drains as integrity falls,
 * centred toward the camera so the gap opens at the back, as a company's cohesion
 * gap does at its rear. An outer band of short merlons marks it as a structure, not a
 * company. It sits beside the
 * prop's battered and broken stages as the precise reading. Under reduced motion it
 * updates with no easing.
 */

export interface ObjectiveStrength {
  hex: HexCoord;
  /** Integrity as a share of its start, 0..1. */
  fraction: number;
  holder: FactionId;
}

const INNER = 0.77;
const OUTER = 0.84;

/** The crenellated outer band: twelve short merlons outside the ring. */
const MERLONS = (() => {
  const n = 12;
  const parts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < n; i += 1) {
    const len = ((Math.PI * 2) / n) * 0.42;
    parts.push(new THREE.RingGeometry(OUTER + 0.03, OUTER + 0.08, 4, 1, (i / n) * Math.PI * 2 - len / 2, len));
  }
  return mergeGeometries(parts);
})();

/** The lit arc for a fraction (ring-local angles, after the ring's -90° tilt onto the ground). */
export function strengthArc(fraction: number): { start: number; length: number } {
  const length = Math.max(0, Math.min(1, fraction)) * Math.PI * 2;
  // Centred on local -y, which the tilt turns to world +z: toward the default camera.
  return { start: -Math.PI / 2 - length / 2, length };
}

/** The shown fraction this frame: eased toward the target, or the target at once under reduced motion. */
export function drainToward(current: number, target: number, dt: number, reducedMotion: boolean): number {
  if (reducedMotion) return target;
  const next = current + (target - current) * (1 - Math.exp(-dt * 4));
  return Math.abs(next - target) < 0.002 ? target : next;
}

export function ObjectiveRings({ island, strengths }: { island: IslandBuild; strengths: readonly ObjectiveStrength[] }) {
  const placed = useMemo(
    () =>
      strengths
        .map((s) => {
          const hex = island.hexes.find((h) => h.kind === "board" && hexKey(h.coord) === hexKey(s.hex));
          if (!hex) return null;
          const wet = hex.terrain === "river" || hex.terrain === "ford";
          return { ...s, x: hex.x, z: hex.z, y: (wet ? Math.max(hex.top, island.waterLevel) : hex.top) + 0.02 };
        })
        .filter((p): p is NonNullable<typeof p> => p !== null),
    [island, strengths],
  );
  return (
    <>
      {placed.map((p) => (
        <ObjectiveRing key={hexKey(p.hex)} at={p} fraction={p.fraction} holder={p.holder} />
      ))}
    </>
  );
}

function ObjectiveRing({ at, fraction, holder }: { at: { x: number; y: number; z: number }; fraction: number; holder: FactionId }) {
  const { skin, reducedMotion } = useLook();
  const glow = skin.factions[holder].glow;
  const lit = useMemo(() => new THREE.MeshBasicMaterial({ color: new THREE.Color(glow).multiplyScalar(1.1), transparent: true, opacity: 0.78, depthWrite: false }), [glow]);
  const track = useMemo(() => new THREE.MeshBasicMaterial({ color: glow, transparent: true, opacity: 0.16, depthWrite: false }), [glow]);
  const edge = useMemo(() => new THREE.MeshBasicMaterial({ color: glow, transparent: true, opacity: 0.5, depthWrite: false }), [glow]);
  useEffect(() => () => [lit, track, edge].forEach((m) => m.dispose()), [lit, track, edge]);

  const arc = useRef<THREE.Mesh>(null);
  const shown = useRef(fraction);
  const built = useRef(-1);
  const build = (f: number) => {
    const m = arc.current;
    if (!m || Math.abs(f - built.current) < 0.002) return;
    const { start, length } = strengthArc(f);
    m.geometry.dispose();
    m.geometry = new THREE.RingGeometry(INNER, OUTER, 72, 1, start, Math.max(0.0001, length));
    m.visible = length > 0.001;
    built.current = f;
  };
  useEffect(() => {
    build(shown.current);
    return () => arc.current?.geometry.dispose();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useFrame((_, dt) => {
    shown.current = drainToward(shown.current, fraction, Math.min(dt, 0.1), reducedMotion);
    build(shown.current);
  });

  // Drawn after the mist (renderOrder 3), like the exit markers: an objective is on every map.
  return (
    <group position={[at.x, at.y, at.z]} rotation={[-Math.PI / 2, 0, 0]}>
      <mesh renderOrder={5} material={track} raycast={() => null}>
        <ringGeometry args={[INNER, OUTER, 72, 1]} />
      </mesh>
      <mesh ref={arc} renderOrder={5} material={lit} raycast={() => null} />
      <mesh renderOrder={5} material={edge} geometry={MERLONS} raycast={() => null} />
    </group>
  );
}
