// Cinder Road battle 4, the harrying battle (CR5): Turn the Retreat, its ground, posts and curated seed.
// The role gate and the role ablation play many battles, so they are *.sim.test.ts: the role
// gate under npm run test:campaign, the ablation under npm run test:balance.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { hexDistance, sameHex } from "../board";
import { playBattle, HARRYING_FILLERS } from "../engine/balance";
import { decisionLeaks } from "../engine/fogDecisions.testkit";
import { rushMuster } from "../engine/muster";
import { createInitialState, resolvePhase } from "../engine/resolvePhase";
import { createRng } from "../engine/rng";
import { COLUMN, cinderRoad5, FOOT_POSTS, GATE_APPROACH, HUNT_POSTS } from "../engine/scenarios/cinderRoad5";
import { GREYFORD_GATE } from "../engine/scenarios/greyfordGate.board";
import { registry } from "../packs/registry";
import { recordBattle } from "./campaign";
import { cinderRoad } from "./cinderRoad";
import { calls, HUNT } from "./cinderRoad5.roles.testkit";
import { assembleBattle, lintRollCampaign, recommendedForce, rollSlots } from "./roll";
import { curatedRollState, templatePlan } from "./rollCalls";
import { callSlug, nonFillers, unfilledCombos } from "./roles.testkit";

const scenarios = registry.scenarios();
const plans = cinderRoad5.referencePlans!;
const index = cinderRoad.battles.findIndex((battle) => battle.scenarioId === cinderRoad5.id);

describe("Turn the Retreat (Cinder Road, battle 4: the harrying battle)", () => {
  it("is battle 4 of Cinder Road, in the First Call pack, linted clean", () => {
    expect(index).toBe(3);
    expect(registry.scenario(cinderRoad5.id)).toEqual(cinderRoad5);
    expect(lintRollCampaign(cinderRoad, scenarios)).toEqual([]);
  });

  it("every named call has its role-gate file, cinderRoad5.roles.<call>.sim.test.ts", () => {
    const files = Object.keys(import.meta.glob("./cinderRoad5.roles.*.sim.test.ts"));
    const covered = files.map((file) => readFileSync(new URL(file, import.meta.url), "utf8").match(/describeRoleGate\("([^"]+)"\)/)?.[1]);
    expect(files.map((file) => file.replace(/^\.\/cinderRoad5\.roles\.|\.sim\.test\.ts$/g, "")).sort()).toEqual(covered.map((name) => callSlug(name ?? "")).sort());
    expect([...covered].sort()).toEqual(calls.map((call) => call.name).sort());
  });

  it("one counted role, the hunt, under the harrying exception: its fillers are the harness's, and the unfilled plans are the full product", () => {
    // The harrying exception (docs/CAMPAIGN.md): the harness spares exactly the hunt's fillers' monos.
    expect(HARRYING_FILLERS[cinderRoad5.id]).toEqual(HUNT.fillers);
    expect(HUNT.posts).toEqual(HUNT_POSTS);
    // Shield the Line and Hold for Dawn stand beside the road; Fighting Withdrawal and Rescue Standard give ground.
    expect(nonFillers(cinderRoad5, HUNT)).toEqual(["shield_the_line", "fighting_withdrawal", "rescue_standard", "hold_for_dawn"]);
    const unfilled = unfilledCombos(cinderRoad5, plans.intended, HUNT);
    expect(unfilled).toHaveLength(4 ** 3);
    expect(new Set(unfilled.map(({ orders }) => JSON.stringify(orders))).size).toBe(4 ** 3);
    // The Rearguard (CR4's doctrine) is not offered here.
    expect(cinderRoad5.playerDoctrineIds).not.toContain("rearguard");
  });

  it("is the shared Greyford Gate ground, the gate no objective: escape is a rule at the gate's two approaches", () => {
    const gate = cinderRoad5.board.hexes.find((hex) => sameHex(hex.coord, GREYFORD_GATE))!;
    expect(gate.terrain).toBe("wall");
    expect(gate.objectiveId).toBeUndefined();
    // Render dresses it as the gatehouse all the same (render-only, BoardHex.gatehouse).
    expect(gate.gatehouse).toBe(true);
    expect(cinderRoad5.objectives).toEqual([]);
    for (const hex of GATE_APPROACH) expect(hexDistance(hex, GREYFORD_GATE)).toBe(1);
    expect(cinderRoad5.defeatConditions).toContainEqual({ kind: "enemyEscape", edgeHexes: GATE_APPROACH, count: 3 });
    expect(cinderRoad5.winCondition).toEqual({ kind: "destroySquads", squadIds: COLUMN, count: 3 });
    // The column flees on Slip the Leash (it never stops to fight); the rearguard holds the ford.
    // The column retreats in order (T29): the van at once, the rest over the ford in two waves,
    // every company of it at cohesion 45 (a couple of blows no longer rout it).
    const column = cinderRoad5.squads.filter((squad) => COLUMN.includes(squad.id));
    expect(column.every((squad) => squad.cohesion === 45)).toBe(true);
    const released = (id: string) => (column.find((squad) => squad.id === id)!.doctrineId === "slip_the_leash" ? 1 : cinderRoad5.hostSchedule.find((orders) => orders.orders[id] === "slip_the_leash")?.phase);
    expect(COLUMN.map(released)).toEqual([1, 2, 2, 3, 3]);
    // The riders lie on the flank edges ahead; the foot are over the River Ford behind.
    const hex = (id: string) => cinderRoad5.squads.find((squad) => squad.id === id)!.hex;
    for (const id of HUNT_POSTS) expect([0, 7]).toContain(hex(id).r);
    for (const id of FOOT_POSTS) expect(hex(id).q).toBeLessThanOrEqual(2);
  });

  it("the column cannot be broken by sight: its Resolve is at least every Banner company's, on every call (the CR5 warden's finding)", () => {
    // Dread on first sight costs (the renowned enemy's Resolve - the viewer's) x 5 cohesion; with
    // no gap there is no dread, so only a strike breaks a fleeing company.
    for (const call of calls) {
      const column = call.scenario.squads.filter((squad) => COLUMN.includes(squad.id));
      const banners = call.scenario.squads.filter((squad) => squad.faction === "free_banners");
      expect(Math.min(...column.map((squad) => squad.resolve)), call.name).toBeGreaterThanOrEqual(Math.max(...banners.map((squad) => squad.resolve)));
    }
  });

  it("the rush has nothing to rush toward here: rushMuster returns no moves at any phase, on every call (so the gate replaces it)", () => {
    // No enemy objective stands and the player has no exits: the rush is the same game as no muster.
    for (const call of calls) {
      const scenario = call.scenario;
      const shield = Object.fromEntries(Object.keys(scenario.referencePlans!.intended).map((id) => [id, "shield_the_line"]));
      for (const orders of [scenario.referencePlans!.intended, shield]) {
        let state = createInitialState(scenario, { seed: 100001, fortune: "on" });
        while (state.status === "command") {
          expect(rushMuster(state, scenario), `${call.name}, phase ${state.phase}`).toEqual([]);
          state = resolvePhase(state, orders, scenario).state;
        }
      }
    }
  });

  it("calls six named posts, one flex (the south folds), from the army as battles 1-3 left it", () => {
    const state = curatedRollState(cinderRoad, scenarios, index);
    expect(state.history.map((entry) => entry.battleId)).toEqual(cinderRoad.battles.slice(0, index).map((battle) => battle.id));
    const slots = rollSlots(cinderRoad, state, cinderRoad5);
    expect(slots.map((slot) => slot.label)).toEqual(["The Broken Watch Folds", "The South Works Folds", "The South Ditch", "The North Bank", "The River Ford", "The South Bank"]);
    expect(slots.filter((slot) => slot.flex).map((slot) => slot.slotId)).toEqual(["riders"]);
    expect(Object.keys(recommendedForce(cinderRoad, state, cinderRoad5))).toEqual(slots.map((slot) => slot.slotId));
  });

  it("the curated seed is a clean win: no company lost, three of the column broken before they reach the gate", () => {
    const final = playBattle(cinderRoad5, plans.intended, cinderRoad5.curatedSeed!, "on");
    expect(final.status).toBe("victory");
    expect(final.squads.filter((squad) => squad.faction === "free_banners" && squad.status !== "active")).toEqual([]);
    expect(final.squads.filter((squad) => COLUMN.includes(squad.id) && (squad.status === "routed" || squad.status === "destroyed")).length).toBeGreaterThanOrEqual(3);
  });

  it("records the curated win on the Roll after battles 1-3: nobody worn, the campaign moves on", () => {
    const state = curatedRollState(cinderRoad, scenarios, index);
    const assignment = recommendedForce(cinderRoad, state, cinderRoad5);
    const fought = assembleBattle(cinderRoad, state, cinderRoad5, assignment);
    const final = playBattle(fought, templatePlan(plans.intended, cinderRoad, state, cinderRoad5, assignment), cinderRoad5.curatedSeed!, "on");
    expect(final.status).toBe("victory");
    const after = recordBattle(cinderRoad, state, final, { assignment });
    expect(after.history.at(-1)).toMatchObject({ battleId: "cr_gate_road", outcome: "victory", assignment });
    expect(after.battleIndex).toBe(index + 1);
    expect(after.companies.filter((company) => company.condition !== "fresh")).toEqual([]);
  });

  it("fog: no Banner decision, route or withdrawal on this ground depends on an unseen enemy, at every step", () => {
    // P4's step-level check (fogDecisions.testkit.ts) on this battle's own plans.
    const seeds = Array.from({ length: 10 }, (_, offset) => 100001 + offset);
    const pick = createRng(20261006);
    for (const [name, orders] of Object.entries({ intended: plans.intended, alternative: plans.alternative!, bad: plans.bad })) {
      const { checked, leaks } = decisionLeaks(cinderRoad5, orders, seeds, () => pick.next());
      expect(checked, name).toBeGreaterThan(100);
      expect(leaks.slice(0, 3), name).toEqual([]);
    }
  });
});
