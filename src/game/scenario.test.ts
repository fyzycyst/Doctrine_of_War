import { describe, expect, it } from "vitest";
import { getHex, hexDistance, hexKey } from "./board";
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

  it("places every squad on an existing board hex while preserving lane compatibility", () => {
    expect(firstBreachScenario.board).toBeDefined();

    for (const squad of firstBreachScenario.squads) {
      expect(squad.laneId).toBeTruthy();
      expect(squad.hex).toBeDefined();
      expect(getHex(firstBreachScenario.board!, squad.hex!)).toBeDefined();
    }
  });

  it("targets every scripted threat at an existing board hex while preserving lane compatibility", () => {
    expect(firstBreachScenario.board).toBeDefined();

    for (const phase of firstBreachScenario.scriptedOpponent) {
      for (const threat of phase.threats) {
        expect(threat.laneId).toBeTruthy();
        expect(threat.targetHex).toBeDefined();
        expect(getHex(firstBreachScenario.board!, threat.targetHex!)).toBeDefined();
      }
    }
  });

  it("uses a complete 5 by 5 tessellated board for the tutorial battlefield", () => {
    expect(firstBreachScenario.board).toBeDefined();

    const board = firstBreachScenario.board!;
    const boardKeys = new Set(board.hexes.map((hex) => hexKey(hex.coord)));
    const expectedKeys = new Set(
      Array.from({ length: board.width }, (_, q) =>
        Array.from({ length: board.height }, (_, r) => `${q},${r}`),
      ).flat(),
    );

    expect(board.width).toBe(5);
    expect(board.height).toBe(5);
    expect(board.hexes).toHaveLength(25);
    expect(boardKeys).toEqual(expectedKeys);
  });

  it("stages Free Banners near Greyford Gate and keeps Ashen Host on the approaches", () => {
    const gateHex = firstBreachScenario.board!.hexes.find((hex) => hex.objectiveId === "greyford_gate");
    expect(gateHex).toBeDefined();

    const playerSquads = firstBreachScenario.squads.filter((squad) => squad.faction === "free_banners");
    const hostSquads = firstBreachScenario.squads.filter((squad) => squad.faction === "ashen_host");
    const nearbyDefenders = playerSquads.filter(
      (squad) => squad.hex && hexDistance(squad.hex, gateHex!.coord) <= 2,
    );
    const adjacentHost = hostSquads.filter(
      (squad) => squad.hex && hexDistance(squad.hex, gateHex!.coord) <= 1,
    );

    expect(nearbyDefenders).toHaveLength(3);
    expect(adjacentHost).toHaveLength(0);
  });
});
