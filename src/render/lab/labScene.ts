import { hexDistance, hexKey, hexNeighbors, type BoardLayout, type HexCoord } from "../../game/board";
import { emberFord } from "../../game/engine/scenarios/emberFord";
import { firstBreach } from "../../game/engine/scenarios/firstBreach";
import { stressScenario } from "./stressScenario";
import { placeholderBoard } from "../showcase/placeholderBoards";
import type { DioramaVisibility } from "../Diorama";
import type { DioramaSquad } from "../figures/types";
import { dioramaSquads, lightingFor } from "../fromEngine";
import { boardCenter, hexToWorld } from "../hexWorld";
import type { TimeOfDay } from "../skins/types";

/**
 * Lab scenes, mapped from the engine's scenario format (what the real game will
 * feed the Diorama) through `fromEngine`: First Breach, Ember Ford, and the
 * 14-squad readability/performance fixture (stressScenario.ts). First Breach shows one depleted Host
 * squad and one renowned Banner squad.
 */
export interface LabScene {
  board: BoardLayout;
  squads: DioramaSquad[];
  timeOfDay: TimeOfDay;
  deployment: HexCoord[];
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
    focus: [fx, 0.4, fz],
  };
}

export const LAB_SCENES = {
  firstBreach: toScene(firstBreach.board, dioramaSquads(firstBreach.squads), lightingFor(firstBreach.timeOfDay), OVERRIDES),
  emberFord: toScene(emberFord.board, dioramaSquads(emberFord.squads), lightingFor(emberFord.timeOfDay)),
  stress: toScene(stressScenario.board, dioramaSquads(stressScenario.squads), "dusk"),
  // Mocks until the engine ships The Saltmarsh Column and Hold for Dawn.
  saltmarsh: toScene(
    placeholderBoard("saltmarsh"),
    dioramaSquads([
      { id: "the_column", faction: "free_banners", hex: { q: 3, r: 2 }, strength: 90, cohesion: 58, noncombatant: true },
      { id: "column_van", faction: "free_banners", hex: { q: 4, r: 2 }, strength: 70, cohesion: 66 },
      { id: "column_rear", faction: "free_banners", hex: { q: 3, r: 3 }, strength: 62, cohesion: 60 },
      { id: "marsh_raiders", faction: "ashen_host", hex: { q: 0, r: 2 }, strength: 74, cohesion: 64 },
      { id: "reed_stalkers", faction: "ashen_host", hex: { q: 1, r: 2 }, strength: 58, cohesion: 60 },
      { id: "fen_hounds", faction: "ashen_host", hex: { q: 0, r: 4 }, strength: 60, cohesion: 62 },
    ]),
    "rainGrey",
  ),
  holdForDawn: toScene(
    placeholderBoard("holdForDawn"),
    dioramaSquads([
      { id: "last_shields", faction: "free_banners", hex: { q: 4, r: 2 }, strength: 72, cohesion: 64, renown: { title: "The Gatebreakers" } },
      { id: "last_archers", faction: "free_banners", hex: { q: 4, r: 1 }, strength: 60, cohesion: 62 },
      { id: "dawn_riders", faction: "free_banners", hex: { q: 4, r: 3 }, strength: 58, cohesion: 70 },
      { id: "siege_host", faction: "ashen_host", hex: { q: 1, r: 2 }, strength: 92, cohesion: 72 },
      { id: "host_flank", faction: "ashen_host", hex: { q: 2, r: 0 }, strength: 80, cohesion: 66 },
      { id: "host_reserve", faction: "ashen_host", hex: { q: 0, r: 3 }, strength: 84, cohesion: 70 },
    ]),
    "predawn",
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
