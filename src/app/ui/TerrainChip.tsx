// The terrain chip (T19): with one of your companies selected while planning, the hex
// under the cursor shows its ground, read against where the company stands.
import { Html } from "@react-three/drei";
import { useMemo } from "react";
import { sameHex, type BoardLayout } from "../../game/board";
import { timeOfDayAt } from "../../game/engine";
import { boardCenter, hexToWorld } from "../../render/hexWorld";
import { useCaptureStore } from "../captureStore";
import { useGame } from "../game/gameStore";
import { terrainReadout, type TerrainReadout } from "../game/terrain";
import { rosterName } from "../game/view";
import { useAppStore } from "../store";

const signed = (n: number) => (n > 0 ? `+${n}` : n < 0 ? `−${-n}` : "±0");
/** Against the company's own hex. */
const COMPARE = { stronger: "Better ground than now", weaker: "Worse ground than now", same: "No better than now" } as const;

/** The chip itself (plain DOM, so it is testable without WebGL). */
export function TerrainChipCard({ readout, company }: { readout: TerrainReadout; company: string }) {
  return (
    <div className={`terrain-chip ${readout.compare}`} role="note" aria-label={`Terrain for ${company}: ${readout.name}`}>
      <span className="terrain-name">{readout.name}</span>
      {readout.passable && (
        <span className="terrain-stats">
          <span>
            Defense {signed(readout.defense)}
            {readout.defenseDelta !== 0 && <em> ({signed(readout.defenseDelta)})</em>}
          </span>
          <span>
            Sight {readout.sight}
            {readout.sightDelta !== 0 && <em> ({signed(readout.sightDelta)})</em>}
          </span>
        </span>
      )}
      {readout.notes.length > 0 && <span className="terrain-notes">{readout.notes.join(" · ")}</span>}
      {readout.passable && (
        <span className="terrain-compare">{COMPARE[readout.compare]}</span>
      )}
    </div>
  );
}

/**
 * In the board's canvas: the chip beside the hovered hex. Terrain is public (commanders
 * have maps; see docs/ENGINE.md, fog), so the chip works on fogged hexes too, but it
 * reads the map only: never the squads, so it says nothing of what stands on a hex.
 */
export function TerrainChip({ board }: { board: BoardLayout }) {
  const hovered = useAppStore((s) => s.hoveredHex);
  const selectedId = useAppStore((s) => s.selectedSquadId);
  const stage = useGame((s) => s.stage);
  const scenario = useGame((s) => s.scenario);
  const view = useGame((s) => s.view);
  const captureMode = useCaptureStore((s) => s.captureMode);
  const center = useMemo(() => boardCenter(board), [board]);
  const squad = view.squads.find((item) => item.id === selectedId && item.faction === view.viewer && item.status === "active" && !item.noncombatant);
  if (captureMode || (stage !== "command" && stage !== "deploy") || !hovered || !squad?.hex || sameHex(hovered, squad.hex)) return null;
  const timeOfDay = timeOfDayAt(scenario, Math.min(view.phase, view.maxPhases));
  const readout = terrainReadout(scenario, { weather: view.weather, timeOfDay }, hovered, squad.hex);
  if (!readout) return null;
  const [x, z] = hexToWorld(hovered, center);
  return (
    <Html position={[x, 0.45, z]} zIndexRange={[60, 60]} style={{ pointerEvents: "none" }}>
      <TerrainChipCard readout={readout} company={rosterName(squad)} />
    </Html>
  );
}
