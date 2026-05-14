import { describe, expect, it } from "vitest";
import { createInitialBattleState, firstBreachScenario } from "./scenario";

describe("first breach scenario", () => {
  it("loads the tutorial fixture with the Free Banners as the player", () => {
    expect(firstBreachScenario.title).toBe("The First Breach");
    expect(firstBreachScenario.playerFaction).toBe("free_banners");
    expect(firstBreachScenario.initiativeSide).toBe("ashen_host");
    expect(firstBreachScenario.lanes).toHaveLength(3);
  });

  it("has valid doctrine references for every squad", () => {
    const doctrineIds = new Set(firstBreachScenario.doctrines.map((doctrine) => doctrine.id));

    for (const squad of firstBreachScenario.squads) {
      expect(doctrineIds.has(squad.assignedDoctrineId)).toBe(true);
    }
  });

  it("has enough assignable Free Banners squads and doctrines for the MVP", () => {
    const playerSquads = firstBreachScenario.squads.filter(
      (squad) => squad.faction === "free_banners",
    );
    const playerDoctrines = firstBreachScenario.doctrines.filter(
      (doctrine) => doctrine.faction === "free_banners",
    );

    expect(playerSquads.length).toBeGreaterThanOrEqual(3);
    expect(playerDoctrines.length).toBeGreaterThanOrEqual(5);
  });

  it("creates an initial battle state that can reach terminal phases", () => {
    const state = createInitialBattleState();

    expect(state.status).toBe("command");
    expect(state.currentPhase).toBe(1);
    expect(state.maxPhases).toBe(3);
    expect(state.objectives[0].integrity).toBe(100);
  });
});

