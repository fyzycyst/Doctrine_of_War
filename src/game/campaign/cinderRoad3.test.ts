// Cinder Road battle 3 (C3): Open a Road, its ground, posts and curated seed. The role sweeps
// and the role ablation play many battles, so they are *.sim.test.ts (npm run test:balance).
import { describe, expect, it } from "vitest";
import { playBattle } from "../engine/balance";
import { cinderRoad3, FAR_BANK_ROADS, NEAR_BANK_ROADS } from "../engine/scenarios/cinderRoad3";
import { registry } from "../packs/registry";
import { recordBattle } from "./campaign";
import { cinderRoad } from "./cinderRoad";
import { assembleBattle, lintRollCampaign, recommendedForce, rollSlots } from "./roll";
import { curatedRollState, templatePlan } from "./rollCalls";

const scenarios = registry.scenarios();
const plans = cinderRoad3.referencePlans!;
const index = cinderRoad.battles.findIndex((battle) => battle.scenarioId === cinderRoad3.id);

describe("Open a Road (Cinder Road, battle 3)", () => {
  it("is battle 3 of Cinder Road, in the First Call pack, linted clean", () => {
    expect(index).toBe(2);
    expect(registry.scenario(cinderRoad3.id)).toEqual(cinderRoad3);
    expect(lintRollCampaign(cinderRoad, scenarios)).toEqual([]);
  });

  it("is Ember Ford's own ground by daylight, crossed the other way: an exit win on the far-bank roads", () => {
    expect(cinderRoad3.timeOfDay).toBe("day");
    expect(cinderRoad3.winCondition).toEqual({ kind: "escapeEdge", edgeHexes: FAR_BANK_ROADS, count: 2 });
    expect(cinderRoad3.objectives).toEqual([]);
    // The Banners deploy on the same east bank as on the night of the burning bridges.
    for (const squad of cinderRoad3.squads.filter((item) => item.faction === "free_banners")) expect(squad.hex.q, squad.id).toBeGreaterThanOrEqual(5);
    for (const road of [...FAR_BANK_ROADS, ...NEAR_BANK_ROADS]) {
      expect(cinderRoad3.board.hexes.find((hex) => hex.coord.q === road.q && hex.coord.r === road.r)?.terrain).toBe("road");
    }
  });

  it("calls six named posts, one flex (the Mill Ford), from the army as battles 1-2 left it", () => {
    const state = curatedRollState(cinderRoad, scenarios, index);
    expect(state.history.map((entry) => entry.battleId)).toEqual(cinderRoad.battles.slice(0, index).map((battle) => battle.id));
    const slots = rollSlots(cinderRoad, state, cinderRoad3);
    expect(slots.map((slot) => slot.label)).toEqual(["The Cinder Ford", "The Ferry Road", "The North Bank", "Watcher's Rise", "The Mill Road", "The Mill Ford"]);
    expect(slots.filter((slot) => slot.flex).map((slot) => slot.slotId)).toEqual(["bows"]);
    expect(Object.keys(recommendedForce(cinderRoad, state, cinderRoad3))).toEqual(slots.map((slot) => slot.slotId));
  });

  it("the curated seed is a clean win: no company lost, the Mill Road guard breaks the reserve", () => {
    const final = playBattle(cinderRoad3, plans.intended, cinderRoad3.curatedSeed!, "on");
    expect(final.status).toBe("victory");
    expect(final.phase).toBeLessThanOrEqual(5);
    expect(final.squads.filter((squad) => squad.faction === "free_banners" && (squad.status === "routed" || squad.status === "destroyed"))).toEqual([]);
    expect(final.squads.find((squad) => squad.id === "scorchmark_spears")?.status).not.toBe("active");
  });

  it("records the curated win on the Roll after battles 1-2, completing the campaign as it stands", () => {
    const state = curatedRollState(cinderRoad, scenarios, index);
    const assignment = recommendedForce(cinderRoad, state, cinderRoad3);
    const fought = assembleBattle(cinderRoad, state, cinderRoad3, assignment);
    const final = playBattle(fought, templatePlan(plans.intended, cinderRoad, state, cinderRoad3, assignment), cinderRoad3.curatedSeed!, "on");
    expect(final.status).toBe("victory");
    const after = recordBattle(cinderRoad, state, final, { assignment });
    expect(after.history.at(-1)).toMatchObject({ battleId: "cr_ember_ford", outcome: "victory", assignment });
    expect(after.battleIndex).toBe(index + 1);
  });
});
