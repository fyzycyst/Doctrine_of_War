// Test kit for Roll campaigns and their saves: a small Roll campaign under the allowlisted
// id "cinder_road" (over two shipped boards), a registry that offers it beside the intro,
// and a helper that fights its current battle to a chosen ending. Not used by the game.
import { createInitialState } from "../engine/resolvePhase";
import { emberFord } from "../engine/scenarios/emberFord";
import { firstBreach } from "../engine/scenarios/firstBreach";
import type { EngineState } from "../engine/types";
import { createRegistry, firstCall } from "../packs/registry";
import { recordBattle } from "./campaign";
import { assembleBattle, recommendedForce } from "./roll";
import type { Assignment, CampaignDefinition, CampaignState } from "./types";

export const testRoad: CampaignDefinition = {
  id: "cinder_road",
  title: "Test Road",
  mode: "roll",
  companies: [
    { id: "r_shields", name: "Road Shields", role: "frontline", startingResolve: 1, profile: { strength: 84, cohesion: 74 } },
    { id: "r_bows", name: "Road Bows", role: "skirmish", profile: { strength: 66, cohesion: 70 } },
    { id: "r_banner", name: "Road Banner", role: "support", profile: { strength: 52, cohesion: 80 } },
    { id: "r_riders", name: "Road Riders", role: "cavalry", profile: { strength: 72, cohesion: 66 } },
    { id: "r_spears", name: "Road Spears", role: "frontline", profile: { strength: 78, cohesion: 70 } },
    { id: "r_pikes", name: "Road Pikes", role: "frontline", profile: { strength: 80, cohesion: 72 }, joins: "road_2" },
    { id: "r_lances", name: "Road Lances", role: "cavalry", profile: { strength: 70, cohesion: 64 }, joins: "road_2" },
    { id: "r_levy", name: "Road Levy", role: "frontline", profile: { strength: 70, cohesion: 62 }, joins: "road_2" },
    { id: "r_lamps", name: "Road Lamps", role: "support", profile: { strength: 54, cohesion: 80 }, joins: "road_2" },
    { id: "r_archers", name: "Road Archers", role: "skirmish", profile: { strength: 64, cohesion: 68 }, joins: "road_2" },
  ],
  battles: [
    {
      id: "road_1",
      title: "Road 1",
      scenarioId: "first_breach",
      slots: { greyford_shields: "r_shields", dawnwatch_archers: "r_bows", mercy_standard: "r_banner", stoneford_riders: "r_riders" },
      call: { flex: { stoneford_riders: { roles: ["cavalry", "frontline"], doctrines: { cavalry: "clean_counterstroke", frontline: "shield_the_line" } } } },
    },
    {
      id: "road_2",
      title: "Road 2",
      scenarioId: "ember_ford",
      slots: {
        tollbridge_pikes: "r_pikes",
        ashfen_bowmen: "r_archers",
        kestrel_lancers: "r_lances",
        mill_lane_guard: "r_shields",
        lanternbearers: "r_lamps",
        reedmarsh_levy: "r_levy",
        harrow_riders: "r_riders",
      },
    },
  ],
};

/** A longer Roll campaign for the size budget: `battles` battles alternating the two boards. */
export function longRoad(battles: number): CampaignDefinition {
  return {
    ...testRoad,
    battles: Array.from({ length: battles }, (_, index) => ({
      ...structuredClone(testRoad.battles[index === 0 ? 0 : index % 2]),
      id: index === 0 ? "road_1" : index === 1 ? "road_2" : `road_${index + 1}`,
    })),
  };
}

/** The First Call with the test road in place of the real Cinder Road (same allowlisted id). */
export const testPack = { ...firstCall, campaigns: [...firstCall.campaigns.filter((item) => item.id !== testRoad.id), testRoad] };
export const testRegistry = createRegistry([testPack]);

type Ending = { status?: "active" | "routed" | "destroyed" | "escaped"; strength?: number };

/** Fights the current battle of `def` to `status`, slots ending as given; returns the next state. */
export function fightRoll(
  def: CampaignDefinition,
  state: CampaignState,
  status: EngineState["status"],
  endings: Record<string, Ending> = {},
  assignment?: Assignment,
): CampaignState {
  const battle = def.battles[state.battleIndex];
  const scenario = [firstBreach, emberFord].find((item) => item.id === battle.scenarioId)!;
  const force = assignment ?? recommendedForce(def, state, scenario);
  const start = createInitialState(assembleBattle(def, state, scenario, force), { seed: 1, fortune: "off" });
  const final: EngineState = {
    ...start,
    status,
    squads: start.squads.map((squad) => {
      const end = endings[squad.id];
      if (!end) return squad;
      const gone = end.status === "routed" || end.status === "destroyed" || end.status === "escaped";
      return { ...squad, status: end.status ?? squad.status, strength: end.strength ?? (end.status === "destroyed" ? 0 : squad.strength), hex: gone ? null : squad.hex };
    }),
  };
  return recordBattle(def, state, final, { assignment: force });
}
