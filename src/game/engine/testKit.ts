// Small builders for engine unit tests: an open field board, one-line squads and
// single-purpose doctrines. Not used by the game itself.
import type { BoardLayout, HexCoord, TerrainType } from "../board";
import type { EngineContext, EventBody } from "./context";
import { doctrineLibrary } from "./doctrines";
import { createInitialState, type BattleOptions } from "./resolvePhase";
import { createRng } from "./rng";
import type {
  Action,
  Condition,
  Doctrine,
  DoctrineLibrary,
  EngineEvent,
  EngineScenario,
  EngineState,
  FactionId,
  SquadSetup,
} from "./types";
import type { ActiveSquad } from "./world";

export function openBoard(
  width = 7,
  height = 5,
  terrain: Record<string, TerrainType> = {},
): BoardLayout {
  return {
    width,
    height,
    hexes: Array.from({ length: width }, (_, q) =>
      Array.from({ length: height }, (_, r) => ({
        coord: { q, r },
        terrain: terrain[`${q},${r}`] ?? ("field" as TerrainType),
      })),
    ).flat(),
  };
}

export function squad(
  id: string,
  faction: FactionId,
  hex: HexCoord,
  overrides: Partial<SquadSetup> = {},
): SquadSetup {
  return {
    id,
    name: id,
    faction,
    role: "frontline",
    hex,
    strength: 80,
    cohesion: 80,
    resolve: 0,
    doctrineId: faction === "free_banners" ? "test_hold_fb" : "test_hold_ah",
    ...overrides,
  };
}

export function doctrine(
  id: string,
  faction: FactionId,
  rules: [Condition, Action][],
  passives = { defense: 0, cohesion: 0, counter: 0 },
): Doctrine {
  return {
    id,
    faction,
    name: id,
    flavor: "test",
    passives,
    rules: rules.map(([when, then], index) => ({ id: `${id}_${index}`, label: `${id} rule ${index}`, when, then })),
  };
}

export function library(...extra: Doctrine[]): DoctrineLibrary {
  const base = [
    doctrine("test_hold_fb", "free_banners", [[{ kind: "always" }, { kind: "hold" }]]),
    doctrine("test_hold_ah", "ashen_host", [[{ kind: "always" }, { kind: "hold" }]]),
    ...extra,
  ];
  return { ...doctrineLibrary, ...Object.fromEntries(base.map((item) => [item.id, item])) };
}

export function scenario(overrides: Partial<EngineScenario> & { squads: SquadSetup[] }): EngineScenario {
  return {
    id: "test",
    title: "Test",
    briefing: "",
    playerFaction: "free_banners",
    initiativeSide: "ashen_host",
    maxPhases: 1,
    board: openBoard(),
    objectives: [],
    playerDoctrineIds: Object.keys(library()),
    hostSchedule: [],
    winCondition: { kind: "escapeEdge", edgeHexes: [], count: 99 },
    ...overrides,
  };
}

/** A live ActionContext over a fresh state, collecting emitted events. */
export function actionContext(
  scen: EngineScenario,
  doctrines: DoctrineLibrary = library(),
  battle: BattleOptions = {},
) {
  const state: EngineState = createInitialState(scen, battle);
  const events: EventBody[] = [];
  const ctx: EngineContext = {
    state,
    scenario: scen,
    doctrines,
    rng: createRng(state.rngState),
    phase: 1,
    beat: 1,
    emit: (event) => events.push(event),
  };
  const get = (id: string) => state.squads.find((item) => item.id === id) as ActiveSquad;
  return { state, ctx, events, get };
}

export const kinds = (events: (EngineEvent | EventBody)[]) => events.map((event) => event.kind);
