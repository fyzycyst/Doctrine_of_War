import { hexDistance, hexKey, hexNeighbors, type BoardLayout, type HexCoord } from "../../game/board";
import { emberFord } from "../../game/engine/scenarios/emberFord";
import { firstBreach } from "../../game/engine/scenarios/firstBreach";
import { readabilityScenario } from "../../game/readabilityScenario";
import type { DioramaSquad } from "../figures/types";
import { dioramaSquads, lightingFor } from "../fromEngine";
import { boardCenter, hexToWorld } from "../hexWorld";
import type { TimeOfDay } from "../skins/types";

/**
 * Lab scenes, mapped from the engine's scenario format (what the real game will
 * feed the Diorama) through `fromEngine`: First Breach, Ember Ford, and the
 * legacy 14-squad readability fixture. First Breach shows one depleted Host
 * squad and one renowned Banner squad.
 */
export interface LabScene {
  board: BoardLayout;
  squads: DioramaSquad[];
  timeOfDay: TimeOfDay;
  deployment: HexCoord[];
  fogDemo: Record<string, number>;
  /** Objective hex centre in world space, for the close shot. */
  focus: [number, number, number];
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
    fogDemo: Object.fromEntries(
      board.hexes.filter((h) => h.deploymentFaction === "ashen_host").map((h) => [hexKey(h.coord), 3]),
    ),
    focus: [fx, 0.4, fz],
  };
}

export const LAB_SCENES = {
  firstBreach: toScene(firstBreach.board, dioramaSquads(firstBreach.squads), lightingFor(firstBreach.timeOfDay), OVERRIDES),
  emberFord: toScene(emberFord.board, dioramaSquads(emberFord.squads), lightingFor(emberFord.timeOfDay)),
  stress: toScene(
    readabilityScenario.board!,
    dioramaSquads(readabilityScenario.squads.filter((s) => s.hex).map((s) => ({ ...s, hex: s.hex! }))),
    "dusk",
  ),
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
