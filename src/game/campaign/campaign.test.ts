import { describe, expect, it } from "vitest";
import { playBattle } from "../engine/balance";
import { createInitialState, resolvePhase } from "../engine/resolvePhase";
import { scenarios } from "../engine/scenarios";
import { emberFord } from "../engine/scenarios/emberFord";
import { firstBreach } from "../engine/scenarios/firstBreach";
import type { EngineScenario, EngineState, Orders, SquadStatus } from "../engine/types";
import {
  applyCampaign,
  currentBattle,
  recordBattle,
  REFORMED_RESOLVE,
  rosterFor,
  startCampaign,
  validateCampaignDefinition,
} from "./campaign";
import { ashAndBanner } from "./definition";
import { renownTitle } from "./titles";
import type { CampaignDefinition, CampaignState } from "./types";

const def = ashAndBanner;

/** A finished battle with chosen outcome and per-squad endings (for rule tests). */
function finished(scenario: EngineScenario, status: EngineState["status"], endings: Record<string, SquadStatus> = {}, seed = 7) {
  const state = createInitialState(scenario, { seed });
  state.status = status;
  state.phase = 3;
  for (const squad of state.squads) {
    const ending = endings[squad.id];
    if (ending) {
      squad.status = ending;
      if (ending !== "active") squad.hex = null;
    }
  }
  return state;
}

function withResolve(state: CampaignState, resolves: Record<string, number>): CampaignState {
  return { ...state, companies: state.companies.map((company) => ({ ...company, resolve: resolves[company.id] ?? company.resolve })) };
}

/** Plays the current battle with the campaign applied, fortune off (deterministic) unless a seed is given. */
function play(state: CampaignState, orders: Orders | ((scenario: EngineScenario) => Orders), fortune: "on" | "off" = "off", seed = 1) {
  const battle = currentBattle(def, state)!;
  const base = scenarios.find((item) => item.id === battle.scenarioId)!;
  const scenario = applyCampaign(def, state, base);
  const plan = typeof orders === "function" ? orders(scenario) : orders;
  let engine = createInitialState(scenario, { seed, fortune });
  while (engine.status === "command") {
    engine = resolvePhase(engine, plan, scenario).state;
  }
  return { final: engine, scenario, next: recordBattle(def, state, engine) };
}

const everyone = (doctrineId: string) => (scenario: EngineScenario): Orders =>
  Object.fromEntries(scenario.squads.filter((squad) => squad.faction === scenario.playerFaction).map((squad) => [squad.id, doctrineId]));

describe("campaign definition", () => {
  it("is valid against the scenarios it uses, and every battle is playable", () => {
    expect(validateCampaignDefinition(def, scenarios)).toEqual([]);
    expect(def.battles.map((battle) => battle.scenarioId)).toEqual(["first_breach", "ember_ford", "saltmarsh_column", "hold_for_dawn"]);
    expect(def.battles.some((battle) => battle.placeholder)).toBe(false);
    expect(JSON.parse(JSON.stringify(def))).toEqual(def);
  });

  it("catches unmapped squads, role mismatches and doubled companies", () => {
    const broken: CampaignDefinition = {
      ...def,
      battles: [
        {
          ...def.battles[0],
          slots: { greyford_shields: "stoneford_riders", dawnwatch_archers: "stoneford_riders", mercy_standard: "ghost" },
        },
      ],
    };
    const problems = validateCampaignDefinition(broken, scenarios).join("\n");
    expect(problems).toMatch(/stoneford_riders \(cavalry\) cannot fill greyford_shields \(frontline\)/);
    expect(problems).toMatch(/a company fills two slots/);
    expect(problems).toMatch(/unknown company ghost/);
    expect(problems).toMatch(/squad stoneford_riders has no company/);
  });
});

describe("roster and scenario injection", () => {
  it("starts at the tutorial with an empty roster", () => {
    const state = startCampaign(def);
    expect(state).toEqual({ campaignId: "ash_and_banner", battleIndex: 0, status: "inProgress", companies: [], history: [] });
    expect(currentBattle(def, state)?.id).toBe("tutorial");
  });

  it("injects company name, Resolve and renown into the mapped squads, without touching the scenario", () => {
    const pristine = structuredClone(emberFord);
    const state: CampaignState = {
      ...startCampaign(def),
      battleIndex: 1,
      companies: [
        { id: "greyford_shields", name: "Greyford Shields", role: "frontline", resolve: 3, renown: { title: "The Gatebreakers" }, battlesFought: 1, casualties: { routed: 0, destroyed: 0 }, reformed: 0 },
      ],
    };
    const applied = applyCampaign(def, state, emberFord);
    const pikesSlot = applied.squads.find((squad) => squad.id === "tollbridge_pikes")!;
    expect(pikesSlot).toMatchObject({ name: "Greyford Shields", resolve: 3, renown: { title: "The Gatebreakers" } });
    // Companies joining here arrive fresh at Resolve 0 (the scenario's authored -1 is overridden).
    expect(applied.squads.find((squad) => squad.id === "mill_lane_guard")).toMatchObject({ name: "Mill Lane Guard", resolve: 0 });
    // Host squads keep their identity and renown, hardened by the army's fame (see hostEscalation).
    const pyre = emberFord.squads.find((squad) => squad.id === "pyre_sworn")!;
    expect(applied.squads.find((squad) => squad.id === "pyre_sworn")).toEqual({ ...pyre, strength: pyre.strength + 10, resolve: 3 });
    expect(emberFord).toEqual(pristine);
    expect(rosterFor(def, state, def.battles[1]).map((company) => company.id)).toEqual([
      "greyford_shields",
      "dawnwatch_archers",
      "mercy_standard",
      "stoneford_riders",
      "kestrel_lancers",
      "mill_lane_guard",
      "reedmarsh_levy",
    ]);
  });

  it("keeps the tutorial's authored Resolve for its founding companies", () => {
    const applied = applyCampaign(def, startCampaign(def), firstBreach);
    for (const squad of firstBreach.squads.filter((item) => item.faction === "free_banners")) {
      expect(applied.squads.find((item) => item.id === squad.id)?.resolve).toBe(squad.resolve);
    }
  });

  it("refuses the wrong scenario, placeholders and a finished campaign", () => {
    expect(() => applyCampaign(def, startCampaign(def), emberFord)).toThrow(/is first_breach, not ember_ford/);
    const unbuilt: CampaignDefinition = { ...def, battles: [...def.battles.slice(0, 3), { ...def.battles[3], slots: {}, placeholder: true }] };
    const atPlaceholder: CampaignState = { ...startCampaign(unbuilt), battleIndex: 3 };
    expect(() => applyCampaign(unbuilt, atPlaceholder, emberFord)).toThrow(/not playable yet/);
    const done: CampaignState = { ...startCampaign(def), battleIndex: 4, status: "complete" };
    expect(currentBattle(def, done)).toBeNull();
    expect(() => applyCampaign(def, done, firstBreach)).toThrow(/complete/);
  });
});

describe("Resolve rules", () => {
  const tutorialScenario = applyCampaign(def, startCampaign(def), firstBreach);

  it("victory: steady +1, routed -1, destroyed reforms at -2 (and advances)", () => {
    const final = finished(tutorialScenario, "victory", { dawnwatch_archers: "routed", stoneford_riders: "destroyed" });
    const next = recordBattle(def, startCampaign(def), final);
    const resolve = Object.fromEntries(next.companies.map((company) => [company.id, company.resolve]));
    expect(resolve).toEqual({ greyford_shields: 3, dawnwatch_archers: 0, mercy_standard: 1, stoneford_riders: REFORMED_RESOLVE });
    expect(next.companies.find((company) => company.id === "stoneford_riders")).toMatchObject({
      reformed: 1,
      casualties: { routed: 0, destroyed: 1 },
      battlesFought: 1,
    });
    expect(next.battleIndex).toBe(1);
    expect(next.history[0]).toMatchObject({ battleId: "tutorial", attempt: 1, outcome: "victory", seed: 7, companiesBroken: 2 });
  });

  it("clamps Resolve to -3..+3", () => {
    const start = withResolve(
      { ...startCampaign(def), companies: rosterFor(def, startCampaign(def), def.battles[0]) },
      { greyford_shields: 3, dawnwatch_archers: -3 },
    );
    const final = finished(applyCampaign(def, start, firstBreach), "victory", { dawnwatch_archers: "routed" });
    const next = recordBattle(def, start, final);
    expect(next.companies.find((company) => company.id === "greyford_shields")?.resolve).toBe(3);
    expect(next.companies.find((company) => company.id === "dawnwatch_archers")?.resolve).toBe(-3);
  });

  it("stalemate advances but earns nothing, and costs routed companies an extra point", () => {
    const efState: CampaignState = { ...startCampaign(def), battleIndex: 1 };
    const final = finished(applyCampaign(def, efState, emberFord), "stalemate", { kestrel_lancers: "routed" });
    const next = recordBattle(def, efState, final);
    expect(next.companies.find((company) => company.id === "kestrel_lancers")?.resolve).toBe(-2);
    expect(next.companies.find((company) => company.id === "mill_lane_guard")?.resolve).toBe(0);
    expect(next.battleIndex).toBe(2);
    expect(next.history[0].outcome).toBe("stalemate");
  });

  it("defeat means a retry with the same roster and no Resolve change", () => {
    const start = startCampaign(def);
    const final = finished(tutorialScenario, "defeat", { greyford_shields: "routed", mercy_standard: "destroyed" });
    const retry = recordBattle(def, start, final);
    expect(retry.battleIndex).toBe(0);
    expect(retry.status).toBe("inProgress");
    expect(retry.companies.map((company) => company.resolve)).toEqual([2, 1, 0, -1]);
    expect(retry.companies.find((company) => company.id === "mercy_standard")).toMatchObject({ reformed: 0, casualties: { destroyed: 1 } });
    const again = recordBattle(def, retry, finished(tutorialScenario, "victory"));
    expect(again.history.map((entry) => [entry.outcome, entry.attempt])).toEqual([["defeat", 1], ["victory", 2]]);
    expect(again.battleIndex).toBe(1);
  });

  it("earns a deterministic renown title at +3, keeps it on a later dip, and loses it on destruction", () => {
    const final = finished(tutorialScenario, "victory");
    const next = recordBattle(def, startCampaign(def), final);
    const shields = next.companies.find((company) => company.id === "greyford_shields")!;
    expect(shields.renown?.title).toBe(renownTitle("greyford_shields"));
    expect(next.history[0].companies.find((line) => line.companyId === "greyford_shields")?.renownEarned).toBe(shields.renown?.title);

    // The veterans carry their title (and their dread) into Ember Ford.
    const applied = applyCampaign(def, next, emberFord);
    expect(applied.squads.find((squad) => squad.id === "tollbridge_pikes")?.renown).toEqual(shields.renown);

    const dip = recordBattle(def, next, finished(applied, "victory", { tollbridge_pikes: "routed" }));
    expect(dip.companies.find((company) => company.id === "greyford_shields")).toMatchObject({ resolve: 2, renown: shields.renown });

    const atEf: CampaignState = { ...next };
    const lost = recordBattle(def, atEf, finished(applied, "victory", { tollbridge_pikes: "destroyed" }));
    expect(lost.companies.find((company) => company.id === "greyford_shields")).toMatchObject({ resolve: REFORMED_RESOLVE, renown: null });
  });

  it("rejects an unfinished battle or a battle from another scenario", () => {
    const running = createInitialState(tutorialScenario);
    expect(() => recordBattle(def, startCampaign(def), running)).toThrow(/not over/);
    expect(() => recordBattle(def, startCampaign(def), finished(emberFord, "victory"))).toThrow(/not ember_ford/);
  });
});

describe("campaign flow with the real engine", () => {
  it("carries the tutorial's veterans into Ember Ford (curated tutorial seed)", () => {
    const { final, next } = play(startCampaign(def), firstBreach.referencePlans!.intended, "on", firstBreach.curatedSeed);
    expect(final.status).toBe("victory");
    expect(next.battleIndex).toBe(1);
    expect(next.history[0]).toMatchObject({ outcome: "victory", seed: firstBreach.curatedSeed, objectiveIntegrity: final.objectives[0].integrity });
    const battle = currentBattle(def, next)!;
    expect(battle.id).toBe("battle_1");
    const applied = applyCampaign(def, next, emberFord);
    const shields = next.companies.find((company) => company.id === "greyford_shields")!;
    expect(applied.squads.find((squad) => squad.id === "tollbridge_pikes")).toMatchObject({ name: "Greyford Shields", resolve: shields.resolve });
    // Renowned veterans put dread on the Host too.
    expect(shields.resolve).toBe(3);
    expect(applied.squads.find((squad) => squad.id === "tollbridge_pikes")?.renown?.title).toBe(shields.renown?.title);
  });

  it("a stalemate at Ember Ford advances to the Saltmarsh Column; a defeat is retried", () => {
    const afterTutorial = play(startCampaign(def), firstBreach.referencePlans!.intended, "on", firstBreach.curatedSeed).next;

    // Rally banners alone never test the vanguard: that timeout is a defeat now.
    expect(play(afterTutorial, everyone("rescue_standard")).final.status).toBe("defeat");
    // Find a night where the intended plan tests the vanguard but runs out of time.
    let stalemate = play(afterTutorial, emberFord.referencePlans!.intended, "on", 1);
    for (let seed = 2; seed <= 400 && stalemate.final.status !== "stalemate"; seed += 1) {
      stalemate = play(afterTutorial, emberFord.referencePlans!.intended, "on", seed);
    }
    expect(stalemate.final.status).toBe("stalemate");
    expect(stalemate.next.battleIndex).toBe(2);
    expect(currentBattle(def, stalemate.next)).toMatchObject({ id: "battle_2", scenarioId: "saltmarsh_column" });

    const defeat = play(afterTutorial, everyone("shield_the_line"));
    expect(defeat.final.status).toBe("defeat");
    expect(defeat.next.battleIndex).toBe(1);
    expect(defeat.next.companies.map((company) => company.resolve)).toEqual(
      rosterFor(def, afterTutorial, def.battles[1]).map((company) => company.resolve),
    );
    const retry = play(defeat.next, emberFord.referencePlans!.intended, "on", emberFord.curatedSeed);
    expect(retry.next.history.at(-1)).toMatchObject({ battleId: "battle_1", attempt: 2 });
  });

  it("finishes when the last battle is won", () => {
    const mini: CampaignDefinition = { ...def, battles: [def.battles[0]] };
    const { next } = (() => {
      const state = startCampaign(mini);
      const scenario = applyCampaign(mini, state, firstBreach);
      const final = playBattle(scenario, firstBreach.referencePlans!.intended, firstBreach.curatedSeed!, "on");
      return { next: recordBattle(mini, state, final) };
    })();
    expect(next).toMatchObject({ status: "complete", battleIndex: 1 });
    expect(currentBattle(mini, next)).toBeNull();
  });
});
