import { describe, expect, it } from "vitest";
import { getHex, hexDistance, hexKey } from "./board";
import { readabilityScenario } from "./readabilityScenario";

describe("readability scenario fixture", () => {
  it("stresses board readability beyond the tutorial size without becoming campaign scope", () => {
    expect(readabilityScenario.id).toBe("readability_gate_stress");
    expect(readabilityScenario.board).toBeDefined();

    const board = readabilityScenario.board!;
    const playerSquads = readabilityScenario.squads.filter((squad) => squad.faction === "free_banners");
    const hostSquads = readabilityScenario.squads.filter((squad) => squad.faction === "ashen_host");
    const totalThreats = readabilityScenario.scriptedOpponent.reduce(
      (sum, phase) => sum + phase.threats.length,
      0,
    );

    expect(board.width).toBeGreaterThanOrEqual(7);
    expect(board.height).toBeGreaterThanOrEqual(7);
    expect(board.hexes.length).toBeGreaterThanOrEqual(49);
    expect(readabilityScenario.squads.length).toBeGreaterThanOrEqual(12);
    expect(readabilityScenario.squads.length).toBeLessThanOrEqual(16);
    expect(playerSquads.length).toBeGreaterThanOrEqual(6);
    expect(hostSquads.length).toBeGreaterThanOrEqual(6);
    expect(totalThreats).toBeGreaterThanOrEqual(6);
  });

  it("uses a complete rectangular axial board with valid squad, objective, and threat coordinates", () => {
    const board = readabilityScenario.board!;
    const boardKeys = new Set(board.hexes.map((hex) => hexKey(hex.coord)));
    const expectedKeys = new Set(
      Array.from({ length: board.width }, (_, q) =>
        Array.from({ length: board.height }, (_, r) => `${q},${r}`),
      ).flat(),
    );

    expect(boardKeys).toEqual(expectedKeys);

    const occupiedHexes = new Set<string>();
    for (const squad of readabilityScenario.squads) {
      expect(squad.hex).toBeDefined();
      expect(getHex(board, squad.hex!)).toBeDefined();
      expect(occupiedHexes.has(hexKey(squad.hex!))).toBe(false);
      occupiedHexes.add(hexKey(squad.hex!));
    }

    for (const objective of readabilityScenario.objectives) {
      const objectiveHex = board.hexes.find((hex) => hex.objectiveId === objective.id);

      expect(objectiveHex).toBeDefined();
    }

    for (const phase of readabilityScenario.scriptedOpponent) {
      for (const threat of phase.threats) {
        expect(threat.targetHex).toBeDefined();
        expect(getHex(board, threat.targetHex!)).toBeDefined();
      }
    }
  });

  it("creates enough event pressure to evaluate token crowding and playback length", () => {
    const board = readabilityScenario.board!;
    const objectiveHexes = board.hexes.filter((hex) => hex.objectiveId);
    const terrainTypes = new Set(board.hexes.map((hex) => hex.terrain));
    const targetHexes = new Set(
      readabilityScenario.scriptedOpponent.flatMap((phase) =>
        phase.threats.map((threat) => hexKey(threat.targetHex!)),
      ),
    );
    const supportSquads = readabilityScenario.squads.filter(
      (squad) => squad.assignedDoctrineId === "rescue_standard",
    );
    const adjacentSupportTargets = readabilityScenario.squads.filter(
      (squad) =>
        squad.faction === "free_banners" &&
        supportSquads.some(
          (support) => support.id !== squad.id && support.hex && squad.hex && hexDistance(support.hex, squad.hex) <= 1,
        ),
    );

    expect(objectiveHexes).toHaveLength(2);
    expect(terrainTypes.size).toBeGreaterThanOrEqual(5);
    expect(targetHexes.size).toBeGreaterThanOrEqual(5);
    expect(supportSquads.length).toBeGreaterThanOrEqual(2);
    expect(adjacentSupportTargets.length).toBeGreaterThanOrEqual(3);
  });
});
