import { describe, expect, it } from "vitest";
import { getHex, hexKey, isPassableTerrain } from "../board";
import { playBattle } from "./balance";
import { doctrineLibrary } from "./doctrines";
import { winStage } from "./outcome";
import { createInitialState, resolvePhase } from "./resolvePhase";
import { holdForDawn } from "./scenarios/holdForDawn";
import type { EngineEvent, Orders } from "./types";

const intended = holdForDawn.referencePlans!.intended;
const companies = holdForDawn.squads.filter((squad) => squad.faction === "free_banners");
const host = holdForDawn.squads.filter((squad) => squad.faction === "ashen_host");

function battle(orders: Orders, seed: number, fortune: "on" | "off") {
  let state = createInitialState(holdForDawn, { seed, fortune });
  const events: EngineEvent[] = [];
  while (state.status === "command") {
    const result = resolvePhase(state, orders, holdForDawn);
    events.push(...result.events);
    state = result.state;
  }
  return { state, events };
}

describe("Hold for Dawn", () => {
  it("is the last wall at dawn: a 9x8 field, the wall down the east edge, the Last Gate in it", () => {
    const board = holdForDawn.board;
    expect([board.width, board.height]).toEqual([9, 8]);
    const wall = board.hexes.filter((hex) => hex.terrain === "wall");
    expect(wall.every((hex) => hex.coord.q === 8)).toBe(true);
    expect(wall).toHaveLength(8);
    expect(getHex(board, { q: 8, r: 3 })?.objectiveId).toBe("last_gate");
    expect(holdForDawn.timeOfDay).toBe("predawn");
    expect(holdForDawn.timeOfDayByPhase).toEqual({ 5: "sunrise" });
    expect(holdForDawn.forecast?.start).toBe("ashWind");
    expect(holdForDawn.winCondition).toEqual({ kind: "holdThenBreak", objectiveId: "last_gate", dawnPhase: 5, squadIds: ["cinderram"] });
    expect([4, 5].map((phase) => winStage(holdForDawn, phase))).toEqual(["hold", "break"]);
  });

  it("is valid scenario data: eleven companies, each side in its own deployment zone", () => {
    expect(companies.length).toBeGreaterThanOrEqual(10);
    expect(companies.length).toBeLessThanOrEqual(12);
    const occupied = new Set<string>();
    for (const setup of holdForDawn.squads) {
      const hex = getHex(holdForDawn.board, setup.hex);
      expect(hex && isPassableTerrain(hex.terrain), setup.id).toBe(true);
      expect(hex?.deploymentFaction, setup.id).toBe(setup.faction);
      expect(occupied.has(hexKey(setup.hex)), setup.id).toBe(false);
      occupied.add(hexKey(setup.hex));
      expect(doctrineLibrary[setup.doctrineId]?.faction).toBe(setup.faction);
    }
    expect(Object.keys(intended).sort()).toEqual(companies.map((squad) => squad.id).sort());
  });

  it("brings the champion, the ram under its hides, the fire-pots, and the nerve that fails at sunrise", () => {
    const champion = host.find((squad) => squad.renown)!;
    expect(champion).toMatchObject({ id: "kiln_born_oathguard", resolve: 3, renown: { title: "The Last Cinder" } });
    const ram = host.find((squad) => squad.id === "cinderram")!;
    expect(ram).toMatchObject({ role: "siege", doctrineId: "under_wet_hides" });
    const dawn = holdForDawn.hostSchedule.find((entry) => entry.phase === 5)!.orders;
    expect(dawn.cinderram).toBe("break_the_gate");
    expect(host.filter((squad) => squad.id !== "cinderram").every((squad) => dawn[squad.id] === "the_nerve_fails")).toBe(true);
    expect(doctrineLibrary.under_wet_hides.passives.cohesion).toBeGreaterThanOrEqual(10);
    // The hides burn through in the last hour of dark; fire-pots fall on the gate until the nerve fails.
    expect(holdForDawn.hostSchedule.find((entry) => entry.phase === 4)!.orders.cinderram).toBe("break_the_gate");
    expect(host.find((squad) => squad.id === "ash_mangonel")).toMatchObject({ role: "siege", doctrineId: "hurl_fire" });
  });

  it("wins deterministically with shields, standards and patient blades; giving ground loses", () => {
    expect(battle(intended, 1, "off").state.status).toBe("victory");
    expect(battle(holdForDawn.referencePlans!.bad, 1, "off").state.status).toBe("defeat");
  });

  it("holds through the night, bleeding at the gate, and breaks the ram at sunrise (curated seed)", () => {
    const { events, state } = battle(intended, holdForDawn.curatedSeed!, "on");
    expect(state.status).toBe("victory");
    const broken = companies.filter((setup) => state.squads.find((squad) => squad.id === setup.id)?.status !== "active");
    expect(broken.length).toBeLessThanOrEqual(1);
    // A near-miss, not a walkover: the fire-pots leave the gate between 40 and 70, and companies are shaken.
    expect(state.objectives[0].integrity).toBeGreaterThanOrEqual(40);
    expect(state.objectives[0].integrity).toBeLessThanOrEqual(70);
    expect(events.some((event) => event.kind === "objectiveDamage" && event.attackerId === "ash_mangonel")).toBe(true);
    expect(state.squads.some((squad) => squad.faction === "free_banners" && squad.status === "active" && squad.cohesion < 50)).toBe(true);
    expect(events.some((event) => event.kind === "rally")).toBe(true);
    const onRam = events.filter((event) => event.kind === "engagement" && event.defenderId === "cinderram");
    // Under the hides (phases 1-3) the ram shrugs off every blow; at sunrise a clean charge breaks it.
    for (const event of onRam.filter((item) => item.phase < 4)) {
      if (event.kind === "engagement") expect(event.cohesionChanges.cinderram).toBeGreaterThanOrEqual(-2);
    }
    expect(onRam.some((event) => event.phase === 5 && event.kind === "engagement" && event.charge && !event.reckless)).toBe(true);
    expect(events.find((event) => event.kind === "rout" && event.squadId === "cinderram")?.phase).toBe(5);
  });

  it("stalemates only when the wall held but the ram did not break, and the Host was bled", () => {
    for (let seed = 1; seed <= 60; seed += 1) {
      const final = playBattle(holdForDawn, intended, seed, "on");
      if (final.status !== "stalemate") continue;
      expect(final.objectives[0].integrity).toBeGreaterThan(0);
      expect(final.squads.find((squad) => squad.id === "cinderram")?.status).toBe("active");
      expect(final.squads.filter((squad) => squad.faction === "ashen_host" && squad.status !== "active").length).toBeGreaterThanOrEqual(5);
    }
  }, 60_000);
});
