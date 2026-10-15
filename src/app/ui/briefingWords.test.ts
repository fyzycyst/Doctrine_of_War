import { describe, expect, it } from "vitest";
import { firstBreach, holdForDawn, saltmarshColumn } from "../../game/engine";
import { conditionsInWords } from "./Briefing";

describe("briefing conditions in plain words", () => {
  it("names the Cinderram and keeps names lower-case mid-sentence", () => {
    expect(conditionsInWords(holdForDawn).win).toBe("Keep the Last Gate standing until dawn (phase 5), then break the Cinderram before 5 phases are out.");
    // At the start of a sentence the capital stays.
    expect(conditionsInWords(holdForDawn).lose[0]).toBe("The Last Gate is battered down.");
  });

  it("names an objective the player must not lose alongside an offensive win (objectiveLost)", () => {
    const scen = {
      ...structuredClone(holdForDawn),
      objectives: [...holdForDawn.objectives, { id: "their_wagons", name: "The Wagons", description: "", hex: { q: 0, r: 0 }, integrity: 30, defender: "ashen_host" as const }],
      winCondition: { kind: "breakObjective" as const, objectiveId: "their_wagons" },
      defeatConditions: [{ kind: "objectiveLost" as const, objectiveId: holdForDawn.objectives[0].id }],
    };
    expect(conditionsInWords(scen).win).toBe("Batter the Wagons down within 5 phases.");
    expect(conditionsInWords(scen).lose).toContain("The Last Gate is battered down.");
  });

  it("says the Column must be among those who get out", () => {
    expect(conditionsInWords(saltmarshColumn).win).toBe("Get the Column and 3 more off the field through the far edge within 4 phases.");
  });

  it("leaves the first battle's words as they were", () => {
    expect(conditionsInWords(firstBreach).win).toBe("Keep Greyford Gate standing through all 3 phases.");
  });
});
