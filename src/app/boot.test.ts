// Dev and capture URL boot: `?scenario=` reaches every registry scenario (M2 follow-up),
// by id (any case and punctuation) or as a campaign battle by number (`cinderRoad2`).
import { describe, expect, it } from "vitest";
import { registry } from "../game/packs";
import { exposeStoresForCapture, findScenario } from "./boot";
import { useGame } from "./game/gameStore";

describe("findScenario", () => {
  it("finds every registry scenario by id, the Cinder Road battles included", () => {
    for (const scenario of registry.scenarios()) expect(findScenario(scenario.id)?.id).toBe(scenario.id);
    expect(findScenario("emberFord")?.id).toBe("ember_ford");
    expect(findScenario("cinder_road_wagon_park")?.id).toBe("cinder_road_wagon_park");
  });

  it("finds a campaign battle by number", () => {
    expect(findScenario("cinderRoad1")?.id).toBe("cinder_road_saltmarsh");
    expect(findScenario("cinderRoad2")?.id).toBe("cinder_road_wagon_park");
    // The five-battle Cinder Road: battle 4 the harrying battle, battle 5 the finale.
    expect(findScenario("cinderRoad4")?.id).toBe("cinder_road_gate_road");
    expect(findScenario("cinderRoad5")?.id).toBe("cinder_road_greyford_gate");
    expect(findScenario("ashAndBanner2")?.id).toBe(registry.campaign("ash_and_banner")!.campaign.battles[1].scenarioId);
  });

  it("finds nothing for an unknown key, a missing battle or no key", () => {
    expect(findScenario("nowhere")).toBeUndefined();
    expect(findScenario("cinderRoad99")).toBeUndefined();
    expect(findScenario(null)).toBeUndefined();
  });
});

describe("exposeStoresForCapture (T34, dev only)", () => {
  it("puts the stores on the target in dev builds, for the frame-stepped video capture", () => {
    const target: Record<string, unknown> = {};
    exposeStoresForCapture(target);
    expect(import.meta.env.DEV).toBe(true);
    expect((target.__dow as { game: unknown }).game).toBe(useGame);
  });
});
