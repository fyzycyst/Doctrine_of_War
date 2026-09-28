import { describe, expect, it } from "vitest";
import { playBattle } from "./balance";
import { doctrineLibrary } from "./doctrines";
import { scenarios } from "./scenarios";

describe("every scenario", () => {
  for (const scenario of scenarios) {
    describe(scenario.title, () => {
      it("survives a JSON round trip and only offers its own side's doctrines", () => {
        expect(JSON.parse(JSON.stringify(scenario))).toEqual(scenario);
        for (const id of scenario.playerDoctrineIds) {
          expect(doctrineLibrary[id]?.faction).toBe(scenario.playerFaction);
        }
        for (const setup of scenario.squads.filter((squad) => squad.faction === scenario.playerFaction && !squad.noncombatant)) {
          expect(scenario.playerDoctrineIds).toContain(setup.doctrineId);
        }
      });

      it("has a curated seed that plays the intended plan to a clean win", () => {
        expect(scenario.curatedSeed).toBeDefined();
        const final = playBattle(scenario, scenario.referencePlans!.intended, scenario.curatedSeed!, "on");
        expect(final.status).toBe("victory");
        const broken = final.squads.filter(
          (squad) => squad.faction === scenario.playerFaction && (squad.status === "routed" || squad.status === "destroyed"),
        );
        expect(broken.length).toBeLessThanOrEqual(1);
        // The finale's first play is a near-miss by design (holdForDawn.test checks its range).
        const nearMiss = scenario.id === "hold_for_dawn";
        for (const objective of final.objectives.filter((item) => item.defender === scenario.playerFaction)) {
          expect(objective.integrity).toBeGreaterThanOrEqual(nearMiss ? 1 : 85);
        }
      });
    });
  }
});
