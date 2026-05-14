import { describe, expect, it } from "vitest";
import { createInitialBattleState, firstBreachScenario } from "./scenario";
import { resolvePhase } from "./resolvePhase";
import type { BattleState, DoctrineAssignments } from "./types";

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
    const defeated = resolvePhase(fragileState, allAssignments("fighting_withdrawal"));

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
});

