// Cinder Road battle 6 (CR6, the finale): Break the Strongpoint, its ground, posts, threat and
// curated seed. The role gate, the role ablation and the fog regression play many 19-squad
// battles, so they are cinderRoad6.*.sim.test.ts (npm run test:finale).
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { hexDistance } from "../board";
import { playBattle } from "../engine/balance";
import { doctrineLibrary } from "../engine/doctrines";
import { cinderRoad6, GREYFORD_GATE } from "../engine/scenarios/cinderRoad6";
import { registry } from "../packs/registry";
import { cinderRoad } from "./cinderRoad";
import { BANNER, BREACH, BTW, calls, CR6_INDEX, matrix, RS } from "./cinderRoad6.roles.testkit";
import { assembleBattle, battleThreat, lintRollCampaign, MAX_FLEX_SLOTS, recommendedForce, rollSlots } from "./roll";
import { curatedRollState, templatePlan } from "./rollCalls";
import { callSlug, nonFillers, objectiveStrikers, unfilledCombos } from "./roles.testkit";

const scenarios = registry.scenarios();
const plans = cinderRoad6.referencePlans!;

describe("Break the Strongpoint (Cinder Road, the finale)", () => {
  it("is in Cinder Road (after battle 3 until battles 4 and 5 land) and the First Call pack, linted clean", () => {
    expect(CR6_INDEX).toBe(3);
    expect(registry.scenario(cinderRoad6.id)).toEqual(cinderRoad6);
    expect(lintRollCampaign(cinderRoad, scenarios)).toEqual([]);
  });

  it("is Greyford Gate, held by the Host: the gate in the wall, two approaches, the Banners west of it", () => {
    expect(cinderRoad6.winCondition).toEqual({ kind: "breakObjective", objectiveId: "greyford_gate" });
    expect(cinderRoad6.objectives).toMatchObject([{ id: "greyford_gate", hex: GREYFORD_GATE, defender: "ashen_host" }]);
    const standable = cinderRoad6.board.hexes.filter((hex) => hexDistance(hex.coord, GREYFORD_GATE) === 1 && hex.terrain !== "wall" && hex.terrain !== "river");
    expect(standable.map((hex) => hex.coord)).toEqual([{ q: 7, r: 3 }, { q: 7, r: 4 }]);
    for (const squad of cinderRoad6.squads) {
      const zone = cinderRoad6.board.hexes.find((hex) => hex.coord.q === squad.hex.q && hex.coord.r === squad.hex.r)?.deploymentFaction;
      expect(zone, squad.id).toBe(squad.faction);
    }
    expect(cinderRoad6.forecast).toEqual({ start: "ashWind", shiftChance: 0, shifts: ["ashWind"] });
    // Every Host company is sworn: they do not waver (the veterans' renown cannot shake them).
    expect(cinderRoad6.squads.filter((squad) => squad.faction === "ashen_host").every((squad) => squad.resolve === 3)).toBe(true);
    expect(cinderRoad6.squads.filter((squad) => squad.faction === "ashen_host").map((squad) => squad.renown?.title).filter(Boolean)).toEqual(["The Kept Coal"]);
  });

  it("calls the whole army: nine named posts, two flex, from the Roll as battles 1-3 left it", () => {
    const after3 = curatedRollState(cinderRoad, scenarios, CR6_INDEX);
    const slots = rollSlots(cinderRoad, after3, cinderRoad6);
    expect(slots).toHaveLength(cinderRoad.companies.length);
    expect(slots.filter((slot) => slot.flex).length).toBeLessThanOrEqual(MAX_FLEX_SLOTS);
    expect(recommendedForce(cinderRoad, after3, cinderRoad6)).toEqual(cinderRoad.battles[CR6_INDEX].slots);
    // Seven calls; every flex role pattern needs more frontline companies than the Roll has.
    expect(calls.map((call) => call.name)).toEqual(["recommended", "curated", "rough (recovery force)", "greedy", "weakest legal", "carried: recommended", "carried: greedy"]);
    expect(matrix.notApplicable.map((item) => item.reason)).toEqual([
      "not legal: it needs 5 frontline companies and the Roll has 4 ready",
      "not legal: it needs 5 frontline companies and the Roll has 4 ready",
      "not legal: it needs 6 frontline companies and the Roll has 4 ready",
    ]);
  });

  it("is authored at fame 17: the threat never eases the sworn, and hardens the Host for a famous army (pinned per call)", () => {
    const threats = Object.fromEntries(calls.map((call) => [call.name, battleThreat(cinderRoad, call.state, cinderRoad6)]));
    expect(threats.recommended).toEqual({ fame: 13, strength: 12, resolve: 1 });
    expect(threats["rough (recovery force)"]).toEqual({ fame: -1, strength: -2, resolve: 0 });
    expect(threats["carried: recommended"]).toEqual({ fame: 10, strength: 12, resolve: 1 });
    for (const call of calls) {
      expect(call.scenario.squads.filter((squad) => squad.faction === "ashen_host").every((squad) => squad.resolve === 3), call.name).toBe(true);
    }
  });

  it("only Bring the Water can strike the gate and only Rescue Standard can rally: the roles' static checks", () => {
    // So no plan without Bring the Water can win (the timeout is a defeat), and no plan without
    // Rescue Standard can fill the banner role by accident. Editor variants cannot add actions.
    for (const call of calls) expect(objectiveStrikers(call.scenario), call.name).toEqual([BTW]);
    expect(cinderRoad6.timeoutOutcome).toBe("defeat");
    const ralliers = cinderRoad6.playerDoctrineIds.filter((id) => doctrineLibrary[id].rules.some((rule) => rule.then.kind === "rally"));
    expect(ralliers).toEqual([RS]);
    expect(nonFillers(cinderRoad6, BANNER)).toHaveLength(5);
    expect(unfilledCombos(cinderRoad6, plans.intended, BANNER)).toHaveLength(25);
    expect(nonFillers(cinderRoad6, BREACH)).toHaveLength(5);
  });

  it("every named call has its role-gate file, cinderRoad6.roles.<call>.sim.test.ts", () => {
    const files = Object.keys(import.meta.glob("./cinderRoad6.roles.*.sim.test.ts"));
    const covered = files.map((file) => readFileSync(new URL(file, import.meta.url), "utf8").match(/describeRoleGate\("([^"]+)"\)/)?.[1]);
    expect(files.map((file) => file.replace(/^\.\/cinderRoad6\.roles\.|\.sim\.test\.ts$/g, "")).sort()).toEqual(covered.map((name) => callSlug(name ?? "")).sort());
    expect([...covered].sort()).toEqual(calls.map((call) => call.name).sort());
  });

  it("the curated seed is a clean win on the curated path: no company lost, the Kept Coal broken", () => {
    const after3 = curatedRollState(cinderRoad, scenarios, CR6_INDEX);
    const force = recommendedForce(cinderRoad, after3, cinderRoad6);
    const fought = assembleBattle(cinderRoad, after3, cinderRoad6, force);
    expect(cinderRoad6.curatedSeed).toBeLessThan(1000);
    const final = playBattle(fought, templatePlan(plans.intended, cinderRoad, after3, cinderRoad6, force), cinderRoad6.curatedSeed!, "on");
    expect(final.status).toBe("victory");
    expect(final.squads.filter((squad) => squad.faction === "free_banners" && squad.status !== "active")).toEqual([]);
    expect(final.squads.find((squad) => squad.id === "slagwall_oathguard")?.status).not.toBe("active");
  });
});
