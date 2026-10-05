import { describe, expect, it } from "vitest";
import type { BoardLayout } from "../../game/board";
import { emberFord } from "../../game/engine/scenarios/emberFord";
import { twoObjectivesBoard } from "../lab/twoObjectives";
import { firesBurn, smokesCold } from "../atmosphere/fireRules";
import { emberDusk } from "../skins";
import { buildIsland } from "./buildIsland";

const kinds = (island: ReturnType<typeof buildIsland>) => island.fireAnchors.map((a) => a.kind);
// A river board whose Host bank (q = 3) is deployment ground beside the water: it gets braziers.
const hostBank: BoardLayout = {
  ...twoObjectivesBoard,
  hexes: twoObjectivesBoard.hexes.map((h) => (h.coord.q === 3 ? { ...h, deploymentFaction: "ashen_host" as const } : h)),
};

describe("ford dressing (M2 follow-up)", () => {
  it("keeps Ember Ford's bridge wrecks, and the Host's bank braziers, by default", () => {
    expect(kinds(buildIsland(emberFord.board, emberDusk))).toContain("bridge");
    const island = buildIsland(hostBank, emberDusk);
    expect(kinds(island)).toContain("brazier");
    // Braziers are their own mesh, shown only under nightFires.
    expect(island.brazierGeometry).not.toBeNull();
  });

  it("drops the wrecks and braziers on a board that opts out", () => {
    const ford = buildIsland({ ...emberFord.board, fordDressing: "none" }, emberDusk);
    expect(kinds(ford)).not.toContain("bridge");
    const bank = buildIsland({ ...hostBank, fordDressing: "none" }, emberDusk);
    expect(kinds(bank)).not.toContain("brazier");
    expect(bank.brazierGeometry).toBeNull();
  });

  it("burns the wrecks and braziers only at night; by day the stumps smoke cold", () => {
    expect(firesBurn("bridge", "nightFires")).toBe(true);
    expect(firesBurn("brazier", "nightFires")).toBe(true);
    for (const hour of ["dusk", "predawn", "sunrise", "rainGrey"] as const) {
      expect(firesBurn("bridge", hour), hour).toBe(false);
      expect(firesBurn("brazier", hour), hour).toBe(false);
      expect(smokesCold("bridge", hour), hour).toBe(true);
    }
    expect(smokesCold("bridge", "nightFires")).toBe(false);
    // Other fires keep following the preset (torches at predawn, the Host's pots).
    expect(firesBurn("torch", "predawn")).toBe(true);
    expect(firesBurn("firepot", "dusk")).toBe(true);
    expect(smokesCold("torch", "dusk")).toBe(false);
  });
});
