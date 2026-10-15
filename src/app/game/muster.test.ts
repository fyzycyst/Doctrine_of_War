import { describe, expect, it } from "vitest";
import { hexDistance, sameHex } from "../../game/board";
import { createInitialState, holdForDawn, resolvePhase, validateMuster, type EngineState, type MusterMove } from "../../game/engine";
import { musterCount, musterProblems, musterTargets, planFor, plannedArrows, withoutPlan, withPlan } from "./muster";

/** Hold for Dawn after phase 1 (intended plan): the line is in contact, with fresh companies behind it. */
function phaseTwo(): EngineState {
  const start = createInitialState(holdForDawn, { fortune: "on", seed: holdForDawn.curatedSeed ?? 1 });
  return resolvePhase(start, holdForDawn.referencePlans!.intended, holdForDawn).state;
}
const own = (state: EngineState) => state.squads.filter((squad) => squad.faction === holdForDawn.playerFaction && squad.status === "active" && !squad.noncombatant);

describe("planning a muster", () => {
  const state = phaseTwo();

  it("offers only what the engine's player-view check accepts", () => {
    let offered = 0;
    for (const squad of own(state)) {
      const targets = musterTargets(state, holdForDawn, [], squad.id);
      for (const to of targets.hexes) expect(validateMuster(state, holdForDawn, [{ squadId: squad.id, to }])).toEqual({});
      for (const tired of targets.relieve) expect(validateMuster(state, holdForDawn, [{ squadId: squad.id, relieve: tired }])).toEqual({});
      offered += targets.hexes.length + targets.relieve.length;
    }
    expect(offered).toBeGreaterThan(0);
  });

  it("offers a relief of the worn line: Greyford Shields can relieve the Gatewarden Spears", () => {
    expect(musterTargets(state, holdForDawn, [], "greyford_shields").relieve).toContain("gatewarden_spears");
  });

  it("opens a hex another company has planned to leave (moves apply in order)", () => {
    let found = false;
    for (const mover of own(state)) {
      for (const to of musterTargets(state, holdForDawn, [], mover.id).hexes) {
        const plan: MusterMove[] = [{ squadId: mover.id, to }];
        for (const next of own(state).filter((squad) => squad.id !== mover.id && hexDistance(squad.hex!, mover.hex!) === 1)) {
          const before = musterTargets(state, holdForDawn, [], next.id).hexes;
          const after = musterTargets(state, holdForDawn, plan, next.id).hexes;
          expect(before.some((hex) => sameHex(hex, mover.hex!))).toBe(false); // still held
          if (after.some((hex) => sameHex(hex, mover.hex!))) {
            found = true;
            expect(musterProblems(state, holdForDawn, [...plan, { squadId: next.id, to: mover.hex! }])).toEqual({});
          }
        }
      }
    }
    expect(found).toBe(true);
  });

  it("names the engine's reason when a plan stops holding", () => {
    const [first] = own(state).filter((squad) => musterTargets(state, holdForDawn, [], squad.id).hexes.length > 0);
    const to = musterTargets(state, holdForDawn, [], first.id).hexes[0];
    const twice = [{ squadId: first.id, to }, { squadId: first.id, to }];
    expect(musterProblems(state, holdForDawn, twice)[first.id]).toMatch(/already mustered/);
    expect(musterProblems(state, holdForDawn, [])).toEqual({});
  });
});

describe("the plan itself", () => {
  const a = { squadId: "a", to: { q: 1, r: 1 } };
  const b = { squadId: "b", to: { q: 2, r: 2 } };

  it("replaces a company's plan in place, so later moves keep their order", () => {
    const moved = { squadId: "a", to: { q: 3, r: 3 } };
    expect(withPlan([a, b], moved)).toEqual([moved, b]);
    expect(withPlan([a], b)).toEqual([a, b]);
  });

  it("keeps each company to one muster: a relief clears the relieved company's other plans", () => {
    const relief = { squadId: "c", relieve: "b" };
    expect(withPlan([a, b], relief)).toEqual([a, relief]);
    expect(withPlan([a, { squadId: "d", relieve: "b" }], relief)).toEqual([a, relief]);
    // A company that was to be relieved, now moving itself, drops the relief.
    expect(withPlan([relief], { squadId: "b", to: { q: 0, r: 0 } })).toEqual([{ squadId: "b", to: { q: 0, r: 0 } }]);
  });

  it("finds, removes and counts plans from either side of a relief", () => {
    const relief = { squadId: "c", relieve: "b" };
    expect(planFor([a, relief], "b")).toBe(relief);
    expect(withoutPlan([a, relief], "b")).toEqual([a]);
    expect(musterCount([a, relief])).toBe(3);
  });

  it("draws each plan from where the companies stand", () => {
    const positions = new Map([["a", { q: 0, r: 0 }], ["b", { q: 5, r: 5 }], ["c", { q: 6, r: 5 }]]);
    expect(plannedArrows([a, { squadId: "c", relieve: "b" }], positions)).toEqual([
      { squadId: "a", from: { q: 0, r: 0 }, to: { q: 1, r: 1 }, relief: false },
      { squadId: "c", from: { q: 6, r: 5 }, to: { q: 5, r: 5 }, relief: true },
    ]);
  });
});
