// Cinder Road battle 2 (M2, C2): Strike the Wagon Park, on the Roll after battle 1.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { hexDistance } from "../board";
import { playBattle, TUNING_SEEDS } from "../engine/balance";
import { createInitialState, resolvePhase } from "../engine/resolvePhase";
import { cinderRoad2, SLUICE_WALK, WEIR_SLUICE } from "../engine/scenarios/cinderRoad2";
import type { EngineEvent } from "../engine/types";
import { registry } from "../packs/registry";
import { cinderRoad } from "./cinderRoad";
import { assembleBattle, battleThreat, lintRollCampaign, MAX_FLEX_SLOTS, recommendedForce, rollSlots } from "./roll";
import { curatedRollState } from "./rollCalls";
import { calls, GUARD, MARCH } from "./cinderRoad2.roles.testkit";
import { callSlug, nonFillers, objectiveStrikers, unfilledCombos } from "./roles.testkit";

const scenarios = registry.scenarios();
const intended = cinderRoad2.referencePlans!.intended;
const BTW = "bring_the_water";

describe("Cinder Road battle 2: the call", () => {
  const after1 = curatedRollState(cinderRoad, scenarios, 1);

  it("is battle 2 of Cinder Road, in the First Call pack, linted clean", () => {
    expect(cinderRoad.battles.map((battle) => battle.scenarioId).slice(0, 2)).toEqual(["cinder_road_saltmarsh", "cinder_road_wagon_park"]);
    expect(registry.scenario("cinder_road_wagon_park")).toEqual(cinderRoad2);
    expect(lintRollCampaign(cinderRoad, scenarios)).toEqual([]);
  });

  it("calls six named posts, two flex; after battle 1 the recommended force is the authored call and the Host's threat is nil", () => {
    const slots = rollSlots(cinderRoad, after1, cinderRoad2);
    expect(slots.map((slot) => [slot.slotId, slot.label])).toEqual([
      ["ford_van", "The Wainford"],
      ["track_van", "The Wagon Track"],
      ["sedge_van", "The Sedge Flank"],
      ["lances", "The Lance Line"],
      ["standard", "Willow Rise"],
      ["keepers", "The Weir Sluice"],
    ]);
    expect(slots.filter((slot) => slot.flex).length).toBeLessThanOrEqual(MAX_FLEX_SLOTS);
    expect(recommendedForce(cinderRoad, after1, cinderRoad2)).toEqual(cinderRoad.battles[1].slots);
    expect(battleThreat(cinderRoad, after1, cinderRoad2)).toEqual({ fame: 0, strength: 0, resolve: 0 });
    // The scenario is authored as the army stands after battle 1: assembly changes nothing.
    expect(assembleBattle(cinderRoad, after1, cinderRoad2, cinderRoad.battles[1].slots).squads).toEqual(cinderRoad2.squads);
  });
});

describe("Strike the Wagon Park: the battle", () => {
  it("has two objectives: the Host's wagon park to break and the Banners' sluice to keep, with one dry walk to it", () => {
    expect(cinderRoad2.winCondition).toEqual({ kind: "breakObjective", objectiveId: "wagon_park" });
    expect(cinderRoad2.defeatConditions).toContainEqual({ kind: "objectiveLost", objectiveId: "weir_sluice" });
    const passable = cinderRoad2.board.hexes.filter((hex) => hexDistance(hex.coord, WEIR_SLUICE) === 1 && hex.terrain !== "river" && hex.terrain !== "wall");
    expect(passable.map((hex) => hex.coord)).toEqual([SLUICE_WALK]);
    expect(cinderRoad2.board.hexes.find((hex) => hex.objectiveId === "wagon_park")?.objectiveKind).toBe("wagons");
    expect(cinderRoad2.board.hexes.find((hex) => hex.objectiveId === "weir_sluice")?.objectiveKind).toBe("sluice");
  });

  it("the march always has a target under fog", () => {
    const blocked: string[] = [];
    for (let seed = TUNING_SEEDS.first; seed < TUNING_SEEDS.first + 20; seed += 1) {
      let state = createInitialState(cinderRoad2, { seed, fortune: "on" });
      while (state.status === "command") {
        const result = resolvePhase(state, intended, cinderRoad2);
        for (const event of result.events as EngineEvent[]) {
          if (event.kind === "blocked" && intended[event.squadId] === BTW && event.reason === "no target") blocked.push(`#${seed} ${event.squadId}`);
        }
        state = result.state;
      }
    }
    expect(blocked).toEqual([]);
  }, 60_000);

  it("the curated seed is a clean win: no company lost, the keepers on the Sluice Walk, the sluice untouched", () => {
    expect(cinderRoad2.curatedSeed).toBeLessThan(TUNING_SEEDS.first + TUNING_SEEDS.size);
    const final = playBattle(cinderRoad2, intended, cinderRoad2.curatedSeed!, "on");
    expect(final.status).toBe("victory");
    expect(final.phase).toBeLessThanOrEqual(4);
    expect(final.squads.filter((squad) => squad.faction === "free_banners" && squad.status !== "active")).toEqual([]);
    expect(final.squads.find((squad) => squad.id === "keepers")?.hex).toEqual(SLUICE_WALK);
    expect(final.objectives.find((objective) => objective.id === "weir_sluice")?.integrity).toBe(cinderRoad2.objectives[1].integrity);
  });
});

describe("Strike the Wagon Park: the role gate's coverage (the simulations are in test:balance)", () => {
  it("every named call has its role-gate file, cinderRoad2.roles.<call>.sim.test.ts", () => {
    const files = Object.keys(import.meta.glob("./cinderRoad2.roles.*.sim.test.ts"));
    const covered = files.map((file) => readFileSync(new URL(file, import.meta.url), "utf8").match(/describeRoleGate\("([^"]+)"\)/)?.[1]);
    expect(files.map((file) => file.replace(/^\.\/cinderRoad2\.roles\.|\.sim\.test\.ts$/g, "")).sort()).toEqual(covered.map((name) => callSlug(name ?? "")).sort());
    expect([...covered].sort()).toEqual(calls.map((call) => call.name).sort());
  });

  it("the unfilled plans are the full cartesian product of stock non-fillers over each role's posts", () => {
    expect(nonFillers(cinderRoad2, GUARD)).toEqual(["bring_the_water", "shield_the_line", "fighting_withdrawal", "rescue_standard"]);
    expect(unfilledCombos(cinderRoad2, intended, GUARD)).toHaveLength(4);
    const marchCombos = unfilledCombos(cinderRoad2, intended, MARCH);
    expect(marchCombos).toHaveLength(5 ** 4);
    expect(new Set(marchCombos.map(({ orders }) => JSON.stringify(orders))).size).toBe(5 ** 4);
    for (const { orders } of marchCombos) expect(MARCH.posts.some((post) => orders[post] === BTW)).toBe(false);
  });

  it("no plan without Bring the Water can win: it is the only offered doctrine that can strike the park, and the timeout is a defeat", () => {
    // Editor variants cannot add an action, so this holds for every variant too (roles.testkit.ts).
    for (const call of calls) expect(objectiveStrikers(call.scenario), call.name).toEqual([BTW]);
    expect(cinderRoad2.winCondition.kind).toBe("breakObjective");
    expect(cinderRoad2.timeoutOutcome).toBe("defeat");
  });
});
