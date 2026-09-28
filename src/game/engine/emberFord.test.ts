import { describe, expect, it } from "vitest";
import { getHex, hexKey, isPassableTerrain } from "../board";
import { playBattle } from "./balance";
import { doctrineLibrary } from "./doctrines";
import { isLit, sightRange } from "./fog";
import { createInitialState, resolvePhase } from "./resolvePhase";
import { emberFord } from "./scenarios/emberFord";
import type { EngineEvent, Orders } from "./types";

const intended = emberFord.referencePlans!.intended;
const banners = emberFord.squads.filter((squad) => squad.faction === "free_banners");
const host = emberFord.squads.filter((squad) => squad.faction === "ashen_host");
const everyone = (doctrineId: string): Orders => Object.fromEntries(banners.map((squad) => [squad.id, doctrineId]));

function battle(orders: Orders, seed: number, fortune: "on" | "off") {
  let state = createInitialState(emberFord, { seed, fortune });
  const events: EngineEvent[] = [];
  while (state.status === "command") {
    const result = resolvePhase(state, orders, emberFord);
    events.push(...result.events);
    state = result.state;
  }
  return { state, events };
}

const winRate = (orders: Orders, seeds = 60) => {
  let wins = 0;
  for (let seed = 1; seed <= seeds; seed += 1) {
    wins += playBattle(emberFord, orders, seed, "on").status === "victory" ? 1 : 0;
  }
  return wins / seeds;
};

describe("Ember Ford", () => {
  it("is a 7x6 night crossing: a river line with two fords, a ridge over the fords, and ruins", () => {
    const board = emberFord.board;
    expect([board.width, board.height, board.hexes.length]).toEqual([7, 6, 42]);
    const terrain = (q: number, r: number) => getHex(board, { q, r })?.terrain;
    expect(Array.from({ length: 6 }, (_, r) => terrain(3, r))).toEqual(["river", "ford", "river", "river", "ford", "river"]);
    expect(board.hexes.filter((hex) => hex.terrain === "ridge")).toHaveLength(1);
    expect(board.hexes.filter((hex) => hex.terrain === "ruin").length).toBeGreaterThanOrEqual(2);
    expect(emberFord.timeOfDay).toBe("nightFires");
    expect(emberFord.forecast).toMatchObject({ start: "clear", shifts: expect.arrayContaining(["rain"]) });
  });

  it("is valid scenario data", () => {
    const occupied = new Set<string>();
    for (const setup of emberFord.squads) {
      const hex = getHex(emberFord.board, setup.hex);
      expect(hex && isPassableTerrain(hex.terrain), setup.id).toBe(true);
      expect(occupied.has(hexKey(setup.hex)), setup.id).toBe(false);
      occupied.add(hexKey(setup.hex));
      expect(doctrineLibrary[setup.doctrineId]?.faction).toBe(setup.faction);
    }
    // Banners hold the far (east) bank, the Host the near (west) bank.
    expect(banners.every((squad) => squad.hex.q > 3)).toBe(true);
    expect(host.every((squad) => squad.hex.q < 3)).toBe(true);
    expect(banners.length).toBeGreaterThanOrEqual(6);
    expect(banners.length).toBeLessThanOrEqual(8);
    expect(banners.some((squad) => squad.role === "cavalry")).toBe(true);
    for (const entry of emberFord.hostSchedule) {
      for (const [squadId, doctrineId] of Object.entries(entry.orders)) {
        expect(host.some((squad) => squad.id === squadId)).toBe(true);
        expect(doctrineLibrary[doctrineId].faction).toBe("ashen_host");
      }
    }
    expect(emberFord.hostSchedule.map((entry) => entry.phase)).toEqual([1, 2, 3, 4, 5]);
    const win = emberFord.winCondition;
    expect(win.kind).toBe("destroySquads");
    if (win.kind === "destroySquads") {
      expect(win.squadIds.length).toBeGreaterThanOrEqual(3);
      expect(win.squadIds.every((id) => host.some((squad) => squad.id === id))).toBe(true);
    }
    const escape = emberFord.defeatConditions?.find((condition) => condition.kind === "enemyEscape");
    expect(escape?.kind === "enemyEscape" && escape.edgeHexes.every((hex) => isPassableTerrain(getHex(emberFord.board, hex)!.terrain))).toBe(true);
    expect(emberFord.defeatConditions?.some((condition) => condition.kind === "squadsLost")).toBe(true);
    expect(emberFord.playerDoctrineIds).toHaveLength(5);
  });

  it("ends in a stalemate, not a defeat, when the night runs out with nobody through", () => {
    expect(emberFord.timeoutOutcome).toBe("stalemate");
    // A line of rally banners never breaks the vanguard, but never lets it through either.
    expect(battle(everyone("rescue_standard"), 1, "off").state.status).toBe("stalemate");
  });

  it("fields exactly one renowned Host champion", () => {
    const renowned = host.filter((squad) => squad.renown);
    expect(renowned.map((squad) => squad.id)).toEqual(["pyre_sworn"]);
    expect(renowned[0].renown?.title).toBe("The Unquenched");
  });

  it("wins deterministically with the intended plan; a wall of Shield the Line loses", () => {
    expect(battle(intended, 1, "off").state.status).toBe("victory");
    const wall = battle(everyone("shield_the_line"), 1, "off");
    expect(wall.state.status).toBe("defeat");
    expect(emberFord.referencePlans!.bad).toEqual(everyone("shield_the_line"));
  });

  it("teaches Counterstroke against overextension, kept steady by a rally banner", () => {
    const intendedRate = winRate(intended);
    expect(intendedRate).toBeGreaterThanOrEqual(0.7);
    // Without the Lanternbearers' rally, dread and attrition break the counterstroke.
    expect(winRate(everyone("clean_counterstroke"))).toBeLessThan(intendedRate - 0.3);
    // A line that only holds never breaks the vanguard.
    expect(winRate(everyone("shield_the_line"))).toBe(0);
  });

  it("strikes crossers cleanly and punishes charges into supported companies", () => {
    const { events } = battle(intended, 2, "on");
    const charges = events.filter((event) => event.kind === "engagement" && event.charge);
    expect(charges.some((event) => event.kind === "engagement" && !event.reckless)).toBe(true);
    const all = [1, 2, 3, 4, 5, 6].flatMap((seed) => battle(intended, seed, "on").events);
    expect(all.some((event) => event.kind === "engagement" && event.reckless)).toBe(true);
  });

  it("lets green Banner companies feel the Unquenched on first sighting", () => {
    const { events } = battle(intended, 2, "on");
    const dread = events.filter((event) => event.kind === "dread");
    expect(dread.length).toBeGreaterThan(0);
    expect(dread.every((event) => event.kind === "dread" && event.sourceId === "pyre_sworn")).toBe(true);
    expect(battle(intended, 2, "off").events.some((event) => event.kind === "dread")).toBe(false);
  });

  it("lights the fords at night, so crossers are seen from further away", () => {
    const state = createInitialState(emberFord, { fortune: "on" });
    const ctx = { state, scenario: emberFord };
    expect(isLit(ctx, { q: 3, r: 1 })).toBe(true);
    expect(isLit(ctx, { q: 4, r: 2 })).toBe(true);
    expect(isLit(ctx, { q: 6, r: 2 })).toBe(false);
    const bowmen = state.squads.find((squad) => squad.id === "ashfen_bowmen")!;
    // Ridge +1, night -1.
    expect(sightRange(ctx, { ...bowmen, hex: bowmen.hex! })).toBe(2);
  });
});
