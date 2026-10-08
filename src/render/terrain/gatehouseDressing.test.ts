// A gatehouse that is not an objective (Cinder Road 4, Turn the Retreat, the harrying battle,
// on the shared Greyford Gate board with gateObjective: false): BoardHex.gatehouse dresses the
// wall hex, intact only.
import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { hexKey, type BoardLayout } from "../../game/board";
import { registry } from "../../game/packs";
import { cinderRoad5 } from "../../game/engine/scenarios/cinderRoad5";
import { cinderRoad6 } from "../../game/engine/scenarios/cinderRoad6";
import { GREYFORD_GATE as CR6_GATE } from "../../game/engine/scenarios/greyfordGate.board";

const cinderRoad6LabBoard = cinderRoad6.board;
import { emberDusk } from "../skins";
import { buildIsland } from "./buildIsland";
import { roadGoal } from "./objectiveProps";

function checksum(g: THREE.BufferGeometry | null) {
  if (!g) return "null";
  const p = g.getAttribute("position").array as Float32Array;
  const c = g.getAttribute("color").array as Float32Array;
  let s = 0;
  for (let i = 0; i < p.length; i += 1) s += p[i] * ((i % 7) + 1);
  for (let i = 0; i < c.length; i += 1) s += c[i] * ((i % 5) + 1);
  return `${p.length}:${s.toFixed(3)}`;
}

/** The Greyford Gate board as the harrying battle has it: the gate is no objective, but still a gatehouse. */
const harrying = (gatehouse: boolean): BoardLayout => ({
  ...cinderRoad6LabBoard,
  hexes: cinderRoad6LabBoard.hexes.map(({ objectiveId: _o, ...h }) => (gatehouse && hexKey(h.coord) === hexKey(CR6_GATE) ? { ...h, gatehouse: true as const } : h)),
});

describe("a gatehouse without an objective (CR4, the harrying battle)", () => {
  it("dresses the wall hex as the gatehouse, with the Host's banner, intact only", () => {
    const plain = buildIsland(harrying(false), emberDusk);
    const gate = buildIsland(harrying(true), emberDusk);
    // Without the field the gate is plain wall (no banner, no torches); with it, the gatehouse.
    expect(plain.gateBanner).toBeUndefined();
    expect(gate.gateBanner).toBeDefined();
    expect(gate.gateHolder).toBe("ashen_host");
    expect(gate.fireAnchors.filter((a) => a.kind === "torch").length - plain.fireAnchors.filter((a) => a.kind === "torch").length).toBe(2);
    // The same gatehouse geometry as the objective gate's intact walls, and no damage stages.
    expect(checksum(gate.wallGeometry)).toBe(checksum(buildIsland(cinderRoad6LabBoard, emberDusk).wallGeometry));
    expect(gate.wallStages).toBeNull();
    expect(gate.gateKey).toBeNull();
    // Its torches are not tied to any objective (nothing breaches it).
    expect(gate.fireAnchors.filter((a) => a.kind === "torch").every((a) => a.objective === undefined)).toBe(true);
  });

  it("is how the shipped harrying battle (Turn the Retreat) draws Greyford Gate", () => {
    const gate = cinderRoad5.board.hexes.find((h) => hexKey(h.coord) === hexKey(CR6_GATE))!;
    expect(gate.gatehouse).toBe(true);
    expect(gate.objectiveId).toBeUndefined();
    const island = buildIsland(cinderRoad5.board, emberDusk);
    expect(island.gateBanner).toBeDefined();
    expect(island.gateHolder).toBe("ashen_host");
    expect(island.wallStages).toBeNull();
  });

  it("leads the harrying battle's roads to the dressed gate, not the first wall hex", () => {
    expect(roadGoal(cinderRoad5.board)).toEqual(CR6_GATE);
  });

  it("only dresses a wall", () => {
    const field = { ...harrying(false), hexes: harrying(false).hexes.map((h) => (hexKey(h.coord) === "4,3" ? { ...h, gatehouse: true as const } : h)) };
    expect(buildIsland(field, emberDusk).gateBanner).toBeUndefined();
  });

  it("leaves every shipped board byte-identical", () => {
    // Checksums from before the field existed (884f0ed): island, walls, battered|breached walls, holder, fires.
    const before: Record<string, [string, string, string, string, number]> = {
      first_breach: ["152892:-162370.484", "7164:63323.159", "12780:103816.873|20124:158291.611", "free_banners", 4],
      ember_ford: ["243198:-75790.955", "null", "none", "free_banners", 6],
      saltmarsh_column: ["242478:-242331.367", "null", "none", "free_banners", 2],
      hold_for_dawn: ["339138:-430019.541", "16236:229721.985", "21852:299110.210|29196:391492.636", "free_banners", 4],
      cinder_road_saltmarsh: ["242694:-241625.237", "null", "none", "free_banners", 5],
      cinder_road_wagon_park: ["325530:-121061.969", "null", "none", "free_banners", 5],
      cinder_road_ember_ford: ["233298:28594.900", "null", "none", "free_banners", 6],
    };
    for (const scenario of registry.scenarios()) {
      const want = before[scenario.id];
      if (!want) continue; // a scenario added after this test (it brings its own checks)
      const i = buildIsland(scenario.board, emberDusk);
      const stages = i.wallStages ? `${checksum(i.wallStages.battered)}|${checksum(i.wallStages.broken)}` : "none";
      expect([checksum(i.geometry), checksum(i.wallGeometry), stages, i.gateHolder, i.fireAnchors.length], scenario.id).toEqual(want);
    }
  });
});
