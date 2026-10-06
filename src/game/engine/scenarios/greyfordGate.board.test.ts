// The shared Greyford Gate board (Cinder Road battles 5 and 6): one ground, per-battle zones.
import { describe, expect, it } from "vitest";
import { cinderRoad6 } from "./cinderRoad6";
import { GREYFORD_GATE, greyfordGateBoard } from "./greyfordGate.board";

describe("the Greyford Gate board", () => {
  it("defaults to the finale's deployment, and is the finale's board", () => {
    const board = greyfordGateBoard();
    expect(board).toEqual(cinderRoad6.board);
    expect(board.hexes.filter((hex) => hex.objectiveId === "greyford_gate").map((hex) => hex.coord)).toEqual([GREYFORD_GATE]);
    expect(board.hexes.filter((hex) => hex.deploymentFaction === "free_banners").every((hex) => hex.coord.q >= 1 && hex.coord.q <= 2)).toBe(true);
  });

  it("takes other zones with the same ground, and fails closed on overlapping zones or zones in the river or the wall", () => {
    const pursuit = greyfordGateBoard({
      bannerZone: ({ q, r }) => q === 1 || (q === 0 && (r === 2 || r === 3)) || (q === 2 && r === 2),
      hostZone: ({ q, r }) => q >= 2 && q <= 7 && r >= 1 && r <= 6 && !(q === 2 && r === 2),
    });
    expect(pursuit.hexes.map(({ coord, terrain, label }) => ({ coord, terrain, label }))).toEqual(cinderRoad6.board.hexes.map(({ coord, terrain, label }) => ({ coord, terrain, label })));
    expect(() => greyfordGateBoard({ bannerZone: ({ q, r }) => q === 2 && r === 2, hostZone: ({ q }) => q === 2 })).toThrow(/2,2 is in both deployment zones/);
    expect(() => greyfordGateBoard({ bannerZone: ({ q }) => q === 0 })).toThrow(/0,0 \(river\) cannot be a deployment hex/);
    expect(() => greyfordGateBoard({ hostZone: ({ q }) => q === 8 })).toThrow(/\(wall\) cannot be a deployment hex/);
  });
});
