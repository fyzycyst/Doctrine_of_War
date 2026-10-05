// Cinder Road battle 2 (M2, C2): Strike the Wagon Park, on the Roll after battle 1.
import { describe, expect, it } from "vitest";
import { hexDistance } from "../board";
import { playBattle, TUNING_SEEDS } from "../engine/balance";
import { createInitialState, resolvePhase } from "../engine/resolvePhase";
import { cinderRoad2, SLUICE_WALK, WEIR_SLUICE } from "../engine/scenarios/cinderRoad2";
import { advanceRate } from "../engine/testKit";
import type { EngineEvent } from "../engine/types";
import { registry } from "../packs/registry";
import { cinderRoad } from "./cinderRoad";
import { assembleBattle, battleThreat, lintRollCampaign, MAX_FLEX_SLOTS, recommendedForce, rollSlots } from "./roll";
import { curatedRollState } from "./rollCalls";

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

  // Role ablation (docs/CAMPAIGN.md): replace every doctrine that fills a role with the best
  // doctrine that does not; with no muster it must cost >= 15 points. The roles, by function:
  // the march strikes the park (Bring the Water); the guard holds the Sluice Walk or fights
  // the ram (by orders: Hold for Dawn, or Clean Counterstroke; the muster-dependent filler,
  // a holding doctrine mustered onto the walk, is in cinderRoad2.guard.test.ts, with every
  // unfilled plan on every call). The standard's banner (Rescue Standard) is an extra.
  const OTHERS = ["bring_the_water", "shield_the_line", "fighting_withdrawal", "rescue_standard", "clean_counterstroke", "hold_for_dawn"];
  const GUARDS_BY_ORDERS = ["hold_for_dawn", "clean_counterstroke"];

  it("each role earns its place (role ablation >= 15 points, no muster)", () => {
    const base = advanceRate(cinderRoad2, intended);
    expect(base).toBeGreaterThanOrEqual(0.75);
    // The sluice guard: the best keeper that does not guard.
    const unguarded = OTHERS.filter((doctrineId) => !GUARDS_BY_ORDERS.includes(doctrineId)).map((doctrineId) => advanceRate(cinderRoad2, { ...intended, keepers: doctrineId }));
    expect(base - Math.max(...unguarded)).toBeGreaterThanOrEqual(0.15);
    for (const rate of unguarded) expect(rate).toBeLessThan(0.75);
    // The march: every Bring the Water post on the best doctrine that does not march.
    const unmarched = OTHERS.filter((doctrineId) => doctrineId !== BTW).map((doctrineId) =>
      advanceRate(cinderRoad2, Object.fromEntries(Object.entries(intended).map(([id, plan]) => [id, plan === BTW ? doctrineId : plan]))),
    );
    expect(base - Math.max(...unmarched)).toBeGreaterThanOrEqual(0.15);
    // The pure march (the bad plan) loses whatever the force: the ram breaks the sluice.
    expect(advanceRate(cinderRoad2, cinderRoad2.referencePlans!.bad)).toBeLessThanOrEqual(0.1);
    // The accepted alternative for the keepers' post wins too, and is the tracked alternative row.
    expect(cinderRoad2.referencePlans!.alternative).toEqual({ ...intended, keepers: "clean_counterstroke" });
    expect(advanceRate(cinderRoad2, cinderRoad2.referencePlans!.alternative!)).toBeGreaterThanOrEqual(0.75);
  }, 90_000);

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
