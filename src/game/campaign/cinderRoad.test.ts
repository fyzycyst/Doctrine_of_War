// Cinder Road battle 1 (M1, P5): the Saltmarsh, Northbound, end to end on the Roll.
import { describe, expect, it } from "vitest";
import { playBattle } from "../engine/balance";
import { scenarios as introScenarios } from "../engine/scenarios";
import { hexDistance } from "../board";
import { cinderRoad1, HERON_STAIR } from "../engine/scenarios/cinderRoad1";
import { advanceRate } from "../engine/testKit";
import { registry } from "../packs/registry";
import { HOST_RESOLVE_CAP, HOST_STRENGTH_CAP, recordBattle, startCampaign } from "./campaign";
import { cinderRoad } from "./cinderRoad";
import { ashAndBanner } from "./definition";
import {
  assembleBattle,
  battleThreat,
  CARRY_OVER_MAX,
  carriedFielded,
  lintRollCampaign,
  MAX_FLEX_SLOTS,
  PROFILE_BANDS,
  recommendedForce,
  rollFor,
  rollSlots,
  snapshotCarryOver,
} from "./roll";
import { greedyScore, pickForce, rollCalls, strongCarryOver, templatePlan, weakestScore } from "./rollCalls";
import { introCarrySource } from "./rosters";

const scenarios = registry.scenarios();
const start = startCampaign(cinderRoad);
const intended = cinderRoad1.referencePlans!.intended;

describe("Cinder Road: the campaign", () => {
  it("is a Roll campaign in the First Call pack with its own army, inside the profile bands", () => {
    expect(registry.campaign("cinder_road")?.pack.id).toBe("first_call");
    expect(cinderRoad.mode).toBe("roll");
    expect(lintRollCampaign(cinderRoad, scenarios)).toEqual([]);
    const intro = new Set(ashAndBanner.companies.map((company) => company.id));
    for (const company of cinderRoad.companies) {
      expect(intro.has(company.id), company.id).toBe(false);
      const band = PROFILE_BANDS[company.role];
      expect(company.profile!.strength).toBeGreaterThanOrEqual(band.strength[0]);
      expect(company.profile!.strength).toBeLessThanOrEqual(band.strength[1]);
      expect(company.profile!.cohesion).toBeGreaterThanOrEqual(band.cohesion[0]);
      expect(company.profile!.cohesion).toBeLessThanOrEqual(band.cohesion[1]);
    }
  });

  it("calls six posts with two flex posts; the recommended force is the authored call; spares stay in reserve", () => {
    const slots = rollSlots(cinderRoad, start, cinderRoad1);
    expect(slots.map((slot) => slot.slotId)).toEqual(["van_west", "van_centre", "van_east", "outriders", "standard", "bows"]);
    // Every post has an authored name, never a company's.
    expect(slots.map((slot) => slot.label)).toEqual(["The West Causeway", "The Hummock Line", "The East Causeway", "The Causeway Van", "Heron Stair", "Wickmere Landing"]);
    expect(slots.filter((slot) => slot.flex).length).toBeLessThanOrEqual(MAX_FLEX_SLOTS);
    expect(recommendedForce(cinderRoad, start, cinderRoad1)).toEqual(cinderRoad.battles[0].slots);
    expect(rollFor(cinderRoad, start)).toHaveLength(9);
    // The authored call fields the scenario exactly as written: the Host's threat is nil.
    expect(battleThreat(cinderRoad, start, cinderRoad1)).toEqual({ fame: 0, strength: 0, resolve: 0 });
    const assembled = assembleBattle(cinderRoad, start, cinderRoad1, cinderRoad.battles[0].slots);
    expect(assembled.squads).toEqual(cinderRoad1.squads);
  });

  it("a frontline company on a flex post takes the post's template (march on the lances' post, banner on the bows')", () => {
    const lances = pickForce(cinderRoad, start, cinderRoad1, greedyScore, { outriders: "frontline", bows: "skirmish" })!;
    expect(cinderRoad.companies.find((company) => company.id === lances.outriders)?.role).toBe("frontline");
    expect(templatePlan(intended, cinderRoad, start, cinderRoad1, lances).outriders).toBe("bring_the_water");
    const bows = pickForce(cinderRoad, start, cinderRoad1, greedyScore, { outriders: "cavalry", bows: "frontline" })!;
    expect(cinderRoad.companies.find((company) => company.id === bows.bows)?.role).toBe("frontline");
    expect(templatePlan(intended, cinderRoad, start, cinderRoad1, bows).bows).toBe("rescue_standard");
    // Both flex posts on frontline would need five frontline companies: not a legal call.
    expect(pickForce(cinderRoad, start, cinderRoad1, greedyScore, { outriders: "frontline", bows: "frontline" })).toBeNull();
    const weakest = pickForce(cinderRoad, start, cinderRoad1, weakestScore)!;
    expect(weakest.outriders).toBe("brightcrag_riders");
    expect(weakest.bows).toBe("morningwall_slingers");
  });
});

describe("The Saltmarsh, Northbound", () => {
  it("each doctrine family earns its place in the intended plan (ablation >= 15 points, no muster)", () => {
    const base = advanceRate(cinderRoad1, intended);
    expect(base).toBeGreaterThanOrEqual(0.75);
    // The pure march: a standard that leaves the Heron Stair (to march, or to rally) lets
    // the outriders burn the boats, however strong the army is.
    expect(base - advanceRate(cinderRoad1, { ...intended, standard: "bring_the_water" })).toBeGreaterThanOrEqual(0.15);
    expect(base - advanceRate(cinderRoad1, { ...intended, standard: "rescue_standard" })).toBeGreaterThanOrEqual(0.15);
    expect(advanceRate(cinderRoad1, cinderRoad1.referencePlans!.bad)).toBeLessThanOrEqual(0.1);
    // Without the march, nothing reaches the barricade (the intro's habits wait for an enemy that never comes).
    const noMarch = Object.fromEntries(Object.entries(intended).map(([id, doctrineId]) => [id, doctrineId === "bring_the_water" ? "clean_counterstroke" : doctrineId]));
    expect(base - advanceRate(cinderRoad1, noMarch)).toBeGreaterThanOrEqual(0.15);
  }, 60_000);

  it("the bows' banner earns its place with the player-realistic muster (ablation >= 15 points)", () => {
    // With no muster at all a sixth marcher does nearly as well (a few points); with the
    // heuristic muster, idle marchers are drawn toward the hunters they glimpse, and only
    // a banner with the assault keeps it standing. It matters most to a weak force.
    const wins = (orders: Record<string, string>) =>
      Array.from({ length: 60 }, (_, index) => playBattle(cinderRoad1, orders, index + 1, "on", "heuristic")).filter((final) => final.status === "victory").length / 60;
    expect(wins(intended) - wins({ ...intended, bows: "bring_the_water" })).toBeGreaterThanOrEqual(0.15);
  }, 60_000);

  it("the curated seed is a clean, cinematic win: no company lost, the Hounds held at the Heron Stair", () => {
    const final = playBattle(cinderRoad1, intended, cinderRoad1.curatedSeed!, "on");
    expect(final.status).toBe("victory");
    expect(final.phase).toBeLessThanOrEqual(5);
    expect(final.squads.filter((squad) => squad.faction === "free_banners" && squad.status !== "active")).toEqual([]);
    const hounds = final.squads.find((squad) => squad.id === "gallowmere_pack")!;
    expect(hounds.status === "active" && hounds.hex && hexDistance(hounds.hex, HERON_STAIR) <= 1).toBe(true);
    expect(final.squads.find((squad) => squad.id === "standard")?.hex).toEqual(HERON_STAIR);
  });

  it("records the curated win on the Roll: the campaign moves on to battle 2 and settles conditions", () => {
    const assignment = recommendedForce(cinderRoad, start, cinderRoad1);
    const final = playBattle(assembleBattle(cinderRoad, start, cinderRoad1, assignment), intended, cinderRoad1.curatedSeed!, "on");
    const after = recordBattle(cinderRoad, start, final, { assignment });
    expect(after).toMatchObject({ status: "inProgress", battleIndex: 1 });
    expect(after.history[0]).toMatchObject({ battleId: "cr_saltmarsh", outcome: "victory", assignment });
    // Nobody fielded ended under half strength, so every company is still fresh.
    for (const companyId of Object.values(assignment)) {
      expect(after.companies.find((company) => company.id === companyId)?.condition).toBe("fresh");
    }
  });
});

describe("Cinder Road with carried intro veterans (Q3)", () => {
  const source = introCarrySource(ashAndBanner, introScenarios, "first_call");
  const carried = strongCarryOver(source);
  const state = startCampaign(cinderRoad, { carryOver: carried });

  it("carries the five most famous intro companies, snapshotted legally", () => {
    expect(source.state.status).toBe("complete");
    expect(carried).toHaveLength(CARRY_OVER_MAX);
    expect(snapshotCarryOver(source, cinderRoad, carried.map((company) => company.id))).toEqual(carried);
    expect(rollFor(cinderRoad, state)).toHaveLength(9 + CARRY_OVER_MAX);
  });

  it("fixes the Host's threat at battle entry (capped), whatever the player then picks", () => {
    const threat = battleThreat(cinderRoad, state, cinderRoad1);
    expect(threat.strength).toBe(HOST_STRENGTH_CAP);
    expect(threat.resolve).toBe(HOST_RESOLVE_CAP);
    for (const score of [greedyScore, weakestScore]) {
      const force = pickForce(cinderRoad, state, cinderRoad1, score)!;
      // The harness fields at most two veterans too.
      expect(carriedFielded(cinderRoad, state, force).fielded).toBeLessThanOrEqual(2);
      const assembled = assembleBattle(cinderRoad, state, cinderRoad1, force);
      const host = assembled.squads.find((squad) => squad.id === "sootbank_spears")!;
      expect(host.strength).toBe(64 + HOST_STRENGTH_CAP);
    }
  });

  it("is a named call of the battle: carried recommended and greedy face the full guardrails", () => {
    const calls = rollCalls(cinderRoad, scenarios, 0, source).filter((item) => item.kind.startsWith("carried"));
    expect(calls.map((item) => [item.name, item.policy])).toEqual([
      ["carried: recommended", "full"],
      ["carried: greedy", "full"],
    ]);
    expect(calls[0].roster).toMatch(/carried/);
  });
});
