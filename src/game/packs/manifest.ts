// parsePackManifest: a pack read as untrusted data (P1). Structure only; references
// and cross-pack uniqueness are lintPacks()'s job.
import type { CampaignDefinition } from "../campaign/types";
import type { Action, Condition, DefeatCondition, Doctrine, EngineScenario, TargetSelector, WinCondition } from "../engine/types";
import { bool, fail, id, int, list, num, object, oneOf, opt, prose, record, req, text, union, type Reader } from "./schema";
import type { PackManifest } from "./types";

const MAX_BOARD = 16;
const FACTIONS = ["ashen_host", "free_banners"] as const;
const ROLES = ["frontline", "skirmish", "support", "siege", "cavalry"] as const;
const TERRAIN = ["road", "ridge", "ford", "wall", "field", "ruin", "river", "marsh", "reeds"] as const;
const WEATHER = ["clear", "rain", "mist", "ashWind"] as const;
const HOURS = ["day", "nightFires", "rainGrey", "predawn", "sunrise"] as const;
const STAT = oneOf("cohesion", "strength");

const faction = oneOf(...FACTIONS);
const literalTrue: Reader<true> = (value, path) => {
  if (value !== true) fail(path, "must be true when present");
  return true;
};
const role = oneOf(...ROLES);
const hex = object({ q: req(int(0, MAX_BOARD - 1)), r: req(int(0, MAX_BOARD - 1)) });
const range = int(1, 8);
const percent = int(0, 100);

const enemySelectors = {
  nearestEnemy: {},
  weakestEnemy: { stat: req(STAT), range: opt(range) },
  overextendedEnemy: { range: opt(range) },
  fightingEnemy: {},
  objective: { side: req(oneOf("enemy")), objectiveId: opt(id) },
};
const enemySelector = union<TargetSelector>(enemySelectors);
const targetSelector = union<TargetSelector>({
  ...enemySelectors,
  weakestAlly: { stat: req(STAT) },
  ward: {},
  objective: { side: req(oneOf("own", "enemy")), objectiveId: opt(id) },
  exitEdge: {},
});

const condition = union<Condition>({
  always: {},
  selfCohesionBelow: { value: req(percent) },
  selfStrengthBelow: { value: req(percent) },
  enemyAdjacent: {},
  enemyWithin: { range: req(range) },
  fightBeyond: { range: req(range) },
  enemyBelow: { stat: req(STAT), value: req(percent), range: req(range) },
  allyAdjacentBelow: { stat: req(STAT), value: req(percent) },
  allyBelow: { stat: req(STAT), value: req(percent) },
  enemyOverextended: { range: opt(range) },
  objectiveThreatened: { objectiveId: opt(id) },
  atObjective: { objectiveId: opt(id) },
  retreatOpen: {},
  wardNear: { range: req(range), minRange: opt(range) },
});

const action = union<Action>({
  hold: {},
  advance: { toward: req(targetSelector) },
  attack: { target: req(enemySelector), power: opt(int(-10, 10)) },
  bombard: { range: req(range) },
  fallBack: { hexes: req(oneOf(1, 2)) },
  rally: {},
  counterCharge: { target: req(enemySelector) },
});

export const readDoctrine: Reader<Doctrine> = object({
  id: req(id),
  faction: req(faction),
  name: req(text(60)),
  flavor: req(prose(300)),
  rules: req(list(object({ id: req(id), label: req(text(90)), when: req(condition), then: req(action) }), 12, 1)),
  passives: req(object({ defense: req(int(-10, 10)), cohesion: req(int(-20, 20)), counter: req(int(-10, 10)) })),
}) as Reader<Doctrine>;

const winCondition = union<WinCondition>({
  holdObjective: { objectiveId: req(id) },
  escapeEdge: { edgeHexes: req(list(hex, 64, 1)), count: req(int(1, 30)), mustEscape: opt(list(id, 30)) },
  destroySquads: { squadIds: req(list(id, 30, 1)), count: opt(int(1, 30)) },
  holdThenBreak: { objectiveId: req(id), dawnPhase: req(int(1, 20)), squadIds: req(list(id, 30, 1)), count: opt(int(1, 30)) },
});

const defeatCondition = union<DefeatCondition>({
  enemyEscape: { edgeHexes: req(list(hex, 64, 1)), count: req(int(1, 30)) },
  squadsLost: { count: req(int(1, 30)) },
});

const orders = record(id, id, 30);

export const readScenario: Reader<EngineScenario> = object({
  id: req(id),
  title: req(text(80)),
  briefing: req(prose(1200)),
  playerFaction: req(faction),
  initiativeSide: req(faction),
  maxPhases: req(int(1, 20)),
  board: req(
    object({
      width: req(int(1, MAX_BOARD)),
      height: req(int(1, MAX_BOARD)),
      hexes: req(
        list(
          object({
            coord: req(hex),
            terrain: req(oneOf(...TERRAIN)),
            label: opt(text(60)),
            objectiveId: opt(id),
            deploymentFaction: opt(faction),
          }),
          MAX_BOARD * MAX_BOARD,
          1,
        ),
      ),
    }),
  ),
  squads: req(
    list(
      object({
        id: req(id),
        name: req(text(60)),
        faction: req(faction),
        role: req(role),
        hex: req(hex),
        strength: req(int(1, 100)),
        cohesion: req(int(1, 100)),
        resolve: req(int(-3, 3)),
        doctrineId: req(id),
        renown: opt(object({ title: req(text(60)) })),
        noncombatant: opt(literalTrue),
      }),
      40,
      2,
    ),
  ),
  objectives: req(
    list(
      object({
        id: req(id),
        name: req(text(60)),
        description: req(prose(300)),
        hex: req(hex),
        integrity: req(int(1, 100)),
        defender: req(faction),
      }),
      8,
    ),
  ),
  playerDoctrineIds: req(list(id, 20, 1)),
  hostSchedule: req(list(object({ phase: req(int(1, 20)), intent: req(prose(300)), orders: req(orders) }), 20)),
  winCondition: req(winCondition),
  defeatConditions: opt(list(defeatCondition, 4)),
  timeoutOutcome: opt(oneOf("defeat", "stalemate")),
  stalemateRequires: opt(object({ minEnemyBroken: req(int(0, 30)), targetsOnly: opt(bool) })),
  timeOfDay: opt(oneOf(...HOURS)),
  timeOfDayByPhase: opt(record((value, path) => String(int(1, 20)(Number(value), path)), oneOf(...HOURS), 20)),
  curatedSeed: opt(int(0, 0xffffffff)),
  forecast: opt(object({ start: req(oneOf(...WEATHER)), shiftChance: req(num(0, 1)), shifts: req(list(oneOf(...WEATHER), 4, 1)) })),
  referencePlans: opt(object({ intended: req(orders), bad: req(orders) })),
}) as Reader<EngineScenario>;

const profile = object({ strength: req(int(1, 100)), cohesion: req(int(1, 100)) });

export const readCampaign: Reader<CampaignDefinition> = object({
  id: req(id),
  title: req(text(80)),
  mode: opt(oneOf("fixed", "roll")),
  companies: req(
    list(
      object({
        id: req(id),
        name: req(text(60)),
        role: req(role),
        startingResolve: opt(int(-3, 3)),
        profile: opt(profile),
        joins: opt(id),
      }),
      64,
      1,
    ),
  ),
  battles: req(
    list(
      object({
        id: req(id),
        title: req(text(80)),
        scenarioId: req(id),
        call: opt(
          object({
            flex: opt(record(id, object({ roles: req(list(role, 5, 2)), doctrines: req(record(role, id, 5)) }), 4)),
            locked: opt(record(id, id, 30)),
          }),
        ),
        placeholder: opt(bool),
        slots: req(record(id, id, 30)),
      }),
      11,
      1,
    ),
  ),
}) as Reader<CampaignDefinition>;

const revision = object({ pack: req(oneOf(1)), content: req(int(1, 10_000)), rules: req(int(1, 10_000)) });

const readManifest: Reader<PackManifest> = object({
  id: req(id),
  title: req(text(80)),
  revision: req(revision),
  readsContent: req(list(int(1, 10_000), 100, 1)),
  campaigns: req(list(readCampaign, 12)),
  scenarios: req(list(readScenario, 80)),
  doctrines: req(list(readDoctrine, 40)),
  skirmishes: req(list(object({ id: req(id), title: req(text(80)), scenarioId: req(id) }), 80)),
}) as Reader<PackManifest>;

/**
 * Validates an untrusted manifest and returns a clean copy rebuilt field by field (unknown
 * fields refused, every id, number, list and size bounded). Throws a PackError naming the
 * first problem. Compiled-in packs go through it too, exactly as an import would.
 */
export function parsePackManifest(raw: unknown): PackManifest {
  return readManifest(raw, "pack");
}
