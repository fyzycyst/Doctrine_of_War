import { describe, expect, it } from "vitest";
import { emberFord } from "../../game/engine/scenarios/emberFord";
import { firstBreach } from "../../game/engine/scenarios/firstBreach";
import { cinematicPaths, pathTime, sampleCameraPath, type CameraPath } from "./cameraPath";

const line: CameraPath = {
  id: "t",
  label: "t",
  duration: 10,
  mode: "once",
  keys: [
    { t: 0, position: [0, 0, 0], target: [0, 0, -1] },
    { t: 5, position: [5, 0, 0], target: [0, 0, -1], fov: 40 },
    { t: 10, position: [10, 0, 0], target: [0, 0, -1] },
  ],
};

describe("camera paths", () => {
  it("hits keyframes exactly and interpolates between them", () => {
    expect(sampleCameraPath(line, 0).position.x).toBeCloseTo(0);
    expect(sampleCameraPath(line, 5).position.x).toBeCloseTo(5);
    expect(sampleCameraPath(line, 5).fov).toBeCloseTo(40);
    const mid = sampleCameraPath(line, 2.5).position.x;
    expect(mid).toBeGreaterThan(0.5);
    expect(mid).toBeLessThan(4.5);
    expect(sampleCameraPath(line, 99).position.x).toBeCloseTo(10);
  });

  it("wraps time per mode", () => {
    expect(pathTime({ ...line, mode: "loop" }, 12)).toBeCloseTo(2);
    expect(pathTime({ ...line, mode: "pingpong" }, 12)).toBeCloseTo(8);
    expect(pathTime(line, -3)).toBe(0);
  });

  it("derives board paths: river push only where there is a river", () => {
    const breach = cinematicPaths(firstBreach.board);
    expect(breach.craneInGate).toBeDefined();
    expect(breach.bannerDolly).toBeDefined();
    expect(breach.riverPush).toBeUndefined();
    const ford = cinematicPaths(emberFord.board);
    expect(ford.riverPush).toBeDefined();
    for (const path of Object.values(ford)) {
      for (const key of path!.keys) key.position.forEach((v) => expect(Number.isFinite(v)).toBe(true));
    }
  });
});
