import { describe, expect, it } from "vitest";
import { createInitialState, firstBreach, saltmarshColumn, visibleState, type VisibleSquad } from "../../game/engine";
import { companyTally } from "./Outcome";

const own = (scenario: typeof firstBreach) =>
  visibleState(createInitialState(scenario, { fortune: "off" }), "free_banners").squads.filter((squad) => squad.faction === "free_banners");

const set = (squads: VisibleSquad[], changes: Record<string, VisibleSquad["status"]>) =>
  squads.map((squad) => (changes[squad.id] ? { ...squad, status: changes[squad.id], hex: null } : squad));

describe("the outcome's company tally", () => {
  it("counts standing companies in a battle to hold", () => {
    expect(companyTally(set(own(firstBreach), { mercy_standard: "routed" }))).toBe("3 of 4 companies still standing");
  });

  it("counts an escape as a success and reports the Column on its own", () => {
    const squads = set(own(saltmarshColumn), {
      saltmarsh_column: "escaped",
      greyford_shields: "escaped",
      dawnwatch_archers: "escaped",
      mercy_standard: "escaped",
      kestrel_lancers: "routed",
    });
    expect(companyTally(squads)).toBe("The Column is safe · 3 companies escaped · 2 still on the field · 1 lost");
  });
});
