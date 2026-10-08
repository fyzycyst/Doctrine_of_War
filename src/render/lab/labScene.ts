import { hexDistance, hexKey, hexNeighbors, type BoardLayout, type HexCoord } from "../../game/board";
import { emberFord } from "../../game/engine/scenarios/emberFord";
import { firstBreach } from "../../game/engine/scenarios/firstBreach";
import { holdForDawn } from "../../game/engine/scenarios/holdForDawn";
import { saltmarshColumn } from "../../game/engine/scenarios/saltmarshColumn";
import { cinderRoad1 } from "../../game/engine/scenarios/cinderRoad1";
import { stressScenario } from "./stressScenario";
import { twoObjectivesBoard, twoObjectivesSquads } from "./twoObjectives";
import { cinderRoad2 } from "../../game/engine/scenarios/cinderRoad2";
import { cinderRoad5 } from "../../game/engine/scenarios/cinderRoad5";
import { cinderRoad6 } from "../../game/engine/scenarios/cinderRoad6";
import type { DioramaVisibility } from "../Diorama";
import type { DioramaSquad } from "../figures/types";
import { dioramaSquads, lightingFor } from "../fromEngine";
import { boardCenter, hexToWorld } from "../hexWorld";
import type { TimeOfDay } from "../skins/types";

/**
 * Lab scenes, mapped from the engine's scenario format (what the real game will
 * feed the Diorama) through `fromEngine`: First Breach, Ember Ford, The
 * Saltmarsh Column, Hold for Dawn, and the 14-squad readability/performance
 * fixture (stressScenario.ts). First Breach shows one depleted Host
 * squad and one renowned Banner squad.
 */
export interface LabScene {
  board: BoardLayout;
  squads: DioramaSquad[];
  timeOfDay: TimeOfDay;
  deployment: HexCoord[];
  /** Objective hex centre in world space, for the close shot. */
  focus: [number, number, number];
  /** Exit hexes for an escape win (Saltmarsh's southern edge), for `exit=1`. */
  exits?: HexCoord[];
}

const OVERRIDES: Record<string, Partial<DioramaSquad>> = {
  ford_reavers: { strength: 38, cohesion: 32 },
  greyford_shields: { cohesion: 64, renowned: true },
};

function toScene(
  board: BoardLayout,
  squads: DioramaSquad[],
  timeOfDay: TimeOfDay,
  overrides: Record<string, Partial<DioramaSquad>> = {},
): LabScene {
  const objective = board.hexes.find((h) => h.objectiveId) ?? board.hexes[Math.floor(board.hexes.length / 2)];
  const [fx, fz] = hexToWorld(objective.coord, boardCenter(board));
  return {
    board,
    squads: squads.map((s) => ({ ...s, ...overrides[s.id] })),
    timeOfDay,
    deployment: board.hexes.filter((h) => h.deploymentFaction === "free_banners").map((h) => h.coord),
    focus: [fx, 0.4, fz],
  };
}

export const LAB_SCENES = {
  firstBreach: toScene(firstBreach.board, dioramaSquads(firstBreach.squads), lightingFor(firstBreach.timeOfDay), OVERRIDES),
  emberFord: toScene(emberFord.board, dioramaSquads(emberFord.squads), lightingFor(emberFord.timeOfDay)),
  stress: toScene(stressScenario.board, dioramaSquads(stressScenario.squads), "dusk"),
  saltmarsh: {
    ...toScene(saltmarshColumn.board, dioramaSquads(saltmarshColumn.squads), lightingFor(saltmarshColumn.timeOfDay)),
    exits: saltmarshColumn.winCondition.kind === "escapeEdge" ? saltmarshColumn.winCondition.edgeHexes : undefined,
  },
  holdForDawn: toScene(holdForDawn.board, dioramaSquads(holdForDawn.squads), lightingFor(holdForDawn.timeOfDay)),
  // M2: Cinder Road battle 1 (the barricade), and a two-objective board (wagons + sluice) until battle 2's lands.
  cinderRoad1: toScene(cinderRoad1.board, dioramaSquads(cinderRoad1.squads), lightingFor(cinderRoad1.timeOfDay)),
  twoObjectives: toScene(twoObjectivesBoard, twoObjectivesSquads, "dusk"),
  // Cinder Road 2, Strike the Wagon Park, by day.
  cinderRoad2: toScene(cinderRoad2.board, dioramaSquads(cinderRoad2.squads), lightingFor(cinderRoad2.timeOfDay)),
  // Cinder Road on the Greyford Gate board (keys follow the scenario files): battle 4, Cut
  // the Retreat (cinderRoad5.ts, the gate a dressed wall), and battle 5, Break the
  // Strongpoint (cinderRoad6.ts, the gate the objective).
  cinderRoad5: toScene(cinderRoad5.board, dioramaSquads(cinderRoad5.squads), lightingFor(cinderRoad5.timeOfDay)),
  cinderRoad6: toScene(cinderRoad6.board, dioramaSquads(cinderRoad6.squads), lightingFor(cinderRoad6.timeOfDay)),
} as const;

export type LabSceneId = keyof typeof LAB_SCENES;

/** Next board hex in roughly the facing direction (for lab march/lunge demos). */
export function stepToward(from: HexCoord, facing: number, board: BoardLayout, occupied: Set<string>): HexCoord | null {
  const center = boardCenter(board);
  const [x0, z0] = hexToWorld(from, center);
  const want = [Math.cos(facing), -Math.sin(facing)];
  const onBoard = new Set(board.hexes.map((h) => hexKey(h.coord)));
  const options = hexNeighbors(from)
    .filter((n) => onBoard.has(hexKey(n)) && !occupied.has(hexKey(n)) && hexDistance(n, from) === 1)
    .map((n) => {
      const [x, z] = hexToWorld(n, center);
      const len = Math.hypot(x - x0, z - z0);
      return { n, score: ((x - x0) * want[0] + (z - z0) * want[1]) / len };
    })
    .sort((a, b) => b.score - a.score);
  return options[0]?.n ?? null;
}

/**
 * Lab fog-of-war demo from the Banners' point of view: they see `sight` hexes
 * around their squads. Unseen Host squads are either last-known silhouettes
 * (every other one, as if glimpsed earlier) or not drawn at all. The real game
 * derives the same shape from the engine's `visibleState`.
 */
export function fogOfWar(scene: LabScene, sight: number): { squads: DioramaSquad[]; visibility: DioramaVisibility } {
  const banners = scene.squads.filter((s) => s.faction === "free_banners");
  const visibleHexes = scene.board.hexes
    .map((h) => h.coord)
    .filter((c) => banners.some((b) => hexDistance(b.hex, c) <= sight));
  const seen = new Set(visibleHexes.map(hexKey));
  const squads: DioramaSquad[] = [];
  const lastKnown: DioramaVisibility["lastKnown"] = [];
  let unseen = 0;
  scene.squads.forEach((s) => {
    if (s.faction === "free_banners" || seen.has(hexKey(s.hex))) squads.push(s);
    else if (unseen++ % 2 === 0) lastKnown.push({ squadId: s.id, hex: s.hex, faction: s.faction, strength: s.strength, cohesion: s.cohesion });
  });
  return { squads, visibility: { visibleHexes, lastKnown } };
}
