import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { hexKey, type BoardLayout, type HexCoord } from "../../game/board";
import { closeShotOn, wideShotFor, type CameraShot } from "../camera/shots";
import { boardCenter, hexToWorld } from "../hexWorld";
import { cinderRoad2, SLUICE_WALK as C2_SLUICE_WALK, WAGON_PARK as C2_WAGON_PARK, WEIR_SLUICE as C2_SLUICE } from "../../game/engine/scenarios/cinderRoad2";
import { dioramaSquads, objectiveStagesFor } from "../fromEngine";
import { emberDusk } from "../skins";
import { buildIsland } from "./buildIsland";
import { nearestRoadGoal, roadGoal } from "./objectiveProps";

/** Where a hex lands in normalised device coordinates for a shot (the app's fov 30 camera). */
function ndc(shot: CameraShot, b: BoardLayout, hex: HexCoord, aspect = 1.6) {
  const camera = new THREE.PerspectiveCamera(30, aspect, 0.1, 200);
  const target = new THREE.Vector3(...shot.target);
  camera.position.setFromSpherical(new THREE.Spherical(shot.distance, THREE.MathUtils.degToRad(shot.polar), THREE.MathUtils.degToRad(shot.azimuth))).add(target);
  camera.lookAt(target);
  camera.updateMatrixWorld();
  const [x, z] = hexToWorld(hex, boardCenter(b));
  return new THREE.Vector3(x, 0.4, z).project(camera);
}
const inFrame = (p: THREE.Vector3, margin = 0.9) => Math.abs(p.x) < margin && Math.abs(p.y) < margin;

const board = cinderRoad2.board;

describe("Cinder Road 2 (engine #2's board)", () => {
  it("deploys the Banners east of the river below the race and the Host west of it", () => {
    for (const hex of board.hexes) {
      const banners = hex.coord.q >= 5 && hex.coord.r >= 2 && hex.terrain !== "river";
      expect(hex.deploymentFaction, hexKey(hex.coord)).toBe(banners ? "free_banners" : hex.coord.q <= 3 ? "ashen_host" : undefined);
    }
    // The keepers stand on the Weir Road two steps below the Sluice Walk; the ram starts across the river.
    const at = new Map(dioramaSquads(cinderRoad2.squads).map((s) => [s.id, hexKey(s.hex)]));
    expect(at.get("keepers")).toBe("6,3");
    expect(at.get("kiln_ram")).toBe("2,0");
  });

  it("goes from intact to broken in one ram blow; a lesser hit still shows battered", () => {
    // Sluice integrity 16: the ram's blow takes all of it, so the battered stage is skipped
    // there (the hit's spray and stone chips play, then it is breached).
    const setups = cinderRoad2.objectives;
    const sluice = (integrity: number) => objectiveStagesFor([{ id: "weir_sluice", hex: C2_SLUICE, integrity }], setups);
    expect(setups.find((o) => o.id === "weir_sluice")?.integrity).toBe(16);
    expect(sluice(16)).toEqual([]);
    expect(sluice(0)).toEqual([{ hex: C2_SLUICE, stage: "broken" }]);
    expect(sluice(10)).toEqual([{ hex: C2_SLUICE, stage: "battered" }]);
  });

  it("leads the roads to the Host's wagon park, each track to its nearest objective", () => {
    expect(hexKey(roadGoal(board)!)).toBe(hexKey(C2_WAGON_PARK));
    // The Wagon Track runs to the park; the Weir Road to the sluice.
    expect(hexKey(nearestRoadGoal(board, { q: 3, r: 5 })!)).toBe(hexKey(C2_WAGON_PARK));
    for (const c of [C2_SLUICE_WALK, { q: 6, r: 2 }, { q: 6, r: 3 }]) expect(hexKey(nearestRoadGoal(board, c)!)).toBe(hexKey(C2_SLUICE));
  });

  it("stands the sluice-house on the dry side, toward the Sluice Walk", () => {
    const island = buildIsland(board, emberDusk);
    const sluice = island.objectiveProps.find((p) => p.kind === "sluice")!;
    const [sx, sz] = hexToWorld(C2_SLUICE, island.center);
    const [wx, wz] = hexToWorld(C2_SLUICE_WALK, island.center);
    const len = Math.hypot(wx - sx, wz - sz);
    const toWalk = [(wx - sx) / len, (wz - sz) / len];
    expect(sluice.bank![0] * toWalk[0] + sluice.bank![1] * toWalk[1]).toBeGreaterThan(0.99);
    // The weir spans across that line, so its face turns perpendicular to it.
    expect(Math.abs(sluice.facing[0] * toWalk[0] + sluice.facing[1] * toWalk[1])).toBeLessThan(0.01);
    // No burned bridges at its fords.
    expect(island.fireAnchors.some((a) => a.kind === "bridge" || a.kind === "brazier")).toBe(false);
  });

  it("keeps both objectives in the default wide frame", () => {
    const shot = wideShotFor(board);
    for (const hex of [C2_WAGON_PARK, C2_SLUICE]) expect(inFrame(ndc(shot, board, hex)), hexKey(hex)).toBe(true);
  });

  it("has a close beat on the Sluice Walk that holds the walk and the sluice", () => {
    const shot = closeShotOn(board, [C2_SLUICE_WALK, C2_SLUICE]);
    for (const hex of [C2_SLUICE_WALK, C2_SLUICE]) expect(inFrame(ndc(shot, board, hex), 0.75), hexKey(hex)).toBe(true);
    expect(shot.distance).toBeLessThan(wideShotFor(board).distance / 2);
  });
});
