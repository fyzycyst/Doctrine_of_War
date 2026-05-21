import { describe, expect, it } from "vitest";
import { createInitialBattleState, firstBreachScenario } from "./scenario";
import { resolvePhase } from "./resolvePhase";
import type { BattleState, DoctrineAssignments, Scenario } from "./types";

const allAssignments = (doctrineId: string): DoctrineAssignments =>
  Object.fromEntries(
    firstBreachScenario.squads
      .filter((squad) => squad.faction === "free_banners")
      .map((squad) => [squad.id, doctrineId]),
  );

const defaultAssignments: DoctrineAssignments = {
  greyford_shields: "shield_the_line",
  dawnwatch_archers: "clean_counterstroke",
  mercy_standard: "rescue_standard",
  stoneford_riders: "fighting_withdrawal",
};

const defensiveAssignments: DoctrineAssignments = {
  greyford_shields: "shield_the_line",
  dawnwatch_archers: "shield_the_line",
  mercy_standard: "shield_the_line",
  stoneford_riders: "shield_the_line",
};

const scenarioWithThreat = (targetHex: { q: number; r: number }, pressure = 24): Scenario => ({
  ...firstBreachScenario,
  scriptedOpponent: [
    {
      phase: 1,
      hostIntent: "Test hex pressure.",
      threats: [
        {
          laneId: "gate_road",
          targetHex,
          attackerSquadId: "gatebreak_engine",
          pressure,
          note: "test pressure",
        },
      ],
    },
  ],
});

describe("resolvePhase", () => {
  it("records Ashen Host initiative before resolving Free Banners doctrine", () => {
    const next = resolvePhase(createInitialBattleState(), defaultAssignments);

    expect(next.events[0]).toMatchObject({
      faction: "ashen_host",
      kind: "initiative",
    });
    expect(next.reports[0].title).toContain("The Host moves first");
  });

  it("makes different doctrines produce different objective outcomes", () => {
    const shieldResult = resolvePhase(createInitialBattleState(), allAssignments("shield_the_line"));
    const withdrawResult = resolvePhase(
      createInitialBattleState(),
      allAssignments("fighting_withdrawal"),
    );

    expect(shieldResult.objectives[0].integrity).toBeGreaterThan(
      withdrawResult.objectives[0].integrity,
    );
    expect(withdrawResult.reports[0].notes.join(" ")).toContain("yielded ground");
  });

  it("uses Resolve as a larger cohesion/reliability effect than raw strength effect", () => {
    const veteranState = createInitialBattleState();
    const shakenState = createInitialBattleState();

    veteranState.squads = veteranState.squads.map((squad) =>
      squad.id === "greyford_shields" ? { ...squad, resolve: 3 } : squad,
    );
    shakenState.squads = shakenState.squads.map((squad) =>
      squad.id === "greyford_shields" ? { ...squad, resolve: -3 } : squad,
    );

    const veteran = resolvePhase(veteranState, defaultAssignments).squads.find(
      (squad) => squad.id === "greyford_shields",
    );
    const shaken = resolvePhase(shakenState, defaultAssignments).squads.find(
      (squad) => squad.id === "greyford_shields",
    );

    expect(veteran).toBeDefined();
    expect(shaken).toBeDefined();
    expect(veteran!.cohesion).toBeGreaterThan(shaken!.cohesion);
    expect(veteran!.strength - shaken!.strength).toBeLessThanOrEqual(4);
  });

  it("can reach victory when the gate stands through the final phase", () => {
    let state = createInitialBattleState();

    state = resolvePhase(state, allAssignments("shield_the_line"));
    state = resolvePhase(state, allAssignments("shield_the_line"));
    state = resolvePhase(state, allAssignments("shield_the_line"));

    expect(state.status).toBe("victory");
    expect(state.objectives[0].integrity).toBeGreaterThan(0);
  });

  it("can reach defeat when the gate integrity collapses", () => {
    const fragileState: BattleState = {
      ...createInitialBattleState(),
      objectives: [{ ...createInitialBattleState().objectives[0], integrity: 8 }],
    };
    const defeated = resolvePhase(
      fragileState,
      allAssignments("fighting_withdrawal"),
      scenarioWithThreat({ q: 3, r: 2 }, 90),
    );

    expect(defeated.status).toBe("defeat");
    expect(defeated.reports[0].notes.join(" ")).toContain("collapses");
  });

  it("rejects doctrine assignments that cross faction boundaries", () => {
    expect(() =>
      resolvePhase(createInitialBattleState(), {
        ...defaultAssignments,
        greyford_shields: "iron_tide",
      }),
    ).toThrow("Invalid doctrine assignment");
  });

  it("omits zero-strength casualty lines from the prose report", () => {
    const next = resolvePhase(createInitialBattleState(), defaultAssignments);

    expect(next.reports[0].casualties.some((item) => item.includes("lost 0 strength"))).toBe(false);
  });

  it("engages defenders adjacent to the threat hex and ignores distant defenders in the same lane", () => {
    const state = createInitialBattleState();
    state.squads = state.squads.map((squad) => {
      if (squad.id === "greyford_shields") {
        return { ...squad, laneId: "gate_road", hex: { q: 3, r: 2 } };
      }

      if (squad.id === "dawnwatch_archers") {
        return { ...squad, laneId: "gate_road", hex: { q: 0, r: 0 } };
      }

      if (squad.id === "mercy_standard") {
        return { ...squad, hex: { q: 0, r: 4 } };
      }

      if (squad.id === "stoneford_riders") {
        return { ...squad, hex: { q: 1, r: 4 } };
      }

      return squad;
    });

    const next = resolvePhase(state, defensiveAssignments, scenarioWithThreat({ q: 3, r: 2 }));
    const shields = next.squads.find((squad) => squad.id === "greyford_shields");
    const archers = next.squads.find((squad) => squad.id === "dawnwatch_archers");

    expect(shields?.cohesion).toBeLessThan(76);
    expect(archers?.cohesion).toBe(70);
    expect(next.reports[0].phaseEvents).toContainEqual(
      expect.objectContaining({
        kind: "engagement",
        attackerSquadId: "gatebreak_engine",
        defenderSquadIds: ["greyford_shields"],
        targetHex: { q: 3, r: 2 },
      }),
    );
  });

  it("uses defender terrain to reduce cohesion loss and objective pressure", () => {
    const fieldScenario = scenarioWithThreat({ q: 3, r: 2 }, 30);
    const wallScenario: Scenario = {
      ...fieldScenario,
      board: {
        ...firstBreachScenario.board!,
        hexes: firstBreachScenario.board!.hexes.map((hex) =>
          hex.coord.q === 3 && hex.coord.r === 2 ? { ...hex, terrain: "wall" } : hex,
        ),
      },
    };
    const exposedState = () => {
      const state = createInitialBattleState();

      state.squads = state.squads.map((squad) => {
        if (squad.id === "mercy_standard") {
          return { ...squad, hex: { q: 0, r: 4 } };
        }

        if (squad.id === "stoneford_riders") {
          return { ...squad, hex: { q: 1, r: 4 } };
        }

        return squad;
      });
      return state;
    };

    const fieldResult = resolvePhase(exposedState(), defensiveAssignments, fieldScenario);
    const wallResult = resolvePhase(exposedState(), defensiveAssignments, wallScenario);
    const fieldShields = fieldResult.squads.find((squad) => squad.id === "greyford_shields");
    const wallShields = wallResult.squads.find((squad) => squad.id === "greyford_shields");

    expect(wallShields?.cohesion).toBeGreaterThan(fieldShields?.cohesion ?? 0);
    expect(wallResult.objectives[0].integrity).toBeGreaterThan(fieldResult.objectives[0].integrity);
    expect(wallResult.reports[0].notes.join(" ")).toContain("wall terrain");
  });

  it("supports neighboring allies but not lower-cohesion distant allies", () => {
    const state = createInitialBattleState();
    state.squads = state.squads.map((squad) => {
      if (squad.id === "greyford_shields") {
        return { ...squad, cohesion: 50, hex: { q: 3, r: 2 } };
      }

      if (squad.id === "mercy_standard") {
        return { ...squad, hex: { q: 3, r: 1 } };
      }

      if (squad.id === "stoneford_riders") {
        return { ...squad, cohesion: 10, hex: { q: 0, r: 4 } };
      }

      return squad;
    });
    const quietScenario: Scenario = {
      ...firstBreachScenario,
      scriptedOpponent: [{ phase: 1, hostIntent: "No attack.", threats: [] }],
    };

    const next = resolvePhase(state, defaultAssignments, quietScenario);
    const shields = next.squads.find((squad) => squad.id === "greyford_shields");
    const riders = next.squads.find((squad) => squad.id === "stoneford_riders");

    expect(shields?.cohesion).toBeGreaterThan(50);
    expect(riders?.cohesion).toBe(10);
    expect(next.reports[0].phaseEvents).toContainEqual(
      expect.objectContaining({
        kind: "support",
        sourceSquadId: "mercy_standard",
        targetSquadId: "greyford_shields",
        affectedHexes: [{ q: 3, r: 2 }],
      }),
    );
  });

  it("generates objective damage events only for gate and gate-approach threats", () => {
    const farResult = resolvePhase(
      createInitialBattleState(),
      defensiveAssignments,
      scenarioWithThreat({ q: 2, r: 1 }, 32),
    );
    const approachResult = resolvePhase(
      createInitialBattleState(),
      defensiveAssignments,
      scenarioWithThreat({ q: 3, r: 2 }, 90),
    );

    expect(farResult.objectives[0].integrity).toBe(100);
    expect(farResult.reports[0].phaseEvents.some((event) => event.kind === "objectiveDamage")).toBe(false);
    expect(approachResult.objectives[0].integrity).toBeLessThan(100);
    expect(approachResult.reports[0].phaseEvents).toContainEqual(
      expect.objectContaining({
        kind: "objectiveDamage",
        objectiveId: "greyford_gate",
        hex: { q: 3, r: 2 },
        oldIntegrity: 100,
      }),
    );
  });
});
