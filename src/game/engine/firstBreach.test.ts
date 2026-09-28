import { describe, expect, it } from "vitest";
import { getHex, hexKey, isPassableTerrain } from "../board";
import { doctrineLibrary } from "./doctrines";
import { createInitialState, resolvePhase } from "./resolvePhase";
import { firstBreach } from "./scenarios/firstBreach";
import type { EngineEvent, EngineState, Orders } from "./types";

const playerSquads = firstBreach.squads.filter((item) => item.faction === "free_banners").map((item) => item.id);
const everyone = (doctrineId: string): Orders => Object.fromEntries(playerSquads.map((id) => [id, doctrineId]));

const intendedPlan: Orders = firstBreach.referencePlans!.intended;

function playBattle(orders: Orders, seed = 1) {
  let state: EngineState = createInitialState(firstBreach, { seed, fortune: "off" });
  const events: EngineEvent[] = [];
  while (state.status === "command") {
    const result = resolvePhase(state, orders, firstBreach);
    state = result.state;
    events.push(...result.events);
  }
  return { state, events, gate: state.objectives[0].integrity };
}

describe("The First Breach (v2)", () => {
  it("is valid scenario data", () => {
    const occupied = new Set<string>();
    for (const setup of firstBreach.squads) {
      const hex = getHex(firstBreach.board, setup.hex);
      expect(hex && isPassableTerrain(hex.terrain), setup.id).toBe(true);
      expect(occupied.has(hexKey(setup.hex))).toBe(false);
      occupied.add(hexKey(setup.hex));
      expect(doctrineLibrary[setup.doctrineId]?.faction).toBe(setup.faction);
    }
    for (const entry of firstBreach.hostSchedule) {
      for (const [squadId, doctrineId] of Object.entries(entry.orders)) {
        expect(firstBreach.squads.find((item) => item.id === squadId)?.faction).toBe("ashen_host");
        expect(doctrineLibrary[doctrineId]?.faction).toBe("ashen_host");
      }
    }
    expect(firstBreach.hostSchedule.map((entry) => entry.phase)).toEqual([1, 2, 3]);
    for (const id of firstBreach.playerDoctrineIds) {
      expect(doctrineLibrary[id].faction).toBe("free_banners");
    }
    const gate = firstBreach.objectives[0];
    expect(getHex(firstBreach.board, gate.hex)?.objectiveId).toBe(gate.id);
  });

  it("holds the gate with the intended plan (Shield the Line at the gate, Rescue Standard adjacent)", () => {
    expect(intendedPlan).toMatchObject({ greyford_shields: "shield_the_line", mercy_standard: "rescue_standard" });
    const { state, gate } = playBattle(intendedPlan);
    expect(state.status).toBe("victory");
    expect(gate).toBeGreaterThan(0);
  });

  it("loses the gate when every company uses Fighting Withdrawal", () => {
    const { state, gate, events } = playBattle(everyone("fighting_withdrawal"));
    expect(state.status).toBe("defeat");
    expect(gate).toBe(0);
    expect(events.some((event) => event.kind === "objectiveDamage" && event.attackerId === "gatebreak_engine")).toBe(true);
  });

  it("gives the Host real movement driven by its scheduled doctrines", () => {
    const { events } = playBattle(intendedPlan);
    const hostMovers = new Set(
      events
        .filter((event) => event.kind === "move")
        .map((event) => ("squadId" in event ? event.squadId : ""))
        .filter((id) => firstBreach.squads.find((item) => item.id === id)?.faction === "ashen_host"),
    );
    expect(hostMovers.size).toBeGreaterThanOrEqual(3);
    const hostRules = new Set(
      events.filter((event) => event.kind === "ruleFired" && event.doctrineId !== undefined).map((event) => ("doctrineId" in event ? event.doctrineId : "")),
    );
    for (const id of ["iron_tide", "break_the_gate", "terror_push", "cull_the_weak", "no_step_back"]) {
      expect(hostRules.has(id), id).toBe(true);
    }
  });

  it("is reproducible: the same plan and seed give the same battle", () => {
    expect(playBattle(intendedPlan, 5)).toEqual(playBattle(intendedPlan, 5));
  });
});
