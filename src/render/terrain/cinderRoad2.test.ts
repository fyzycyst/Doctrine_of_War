import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { hexKey, type BoardLayout, type HexCoord } from "../../game/board";
import { closeShotOn, wideShotFor, type CameraShot } from "../camera/shots";
import { boardCenter, hexToWorld } from "../hexWorld";
import { C2_SLUICE, C2_SLUICE_WALK, C2_WAGON_PARK, cinderRoad2LabBoard as board } from "../lab/cinderRoad2Lab";
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

describe("Cinder Road 2 (lab copy of engine #2's board)", () => {
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
