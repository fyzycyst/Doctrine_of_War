import { describe, expect, it } from "vitest";
import { hexKey, type BoardHex } from "../../game/board";
import { cinderRoad1, SALTGATE_BARRICADE } from "../../game/engine/scenarios/cinderRoad1";
import { firstBreach } from "../../game/engine/scenarios/firstBreach";
import { wagonPark } from "../../game/engine/fixtures/wagonPark";
import { wideShotFor } from "../camera/shots";
import { objectiveStagesFor } from "../fromEngine";
import { boardCenter, hexToWorld } from "../hexWorld";
import { LAB_SLUICE, LAB_WAGON_PARK, twoObjectivesBoard } from "../lab/twoObjectives";
import { emberDusk } from "../skins";
import { buildIsland } from "./buildIsland";
import { objectiveDressing, objectiveFacing, OBJECTIVE_STAGES } from "./objectiveProps";

const hex = (over: Partial<BoardHex>): BoardHex => ({ coord: { q: 0, r: 0 }, terrain: "field", ...over });
const count = (g: { getAttribute(n: string): { count: number } } | null | undefined) => g?.getAttribute("position").count ?? 0;

describe("objective dressing (M2)", () => {
  it("maps each objectiveKind to its prop", () => {
    expect(objectiveDressing(hex({ objectiveId: "o", objectiveKind: "barricade", terrain: "road" }))).toBe("barricade");
    expect(objectiveDressing(hex({ objectiveId: "o", objectiveKind: "wagons" }))).toBe("wagons");
    expect(objectiveDressing(hex({ objectiveId: "o", objectiveKind: "sluice", terrain: "river" }))).toBe("sluice");
    expect(objectiveDressing(hex({ objectiveId: "o", objectiveKind: "gatehouse", terrain: "wall" }))).toBe("gatehouse");
  });

  it("falls back to today's behaviour when objectiveKind is absent", () => {
    // Walls give a gatehouse; open ground gives no prop (battle 1 before M2).
    expect(objectiveDressing(hex({ objectiveId: "o", terrain: "wall" }))).toBe("gatehouse");
    expect(objectiveDressing(hex({ objectiveId: "o", terrain: "road" }))).toBeNull();
    expect(objectiveDressing(hex({ objectiveId: "o", terrain: "field" }))).toBeNull();
  });

  it("dresses only objective hexes, and a gatehouse only on a wall", () => {
    expect(objectiveDressing(hex({ objectiveKind: "barricade" }))).toBeNull();
    expect(objectiveDressing(hex({ terrain: "wall" }))).toBeNull();
    expect(objectiveDressing(hex({ objectiveId: "o", objectiveKind: "gatehouse", terrain: "field" }))).toBeNull();
  });

  it("turns a barricade to face the attackers' deployment", () => {
    // Cinder Road 1: the Host holds the barricade (north); the Banners come from the south.
    const center = boardCenter(cinderRoad1.board);
    const [bx, bz] = hexToWorld(SALTGATE_BARRICADE, center);
    const banners = cinderRoad1.board.hexes.filter((h) => h.deploymentFaction === "free_banners").map((h) => hexToWorld(h.coord, center));
    const tx = banners.reduce((s, p) => s + p[0], 0) / banners.length - bx;
    const tz = banners.reduce((s, p) => s + p[1], 0) / banners.length - bz;
    const [dx, dz] = objectiveFacing(cinderRoad1.board, SALTGATE_BARRICADE);
    expect(Math.hypot(dx, dz)).toBeCloseTo(1);
    expect((dx * tx + dz * tz) / Math.hypot(tx, tz)).toBeGreaterThan(0.95);
  });
});

describe("objective props in the island build (M2)", () => {
  it("Cinder Road 1 carries the barricade in all three stages", () => {
    const at = cinderRoad1.board.hexes.find((h) => hexKey(h.coord) === hexKey(SALTGATE_BARRICADE));
    expect(at?.objectiveKind).toBe("barricade");
    const island = buildIsland(cinderRoad1.board, emberDusk);
    expect(island.objectiveProps).toHaveLength(1);
    const [prop] = island.objectiveProps;
    expect(prop.kind).toBe("barricade");
    expect(hexKey(prop.coord)).toBe(hexKey(SALTGATE_BARRICADE));
    for (const stage of OBJECTIVE_STAGES) expect(count(prop.stages[stage].geometry), stage).toBeGreaterThan(0);
    // Pots burn while intact, one goes out when battered, all are doused and steam once broken.
    expect(count(prop.stages.intact.embers)).toBeGreaterThan(count(prop.stages.battered.embers));
    expect(prop.stages.broken.embers).toBeNull();
    expect(prop.stages.intact.steam).toHaveLength(0);
    expect(prop.stages.broken.steam.length).toBeGreaterThan(prop.stages.battered.steam.length);
    expect(prop.pots.some((p) => p.douse === "battered") && prop.pots.some((p) => p.douse === "broken")).toBe(true);
    // Each pot is a night fire anchor tied to its objective.
    const anchors = island.fireAnchors.filter((a) => a.objective === hexKey(SALTGATE_BARRICADE));
    expect(anchors.map((a) => a.douse).sort()).toEqual(prop.pots.map((p) => p.douse).sort());
    expect(island.wallGeometry).toBeNull();
  });

  it("dresses two objectives on one board: the Host's wagons and the Banners' sluice", () => {
    const island = buildIsland(twoObjectivesBoard, emberDusk);
    const byKind = new Map(island.objectiveProps.map((p) => [p.kind, p]));
    expect([...byKind.keys()].sort()).toEqual(["sluice", "wagons"]);
    expect(hexKey(byKind.get("wagons")!.coord)).toBe(hexKey(LAB_WAGON_PARK));
    expect(hexKey(byKind.get("sluice")!.coord)).toBe(hexKey(LAB_SLUICE));
    expect(count(byKind.get("wagons")!.stages.intact.embers)).toBeGreaterThan(0);
    // The sluice: no fire anywhere; it jets water when battered and runs wide once breached.
    const sluice = byKind.get("sluice")!;
    expect(sluice.pots).toHaveLength(0);
    expect(OBJECTIVE_STAGES.every((s) => sluice.stages[s].embers === null && sluice.stages[s].steam.length === 0)).toBe(true);
    expect(sluice.stages.intact.jets).toHaveLength(0);
    expect(sluice.stages.battered.jets.length).toBeGreaterThan(0);
    const breach = Math.max(...sluice.stages.broken.jets.map((j) => j.width));
    expect(breach).toBeGreaterThan(Math.max(...sluice.stages.battered.jets.map((j) => j.width)));
    // In the channel it turns downstream, with the river's flow.
    expect(sluice.facing[0] * island.flow[0] + sluice.facing[1] * island.flow[1]).toBeCloseTo(1);
  });

  it("keeps the gatehouse in the walls and adds no open-ground prop by default", () => {
    const gate = buildIsland(firstBreach.board, emberDusk);
    expect(gate.wallGeometry).not.toBeNull();
    expect(gate.objectiveProps).toHaveLength(0);
    // The wagon fixture without a kind: no prop, as before M2.
    expect(buildIsland(wagonPark.board, emberDusk).objectiveProps).toHaveLength(0);
  });
});

describe("objective stages from the engine (M2)", () => {
  const setups = [
    { id: "wagon_park", integrity: 30 },
    { id: "sallow_sluice", integrity: 20 },
  ];
  const at = (id: string, integrity: number) => ({ id, hex: id === "wagon_park" ? LAB_WAGON_PARK : LAB_SLUICE, integrity });

  it("reads each objective on its own: untouched, battered, broken", () => {
    expect(objectiveStagesFor([at("wagon_park", 30), at("sallow_sluice", 20)], setups)).toEqual([]);
    expect(objectiveStagesFor([at("wagon_park", 18), at("sallow_sluice", 20)], setups)).toEqual([{ hex: LAB_WAGON_PARK, stage: "battered" }]);
    expect(objectiveStagesFor([at("wagon_park", 0), at("sallow_sluice", 9)], setups)).toEqual([
      { hex: LAB_WAGON_PARK, stage: "broken" },
      { hex: LAB_SLUICE, stage: "battered" },
    ]);
  });

  it("frames both objectives in the wide shot", () => {
    // shots.ts biases the frame toward every objective hex, not only the first.
    const center = boardCenter(twoObjectivesBoard);
    const shot = wideShotFor(twoObjectivesBoard);
    for (const coord of [LAB_WAGON_PARK, LAB_SLUICE]) {
      const [x, z] = hexToWorld(coord, center);
      expect(Math.hypot(x - shot.target[0], z - shot.target[2])).toBeLessThan(shot.distance * 0.3);
    }
  });
});
