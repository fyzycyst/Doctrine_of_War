// The engine surface the UI builds on: deployment rules, name lookups from the
// player's visible state, report intent, last-seen info, visible hexes and the
// order allowlist.
import { describe, expect, it } from "vitest";
import { applyDeployment, checkPlacement, deploymentHexes, validateDeployment } from "./deployment";
import { visibleHexes, visibleState } from "./fog";
import { narrateEvent } from "./report";
import { createInitialState, isOrderAllowed, resolvePhase } from "./resolvePhase";
import { firstBreach } from "./scenarios/firstBreach";
import { scenario, squad } from "./testKit";
import type { EngineEvent } from "./types";

const FB = "free_banners" as const;
const AH = "ashen_host" as const;

describe("deployment", () => {
  it("lists the player's zone and explains every illegal placement in plain language", () => {
    const zone = deploymentHexes(firstBreach);
    expect(zone.length).toBeGreaterThan(0);
    expect(zone.every((hex) => !(hex.q === 4 && hex.r === 2))).toBe(true);
    const problems = validateDeployment(firstBreach, {
      greyford_shields: { q: 4, r: 2 }, // the gate
      dawnwatch_archers: { q: 9, r: 9 }, // off the board
      mercy_standard: { q: 0, r: 2 }, // Host zone
      cinder_vanguard: { q: 3, r: 2 }, // not ours
      stoneford_riders: { q: 3, r: 1 }, // free: Mercy Standard moved off it
    });
    expect(problems.greyford_shields).toMatch(/cannot be garrisoned/);
    expect(problems.dawnwatch_archers).toMatch(/off the field/);
    expect(problems.mercy_standard).toMatch(/Outside your deployment zone/);
    expect(problems.cinder_vanguard).toMatch(/Only your own companies/);
    expect(problems.stoneford_riders).toBeUndefined();
  });

  it("rejects two companies on one hex, and applies a valid deployment without touching the scenario", () => {
    expect(checkPlacement(firstBreach, { greyford_shields: { q: 2, r: 2 }, mercy_standard: { q: 2, r: 2 } }, "mercy_standard", { q: 2, r: 2 })).toEqual({
      ok: false,
      reason: "Greyford Shields already holds that hex.",
    });
    const pristine = structuredClone(firstBreach);
    const moved = applyDeployment(firstBreach, { greyford_shields: { q: 2, r: 2 } });
    expect(moved.squads.find((item) => item.id === "greyford_shields")?.hex).toEqual({ q: 2, r: 2 });
    expect(firstBreach).toEqual(pristine);
    expect(() => applyDeployment(firstBreach, { greyford_shields: { q: 4, r: 2 } })).toThrow(/cannot be garrisoned/);
  });
});

describe("narration from the player's view", () => {
  it("names companies from a VisibleState and never prints an unknown id", () => {
    const view = visibleState(createInitialState(firstBreach, { fortune: "on" }), FB);
    const rout = { kind: "rout", phase: 1, beat: 1, visibleTo: [FB], squadId: "greyford_shields", hex: { q: 3, r: 2 }, cause: "cohesion" } as EngineEvent;
    expect(narrateEvent(rout, view)).toBe("Greyford Shields broke and routed.");
    const ghost = { ...rout, squadId: "secret_host_company" } as EngineEvent;
    expect(narrateEvent(ghost, view)).toBe("an unseen company broke and routed.");
  });

  it("reports the phase intent on its own", () => {
    const { report } = resolvePhase(createInitialState(firstBreach), firstBreach.referencePlans!.intended, firstBreach);
    expect(report.intent).toBe(firstBreach.hostSchedule[0].intent);
    expect(report.title).toBe(`Phase 1: ${report.intent}`);
  });
});

describe("fog for the UI", () => {
  const field = scenario({ squads: [squad("scout", FB, { q: 0, r: 2 }), squad("close", AH, { q: 2, r: 2 })] });

  it("tells when an enemy was last seen", () => {
    const state = createInitialState(field, { fortune: "on" });
    const view = visibleState(state, FB);
    expect(view.squads.find((item) => item.id === "scout")?.lastSeen).toBeNull();
    expect(view.squads.find((item) => item.id === "close")?.lastSeen).toEqual({ phase: 1, beat: 0 });
    expect(visibleState(createInitialState(field), FB).squads.every((item) => item.lastSeen === null)).toBe(true);
  });

  it("lists the hexes a side can see (everything with fortune off)", () => {
    const hexes = visibleHexes(createInitialState(field, { fortune: "on" }), field, FB);
    expect(hexes).toContainEqual({ q: 2, r: 2 });
    expect(hexes).not.toContainEqual({ q: 6, r: 4 });
    expect(visibleHexes(createInitialState(field), field, FB)).toHaveLength(field.board.hexes.length);
  });
});

describe("order allowlist", () => {
  it("always accepts resending a squad's scenario-default doctrine, even if it is off the list", () => {
    const limited = { ...firstBreach, playerDoctrineIds: ["rescue_standard"] };
    expect(isOrderAllowed(limited, "greyford_shields", "shield_the_line")).toBe(true);
    expect(isOrderAllowed(limited, "greyford_shields", "rescue_standard")).toBe(true);
    expect(isOrderAllowed(limited, "greyford_shields", "hold_for_dawn")).toBe(false);
    expect(isOrderAllowed(limited, "cinder_vanguard", "iron_tide")).toBe(false);
    expect(() => resolvePhase(createInitialState(limited), { greyford_shields: "shield_the_line" }, limited)).not.toThrow();
    expect(() => resolvePhase(createInitialState(limited), { greyford_shields: "hold_for_dawn" }, limited)).toThrow(/not available/);
  });
});
