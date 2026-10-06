// Dev and capture URL boot: `?scenario=` reaches every registry scenario (M2 follow-up),
// by id (any case and punctuation) or as a campaign battle by number (`cinderRoad2`).
import { describe, expect, it } from "vitest";
import { registry } from "../game/packs";
import { findScenario } from "./boot";

describe("findScenario", () => {
  it("finds every registry scenario by id, the Cinder Road battles included", () => {
    for (const scenario of registry.scenarios()) expect(findScenario(scenario.id)?.id).toBe(scenario.id);
    expect(findScenario("emberFord")?.id).toBe("ember_ford");
    expect(findScenario("cinder_road_wagon_park")?.id).toBe("cinder_road_wagon_park");
  });

  it("finds a campaign battle by number", () => {
    expect(findScenario("cinderRoad1")?.id).toBe("cinder_road_saltmarsh");
    expect(findScenario("cinderRoad2")?.id).toBe("cinder_road_wagon_park");
    expect(findScenario("ashAndBanner2")?.id).toBe(registry.campaign("ash_and_banner")!.campaign.battles[1].scenarioId);
  });

  it("finds nothing for an unknown key, a missing battle or no key", () => {
    expect(findScenario("nowhere")).toBeUndefined();
    expect(findScenario("cinderRoad99")).toBeUndefined();
    expect(findScenario(null)).toBeUndefined();
  });
});
