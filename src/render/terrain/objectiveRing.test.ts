import { describe, expect, it } from "vitest";
import { cinderRoad1, SALTGATE_BARRICADE } from "../../game/engine/scenarios/cinderRoad1";
import { cinderRoad2, WAGON_PARK, WEIR_SLUICE } from "../../game/engine/scenarios/cinderRoad2";
import { objectiveStrengthFor } from "../fromEngine";
import { drainToward, strengthArc } from "./ObjectiveRings";

describe("objective strength rings (T27 §2a)", () => {
  it("reads every objective's integrity against its start, with its holder", () => {
    const at = (id: string, integrity: number) => {
      const o = cinderRoad2.objectives.find((x) => x.id === id)!;
      return { id, hex: o.hex, integrity, defender: o.defender };
    };
    expect(objectiveStrengthFor([at("wagon_park", 22), at("weir_sluice", 16)], cinderRoad2.objectives)).toEqual([
      { hex: WAGON_PARK, fraction: 22 / cinderRoad2.objectives[0].integrity, holder: "ashen_host" },
      { hex: WEIR_SLUICE, fraction: 1, holder: "free_banners" },
    ]);
    const barricade = cinderRoad1.objectives[0];
    expect(objectiveStrengthFor([{ id: barricade.id, hex: SALTGATE_BARRICADE, integrity: 0, defender: "ashen_host" }], cinderRoad1.objectives)).toEqual([
      { hex: SALTGATE_BARRICADE, fraction: 0, holder: "ashen_host" },
    ]);
  });

  it("draws the lit arc like a company's: centred toward the camera, the gap opening at the back", () => {
    expect(strengthArc(1).length).toBeCloseTo(Math.PI * 2);
    const half = strengthArc(0.5);
    expect(half.length).toBeCloseTo(Math.PI);
    // Centred on the south (toward the default camera): the ring's local -y after the -90° x tilt.
    expect(half.start + half.length / 2).toBeCloseTo(-Math.PI / 2);
    expect(strengthArc(0).length).toBe(0);
    expect(strengthArc(1.4).length).toBeCloseTo(Math.PI * 2);
  });

  it("drains smoothly, and at once under reduced motion", () => {
    expect(drainToward(1, 0.4, 0.016, true)).toBe(0.4);
    const eased = drainToward(1, 0.4, 0.016, false);
    expect(eased).toBeLessThan(1);
    expect(eased).toBeGreaterThan(0.4);
    expect(drainToward(0.4, 0.4, 0.016, false)).toBe(0.4);
  });
});
