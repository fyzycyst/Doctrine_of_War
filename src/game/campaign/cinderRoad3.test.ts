// Cinder Road battle 3 (C3): Open a Road, its ground, posts and curated seed. The role sweeps
// and the role ablation play many battles, so they are *.sim.test.ts (npm run test:balance).
import { describe, expect, it } from "vitest";
import { hexDistance } from "../board";
import { playBattle } from "../engine/balance";
import { factionSees, visibleState } from "../engine/fog";
import { createInitialState, resolvePhase } from "../engine/resolvePhase";
import type { EngineEvent, EngineState } from "../engine/types";
import { cinderRoad3, FAR_BANK_ROADS, NEAR_BANK_ROADS } from "../engine/scenarios/cinderRoad3";
import { registry } from "../packs/registry";
import { recordBattle } from "./campaign";
import { cinderRoad } from "./cinderRoad";
import { assembleBattle, lintRollCampaign, recommendedForce, rollSlots } from "./roll";
import { curatedRollState, templatePlan } from "./rollCalls";
import { readFileSync } from "node:fs";
import { calls, GUARD, MARCH } from "./cinderRoad3.roles.testkit";
import { callSlug, nonFillers, unfilledCombos } from "./roles.testkit";

const scenarios = registry.scenarios();
const plans = cinderRoad3.referencePlans!;
const index = cinderRoad.battles.findIndex((battle) => battle.scenarioId === cinderRoad3.id);

describe("Open a Road (Cinder Road, battle 3)", () => {
  it("is battle 3 of Cinder Road, in the First Call pack, linted clean", () => {
    expect(index).toBe(2);
    expect(registry.scenario(cinderRoad3.id)).toEqual(cinderRoad3);
    expect(lintRollCampaign(cinderRoad, scenarios)).toEqual([]);
  });

  it("every named call has its role-gate file, cinderRoad3.roles.<call>.sim.test.ts", () => {
    const files = Object.keys(import.meta.glob("./cinderRoad3.roles.*.sim.test.ts"));
    const covered = files.map((file) => readFileSync(new URL(file, import.meta.url), "utf8").match(/describeRoleGate\("([^"]+)"\)/)?.[1]);
    expect(files.map((file) => file.replace(/^\.\/cinderRoad3\.roles\.|\.sim\.test\.ts$/g, "")).sort()).toEqual(covered.map((name) => callSlug(name ?? "")).sort());
    expect([...covered].sort()).toEqual(calls.map((call) => call.name).sort());
  });

  it("the unfilled plans are the full cartesian product of stock non-fillers over each role's posts", () => {
    // The guard's fillers by orders stand where they are posted; the two that leave do not.
    expect(nonFillers(cinderRoad3, GUARD)).toEqual(["open_the_road", "fighting_withdrawal"]);
    expect(unfilledCombos(cinderRoad3, plans.intended, GUARD)).toHaveLength(4);
    // The C3 warden's stock mixed watch is one of them.
    expect(unfilledCombos(cinderRoad3, plans.intended, GUARD).some(({ orders }) => orders.lances === "fighting_withdrawal" && orders.bows === "open_the_road")).toBe(true);
    const march = unfilledCombos(cinderRoad3, plans.intended, MARCH);
    expect(march).toHaveLength(5 ** 4);
    expect(new Set(march.map(({ orders }) => JSON.stringify(orders))).size).toBe(5 ** 4);
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
    expect(final.squads.filter((squad) => ["scorchmark_spears", "kilnbrand_raiders"].includes(squad.id) && squad.status !== "active").length).toBeGreaterThan(0);
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

  it("fog: an unseen enemy moved elsewhere unseen leaves the Banners' moves unchanged (the C3 warden's seed 100001 case)", () => {
    // Pure Open the Road, seed 100001. At the start of phases 1 and 3, move every Host company
    // the Banners cannot see to the free unseen hex farthest from them: their view is
    // byte-identical, so their first moves must be too (C5: routes are planned on knowledge).
    const orders = Object.fromEntries(Object.keys(plans.intended).map((id) => [id, "open_the_road"]));
    // The Banners' moves until anything is revealed: a sighting (contact on the way) is new
    // information, and what follows it may rightly differ.
    const movesUnrevealed = (state: EngineState) => {
      const moves: string[] = [];
      for (const event of resolvePhase(state, orders, cinderRoad3).events as EngineEvent[]) {
        if (event.kind === "sighted" && event.faction === "free_banners") break;
        if (event.kind === "move" && event.squadId in orders) moves.push(`${event.squadId} ${event.path.map((hex) => `${hex.q},${hex.r}`).join(">")}`);
      }
      return moves;
    };
    let checked = 0;
    for (const phase of [1, 3]) {
      let state = createInitialState(cinderRoad3, { seed: 100001, fortune: "on" });
      while (state.phase < phase && state.status === "command") state = resolvePhase(state, orders, cinderRoad3).state;
      const moved = structuredClone(state);
      const ctx = { state: moved, scenario: cinderRoad3 };
      const banners = moved.squads.filter((squad) => squad.faction === "free_banners" && squad.status === "active" && squad.hex);
      const intel = moved.intel.free_banners ?? {};
      for (const squad of moved.squads.filter((item) => item.faction === "ashen_host" && item.status === "active" && !intel[item.id]?.visible)) {
        const free = cinderRoad3.board.hexes
          .map((hex) => hex.coord)
          .filter((hex) => !moved.squads.some((other) => other.hex && other.hex.q === hex.q && other.hex.r === hex.r))
          .filter((hex) => !["river", "wall"].includes(cinderRoad3.board.hexes.find((item) => item.coord.q === hex.q && item.coord.r === hex.r)!.terrain))
          .filter((hex) => !factionSees(ctx, "free_banners", hex));
        const away = (hex: { q: number; r: number }) => Math.min(...banners.map((banner) => hexDistance(banner.hex!, hex)));
        const target = free.sort((a, b) => away(b) - away(a))[0];
        if (!target) continue;
        squad.hex = { ...target };
        checked += 1;
      }
      expect(JSON.stringify(visibleState(moved, "free_banners"))).toBe(JSON.stringify(visibleState(state, "free_banners")));
      // Up to the first sighting in either world: after it, one side knows more.
      const truth = movesUnrevealed(state);
      const blind = movesUnrevealed(moved);
      const shared = Math.min(truth.length, blind.length);
      expect(shared, `phase ${phase}`).toBeGreaterThan(0);
      expect(blind.slice(0, shared), `phase ${phase}`).toEqual(truth.slice(0, shared));
    }
    expect(checked).toBeGreaterThan(0);
  });
});
