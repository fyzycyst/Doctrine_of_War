import { describe, expect, it } from "vitest";
import { getHex, hexKey, isPassableTerrain } from "../board";
import { balancePlans, playBattle } from "./balance";
import { doctrineLibrary } from "./doctrines";
import { createInitialState, isOrderAllowed, resolvePhase } from "./resolvePhase";
import { saltmarshColumn } from "./scenarios/saltmarshColumn";
import { advanceRate } from "./testKit";
import type { EngineEvent, Orders } from "./types";

const intended = saltmarshColumn.referencePlans!.intended;
const companies = saltmarshColumn.squads.filter((squad) => squad.faction === "free_banners" && !squad.noncombatant);
const hunters = saltmarshColumn.squads.filter((squad) => squad.faction === "ashen_host");
const everyone = (doctrineId: string): Orders => Object.fromEntries(companies.map((squad) => [squad.id, doctrineId]));

function battle(orders: Orders, seed: number, fortune: "on" | "off") {
  let state = createInitialState(saltmarshColumn, { seed, fortune });
  const events: EngineEvent[] = [];
  while (state.status === "command") {
    const result = resolvePhase(state, orders, saltmarshColumn);
    events.push(...result.events);
    state = result.state;
  }
  return { state, events };
}

describe("The Saltmarsh Column", () => {
  it("is a grey-rain marsh crossing: causeways, marsh, reed banks, and a southern edge to reach", () => {
    const board = saltmarshColumn.board;
    expect([board.width, board.height]).toEqual([7, 8]);
    const count = (terrain: string) => board.hexes.filter((hex) => hex.terrain === terrain).length;
    expect(count("marsh")).toBeGreaterThan(15);
    expect(count("road")).toBeGreaterThanOrEqual(8);
    expect(count("reeds")).toBeGreaterThanOrEqual(4);
    expect(saltmarshColumn.timeOfDay).toBe("rainGrey");
    expect(saltmarshColumn.forecast).toMatchObject({ start: "rain", shifts: expect.arrayContaining(["mist"]) });
    const win = saltmarshColumn.winCondition;
    expect(win).toMatchObject({ kind: "escapeEdge", count: 4, mustEscape: ["saltmarsh_column"] });
    if (win.kind === "escapeEdge") {
      expect(win.edgeHexes.every((hex) => hex.r === board.height - 1)).toBe(true);
    }
  });

  it("is valid scenario data, with a noncombatant column the player cannot order", () => {
    const occupied = new Set<string>();
    for (const setup of saltmarshColumn.squads) {
      const hex = getHex(saltmarshColumn.board, setup.hex);
      expect(hex && isPassableTerrain(hex.terrain), setup.id).toBe(true);
      expect(occupied.has(hexKey(setup.hex)), setup.id).toBe(false);
      occupied.add(hexKey(setup.hex));
      expect(doctrineLibrary[setup.doctrineId]?.faction).toBe(setup.faction);
    }
    const column = saltmarshColumn.squads.find((squad) => squad.id === "saltmarsh_column")!;
    expect(column).toMatchObject({ noncombatant: true, doctrineId: "keep_the_column_moving", role: "support" });
    expect(isOrderAllowed(saltmarshColumn, "saltmarsh_column", "fighting_withdrawal")).toBe(false);
    expect(isOrderAllowed(saltmarshColumn, "saltmarsh_column", "keep_the_column_moving")).toBe(false);
    expect(() => resolvePhase(createInitialState(saltmarshColumn), { saltmarsh_column: "fighting_withdrawal" }, saltmarshColumn)).toThrow();
    expect(balancePlans(saltmarshColumn).every((plan) => !("saltmarsh_column" in plan.orders))).toBe(true);
    expect(companies).toHaveLength(6);
    expect(saltmarshColumn.playerDoctrineIds).not.toContain("keep_the_column_moving");
  });

  it("brings the hunters in waves, out of the reeds and the mist", () => {
    const waiting = saltmarshColumn.hostSchedule[0].orders;
    expect(Object.values(waiting).filter((id) => id === "lie_in_wait")).toHaveLength(2);
    expect(saltmarshColumn.hostSchedule.map((entry) => entry.phase)).toEqual([1, 2, 3, 4]);
    expect(hunters.filter((squad) => squad.role === "cavalry").length).toBeGreaterThanOrEqual(2);
    expect(hunters.find((squad) => squad.renown)?.renown?.title).toBe("The Drowned Hounds");
  });

  it("wins deterministically by withdrawing with the Standard at the column's side; standing and fighting loses", () => {
    expect(battle(intended, 1, "off").state.status).toBe("victory");
    expect(battle(saltmarshColumn.referencePlans!.bad, 1, "off").state.status).toBe("defeat");
    expect(battle(everyone("fighting_withdrawal"), 1, "off").state.status).toBe("defeat");
  });

  it("needs both doctrine families: ablating either costs at least 15 points of advance rate", () => {
    const base = advanceRate(saltmarshColumn, intended);
    expect(base).toBeGreaterThanOrEqual(0.75);
    const ablations: Record<string, Orders> = {
      "Standard -> Withdrawal": { ...intended, mercy_standard: "fighting_withdrawal" },
      "Withdrawal -> Shield the Line": { ...everyone("shield_the_line"), mercy_standard: "rescue_standard" },
      "Withdrawal -> Counterstroke": { ...everyone("clean_counterstroke"), mercy_standard: "rescue_standard" },
    };
    for (const [label, orders] of Object.entries(ablations)) {
      expect(base - advanceRate(saltmarshColumn, orders), label).toBeGreaterThanOrEqual(0.15);
    }
  }, 60_000);

  it("keeps the Standard marching at the column's side, rallying it (curated seed)", () => {
    const { events, state } = battle(intended, saltmarshColumn.curatedSeed!, "on");
    expect(state.status).toBe("victory");
    expect(events.some((event) => event.kind === "ruleFired" && event.ruleId === "rs_escort")).toBe(true);
    expect(events.some((event) => event.kind === "rally" && event.targetId === "saltmarsh_column")).toBe(true);
    expect(state.squads.find((squad) => squad.id === "saltmarsh_column")?.status).toBe("escaped");
  });

  it("loses at once if the column is lost, and stalemates only if the column and all but one company got out", () => {
    const outcomes = new Set<string>();
    for (let seed = 1; seed <= 120; seed += 1) {
      const final = playBattle(saltmarshColumn, intended, seed, "on");
      const column = final.squads.find((squad) => squad.id === "saltmarsh_column")!;
      const escaped = final.squads.filter((squad) => squad.faction === "free_banners" && squad.status === "escaped").length;
      if (final.status === "stalemate") {
        expect(column.status).toBe("escaped");
        expect(escaped).toBe(3);
      }
      if (column.status === "routed" || column.status === "destroyed") {
        expect(final.status).toBe("defeat");
      }
      outcomes.add(final.status);
    }
    expect(outcomes.has("victory")).toBe(true);
  }, 60_000);
});
