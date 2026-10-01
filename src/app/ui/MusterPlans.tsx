// Planned musters on the board (T21): a dashed ghost arrow from each company to where it
// will muster, with a ghost marker there, and a two-headed swap arrow for a relief.
// Drawn from the player's own plan only; nothing here knows where the plan will really end.
import { Html, Line } from "@react-three/drei";
import { useMemo } from "react";
import * as THREE from "three";
import type { BoardLayout, HexCoord } from "../../game/board";
import { boardCenter, hexToWorld } from "../../render/hexWorld";
import { useCaptureStore } from "../captureStore";
import { useGame } from "../game/gameStore";
import { plannedArrows } from "../game/muster";
import { rosterName } from "../game/view";

/** Above the tallest tiles; drawn over the terrain so a plan is never hidden by a ridge. */
const ARROW_Y = 0.62;
const GHOST = "#f3e6c4";
const RELIEF = "#8fb0e8";

function Arrowhead({ at, from, color }: { at: THREE.Vector3; from: THREE.Vector3; color: string }) {
  const quaternion = useMemo(() => {
    const direction = at.clone().sub(from).normalize();
    return new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction);
  }, [at, from]);
  return (
    <mesh position={at} quaternion={quaternion} renderOrder={12}>
      <coneGeometry args={[0.11, 0.26, 12]} />
      <meshBasicMaterial color={color} depthTest={false} transparent opacity={0.95} />
    </mesh>
  );
}

export function MusterPlans({ board }: { board: BoardLayout }) {
  const stage = useGame((s) => s.stage);
  const plan = useGame((s) => s.muster);
  const view = useGame((s) => s.view);
  const captureMode = useCaptureStore((s) => s.captureMode);
  const center = useMemo(() => boardCenter(board), [board]);
  const arrows = useMemo(() => {
    const positions = new Map(view.squads.filter((squad) => squad.faction === view.viewer && squad.hex).map((squad) => [squad.id, squad.hex!]));
    return plannedArrows(plan, positions);
  }, [plan, view]);
  if (stage !== "command" || captureMode || arrows.length === 0) return null;

  const point = (hex: HexCoord) => {
    const [x, z] = hexToWorld(hex, center);
    return new THREE.Vector3(x, ARROW_Y, z);
  };
  const nameOf = (id: string) => {
    const squad = view.squads.find((item) => item.id === id);
    return squad ? rosterName(squad) : id;
  };

  return (
    <>
      {arrows.map(({ squadId, from, to, relief }) => {
        const a = point(from);
        const b = point(to);
        const color = relief ? RELIEF : GHOST;
        // Stop short of the hex centres so the arrowheads sit clear of the banners.
        const span = b.clone().sub(a);
        const tail = a.clone().add(span.clone().multiplyScalar(0.18));
        const head = a.clone().add(span.clone().multiplyScalar(0.82));
        return (
          <group key={squadId}>
            <Line points={[tail, head]} color={color} lineWidth={2.4} dashed dashSize={0.16} gapSize={0.1} transparent opacity={0.95} depthTest={false} renderOrder={12} />
            <Arrowhead at={head} from={tail} color={color} />
            {relief && <Arrowhead at={tail} from={head} color={color} />}
            {!relief && (
              <mesh position={[b.x, ARROW_Y - 0.2, b.z]} rotation={[-Math.PI / 2, 0, 0]} renderOrder={11}>
                <ringGeometry args={[0.62, 0.8, 6, 1]} />
                <meshBasicMaterial color={GHOST} transparent opacity={0.55} depthTest={false} />
              </mesh>
            )}
            <Html position={[relief ? (a.x + b.x) / 2 : b.x, ARROW_Y + 0.35, relief ? (a.z + b.z) / 2 : b.z]} center zIndexRange={[30, 30]} style={{ pointerEvents: "none" }}>
              <span className={`muster-ghost ${relief ? "relief" : ""}`}>{relief ? `Relief: ${nameOf(squadId)}` : nameOf(squadId)}</span>
            </Html>
          </group>
        );
      })}
    </>
  );
}
