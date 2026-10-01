// In-canvas playback pieces (T06): callouts anchored above squads. The camera does not
// move for playback (T19); the acting company is emphasised on the board instead
// (BattleBoard passes the focus hex to the Diorama). Rendered inside BattleBoard's <Canvas>.
import { Html } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import type { BoardLayout } from "../../game/board";
import { boardCenter, hexToWorld } from "../../render/hexWorld";
import { useCaptureStore } from "../captureStore";
import { useGame, useShownView, type Callout } from "../game/gameStore";
import { layoutCallouts, type CalloutBox } from "../playback/callouts";
import { rosterName } from "../game/view";
import { Sigil } from "./glyphs";

/** Height above the board at which callouts float (over the squad's banner). */
const CALLOUT_Y = 1.45;

export function PlaybackStage({ board }: { board: BoardLayout }) {
  const allCallouts = useGame((s) => s.callouts);
  const hidden = useCaptureStore((s) => s.captureMode && !s.keepCallouts);
  const callouts = hidden ? [] : allCallouts;
  const center = useMemo(() => boardCenter(board), [board]);
  const onBoard = callouts.filter((callout) => callout.hex);
  const slots = useRef(new Map<number, HTMLDivElement>());
  const anchor = useMemo(() => new THREE.Vector3(), []);

  // Declutter in screen space (T19): each frame, lift banners clear of each other where the
  // camera now puts them. The player's banners keep their place; the Host's make way.
  useFrame(({ camera, size }) => {
    const boxes: CalloutBox[] = [];
    for (const callout of onBoard) {
      const slot = slots.current.get(callout.id);
      if (!slot) continue;
      const [x, z] = hexToWorld(callout.hex!, center);
      anchor.set(x, CALLOUT_Y, z).project(camera);
      boxes.push({
        id: callout.id,
        cx: ((anchor.x + 1) / 2) * size.width,
        cy: ((1 - anchor.y) / 2) * size.height,
        w: slot.offsetWidth,
        h: slot.offsetHeight,
        mine: callout.faction === "free_banners",
      });
    }
    const lifts = layoutCallouts(boxes);
    for (const [id, lift] of lifts) {
      const slot = slots.current.get(id);
      const transform = `translateY(${-Math.round(lift)}px)`;
      if (slot && slot.style.transform !== transform) slot.style.transform = transform;
    }
  });

  return (
    <>
      <WardMarkers center={center} />
      {onBoard.map((callout) => {
        const [x, z] = hexToWorld(callout.hex!, center);
        const mine = callout.faction === "free_banners";
        // The player's banners draw over the Host's; newest on top within each.
        const layer = (mine ? 400 : 100) + (callout.id % 250);
        return (
          <Html key={callout.id} position={[x, CALLOUT_Y, z]} center zIndexRange={[layer, layer]} style={{ pointerEvents: "none" }}>
            <div
              className="callout-slot"
              ref={(element) => {
                if (element) slots.current.set(callout.id, element);
                else slots.current.delete(callout.id);
              }}
            >
              <CalloutCard callout={callout} />
            </div>
          </Html>
        );
      })}
    </>
  );
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
