import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { hexKey, type BoardLayout, type HexCoord } from "../../game/board";
import { firstBreach } from "../../game/engine/scenarios/firstBreach";
import { holdForDawn } from "../../game/engine/scenarios/holdForDawn";
import { isDoused } from "../atmosphere/Fires";
import { closeShotOn, wideShotFor, type CameraShot } from "../camera/shots";
import { boardCenter, hexToWorld } from "../hexWorld";
import { CR6_GATE, CR6_SIEGE_APPROACH, cinderRoad6LabBoard as cr6 } from "../lab/cinderRoad6Lab";
import { emberDusk } from "../skins";
import { buildIsland } from "./buildIsland";
import { objectiveFacing, objectiveHolder, OBJECTIVE_STAGES } from "./objectiveProps";

/** A position-and-colour checksum, to prove geometry is unchanged. */
function checksum(g: THREE.BufferGeometry | null) {
  if (!g) return "null";
  const p = g.getAttribute("position").array as Float32Array;
  const c = g.getAttribute("color").array as Float32Array;
  let s = 0;
  for (let i = 0; i < p.length; i += 1) s += p[i] * ((i % 7) + 1);
  for (let i = 0; i < c.length; i += 1) s += c[i] * ((i % 5) + 1);
  return `${p.length}:${s.toFixed(3)}`;
}

function ndc(shot: CameraShot, b: BoardLayout, hex: HexCoord, aspect = 1.6) {
  const camera = new THREE.PerspectiveCamera(30, aspect, 0.1, 200);
  const target = new THREE.Vector3(...shot.target);
  camera.position.setFromSpherical(new THREE.Spherical(shot.distance, THREE.MathUtils.degToRad(shot.polar), THREE.MathUtils.degToRad(shot.azimuth))).add(target);
  camera.lookAt(target);
  camera.updateMatrixWorld();
  const [x, z] = hexToWorld(hex, boardCenter(b));
  return new THREE.Vector3(x, 0.4, z).project(camera);
}

describe("the gatehouse's holder (CR6: the Host's gate)", () => {
  it("reads who holds a wall objective from the deployment: the Banners at home, the Host in the finale", () => {
    expect(objectiveHolder(firstBreach.board, firstBreach.objectives[0].hex)).toBe("free_banners");
    expect(objectiveHolder(holdForDawn.board, holdForDawn.objectives[0].hex)).toBe("free_banners");
    expect(objectiveHolder(cr6, CR6_GATE)).toBe("ashen_host");
    expect(buildIsland(firstBreach.board, emberDusk).gateHolder).toBe("free_banners");
    expect(buildIsland(cr6, emberDusk).gateHolder).toBe("ashen_host");
  });

  it("has its attackers broadly west either way (walls are drawn north-south, the gate facing west)", () => {
    expect(objectiveFacing(cr6, CR6_GATE)[0]).toBeLessThan(-0.7);
    expect(objectiveFacing(firstBreach.board, firstBreach.objectives[0].hex)[0]).toBeLessThan(-0.7);
  });
});

describe("gatehouse stages (CR6: breakObjective on a wall)", () => {
  it("leaves the intact walls, and everything built after them, exactly as before", () => {
    // Checksums from before the stages existed (59be5ee).
    const fb = buildIsland(firstBreach.board, emberDusk);
    expect(checksum(fb.wallGeometry)).toBe("7164:63323.159");
    expect(checksum(fb.geometry)).toBe("152892:-162370.484");
    const hfd = buildIsland(holdForDawn.board, emberDusk);
    expect(checksum(hfd.wallGeometry)).toBe("16236:229721.985");
    expect(checksum(hfd.geometry)).toBe("339138:-430019.541");
  });

  it("builds the walls battered and breached, the gate's torches going out when it is breached", () => {
    const island = buildIsland(cr6, emberDusk);
    expect(island.gateKey).toBe(hexKey(CR6_GATE));
    expect(island.wallStages!.intact).toBe(island.wallGeometry);
    const counts = OBJECTIVE_STAGES.map((s) => island.wallStages![s].getAttribute("position").count);
    expect(new Set(counts).size).toBe(3);
    const torches = island.fireAnchors.filter((a) => a.kind === "torch");
    expect(torches.length).toBeGreaterThan(0);
    const at = (stage: "battered" | "broken") => new Map([[hexKey(CR6_GATE), stage]]);
    expect(torches.every((t) => !isDoused(t, at("battered")) && isDoused(t, at("broken")))).toBe(true);
  });

  it("has no stages without a gatehouse", () => {
    const island = buildIsland({ ...cr6, hexes: cr6.hexes.map(({ objectiveId: _o, ...h }) => h) }, emberDusk);
    expect(island.gateKey).toBeNull();
    expect(island.wallStages).toBeNull();
  });
});

describe("CR6 framing", () => {
  it("holds the Banners' deployment, the approach and the gate in the wide shot", () => {
    const shot = wideShotFor(cr6);
    const hexes = [...cr6.hexes.filter((h) => h.deploymentFaction === "free_banners").map((h) => h.coord), CR6_SIEGE_APPROACH, CR6_GATE];
    for (const hex of hexes) {
      const p = ndc(shot, cr6, hex);
      expect(Math.abs(p.x) < 0.95 && Math.abs(p.y) < 0.95, hexKey(hex)).toBe(true);
    }
  });

  it("has a close beat on the gate and its approach for the finale", () => {
    const shot = closeShotOn(cr6, [CR6_SIEGE_APPROACH, CR6_GATE]);
    for (const hex of [CR6_SIEGE_APPROACH, CR6_GATE]) {
      const p = ndc(shot, cr6, hex);
      expect(Math.abs(p.x) < 0.75 && Math.abs(p.y) < 0.75, hexKey(hex)).toBe(true);
    }
  });
});
