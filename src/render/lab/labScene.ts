import { hexDistance, hexKey, hexNeighbors, type BoardLayout, type HexCoord } from "../../game/board";
import { readabilityScenario } from "../../game/readabilityScenario";
import { firstBreachScenario } from "../../game/scenario";
import type { Scenario } from "../../game/types";
import type { DioramaSquad } from "../figures/types";
import { boardCenter, hexToWorld } from "../hexWorld";

/**
 * Lab scenes: the tutorial (First Breach) and the 14-squad readability fixture.
 * Squads sit on their scenario hexes, Banners facing west, Host facing east.
 * First Breach shows one depleted Host squad and one renowned Banner squad.
 */
export interface LabScene {
  board: BoardLayout;
  squads: DioramaSquad[];
  deployment: HexCoord[];
  fogDemo: Record<string, number>;
  /** Objective hex centre in world space, for the close shot. */
  focus: [number, number, number];
}

const OVERRIDES: Record<string, Partial<DioramaSquad>> = {
  ford_reavers: { strength: 38, cohesion: 32 },
  greyford_shields: { cohesion: 64, renowned: true },
};

function toScene(scenario: Scenario): LabScene {
  const board = scenario.board!;
  const squads = scenario.squads
    .filter((s) => s.hex)
    .map((s) => ({
      id: s.id,
      faction: s.faction,
      hex: s.hex!,
      strength: s.strength,
      cohesion: s.cohesion,
      facing: s.faction === "free_banners" ? Math.PI : 0,
      ...OVERRIDES[s.id],
    }));
  const objective = board.hexes.find((h) => h.objectiveId) ?? board.hexes[0];
  const [fx, fz] = hexToWorld(objective.coord, boardCenter(board));
  return {
    board,
    squads,
    deployment: board.hexes.filter((h) => h.deploymentFaction === "free_banners").map((h) => h.coord),
    fogDemo: Object.fromEntries(
      board.hexes.filter((h) => h.deploymentFaction === "ashen_host").map((h) => [hexKey(h.coord), 3]),
    ),
    focus: [fx, 0.4, fz],
  };
}

export const LAB_SCENES = {
  breach: toScene(firstBreachScenario),
  stress: toScene(readabilityScenario),
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
