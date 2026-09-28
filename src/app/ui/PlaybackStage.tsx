// In-canvas playback pieces (T06): callouts anchored above squads, and a gentle
// camera lean toward the active squad. Rendered inside BattleBoard's <Canvas>.
import { Html } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { useMemo } from "react";
import * as THREE from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { hexDistance, type BoardLayout } from "../../game/board";
import type { CameraShot } from "../../render/camera/DioramaCamera";
import { boardCenter, hexToWorld } from "../../render/hexWorld";
import { useCaptureStore } from "../captureStore";
import { useGame, useShownView, type Callout } from "../game/gameStore";
import { rosterName } from "../game/view";
import { Sigil } from "./glyphs";

/** Height above the board at which callouts float (over the squad's banner). */
const CALLOUT_Y = 1.45;
/** How far the camera target leans toward the active squad (0..1 of the way). */
const LEAN = 0.18;
/** Lean response rate (1/s): slow enough to read as a drift, never a swing. */
const LEAN_RATE = 1.6;

export function PlaybackStage({ board, shot, reducedMotion }: { board: BoardLayout; shot: CameraShot; reducedMotion: boolean }) {
  const allCallouts = useGame((s) => s.callouts);
  const hidden = useCaptureStore((s) => s.captureMode && !s.keepCallouts);
  const callouts = hidden ? [] : allCallouts;
  const center = useMemo(() => boardCenter(board), [board]);
  return (
    <>
      {!reducedMotion && <CameraEmphasis center={center} shot={shot} />}
      <WardMarkers center={center} />
      {callouts
        .filter((callout) => callout.hex)
        .map((callout) => {
          const [x, z] = hexToWorld(callout.hex!, center);
          // Stack callouts on the same or neighbouring hexes so they never overprint.
          const stacked = calloutStack(callouts, callout);
          return (
            <Html
              key={callout.id}
              position={[x, CALLOUT_Y + stacked * 0.8, z]}
              center
              // Newest on top, whatever the depth, so the latest order is always legible.
              zIndexRange={[100 + (callout.id % 1000), 100 + (callout.id % 1000)]}
              style={{ pointerEvents: "none" }}
            >
              <CalloutCard callout={callout} />
            </Html>
          );
        })}
    </>
  );
}

/** How many older callouts sit on this callout's hex or a neighbouring one (its stack height). */
export function calloutStack(callouts: Callout[], callout: Callout): number {
  return callouts.filter((other) => other.hex && callout.hex && other.id < callout.id && hexDistance(other.hex, callout.hex) <= 1).length;
}

function CalloutCard({ callout }: { callout: Callout }) {
  const mine = callout.faction === "free_banners";
  const classes = ["callout", `callout-${callout.kind}`, mine ? "mine" : "theirs", callout.repeat ? "repeat" : ""].join(" ");
  if (callout.kind === "rule") {
    const [when, then] = callout.text.split(" → ");
    return (
      <div className={classes} data-callout-id={callout.id}>
        {!callout.repeat && (
          <span className="callout-head">
            {callout.faction && <Sigil faction={callout.faction} size={14} />}
            <span className="callout-title">{callout.title}</span>
          </span>
        )}
        <span className="callout-line">
          {then !== undefined && !callout.repeat && <span className="rule-when">{when} </span>}
          <span className="rule-then">→ {then ?? when}</span>
        </span>
      </div>
    );
  }
  return (
    <div className={classes} data-callout-id={callout.id}>
      <span className="callout-title">{callout.title}</span>
      <span className="callout-text">{callout.text}</span>
    </div>
  );
}

/** While you plan, a pennant over each charge you must bring out (the Saltmarsh Column). */
function WardMarkers({ center }: { center: { x: number; z: number } }) {
  const stage = useGame((s) => s.stage);
  const view = useShownView();
  const captureMode = useCaptureStore((s) => s.captureMode);
  if (captureMode || (stage !== "command" && stage !== "deploy")) return null;
  return (
    <>
      {view.squads
        .filter((squad) => squad.noncombatant && squad.status === "active" && squad.hex)
        .map((squad) => {
          const [x, z] = hexToWorld(squad.hex!, center);
          return (
            <Html key={squad.id} position={[x, CALLOUT_Y, z]} center zIndexRange={[20, 20]} style={{ pointerEvents: "none" }}>
              <div className="ward-marker">
                <span className="callout-title">{rosterName(squad)}</span>
                <span className="ward-must">Must escape</span>
              </div>
            </Html>
          );
        })}
    </>
  );
}

function CameraEmphasis({ center, shot }: { center: { x: number; z: number }; shot: CameraShot }) {
  const focus = useGame((s) => s.focus);
  const controls = useThree((state) => state.controls) as OrbitControlsImpl | null;
  const base = useMemo(() => new THREE.Vector3(...shot.target), [shot]);
  const goal = useMemo(() => new THREE.Vector3(), []);

  useFrame((_, dt) => {
    if (!controls) return;
    if (focus) {
      const [x, z] = hexToWorld(focus, center);
      goal.set(x, base.y, z).sub(base).multiplyScalar(LEAN).add(base);
    } else {
      goal.copy(base);
    }
    if (controls.target.distanceToSquared(goal) < 1e-6) return;
    controls.target.lerp(goal, 1 - Math.exp(-dt * LEAN_RATE));
    controls.update();
  });
  return null;
}
