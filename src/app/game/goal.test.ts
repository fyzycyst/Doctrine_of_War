import { describe, expect, it } from "vitest";
import { createInitialState, firstBreach, holdForDawn, saltmarshColumn, visibleState } from "../../game/engine";
import { goalFor, hasStageTurn, stageTurn } from "./goal";

describe("the player's goal", () => {
  it("holds the gate until dawn, then turns to breaking the Cinderram", () => {
    expect(goalFor(holdForDawn, 1)).toEqual({ icon: "hold", text: "Hold the Last Gate until dawn" });
    expect(goalFor(holdForDawn, 4)?.icon).toBe("hold");
    expect(goalFor(holdForDawn, 5)).toEqual({ icon: "break", text: "Break the Cinderram" });
  });

  it("marks the turn at the end of the last night phase only", () => {
    expect(stageTurn(holdForDawn, 3)).toBeNull();
    expect(stageTurn(holdForDawn, 4)).toEqual({ title: "Dawn breaks", goal: { icon: "break", text: "Break the Cinderram" } });
    expect(stageTurn(holdForDawn, 5)).toBeNull();
    expect(stageTurn(firstBreach, 2)).toBeNull();
  });

  it("counts the escape toward the Column's goal", () => {
    const view = visibleState(createInitialState(saltmarshColumn, { fortune: "off" }), "free_banners");
    expect(goalFor(saltmarshColumn, 1, view)).toEqual({ icon: "escape", text: "Get the Column and 3 more out", progress: "0/4" });
    const oneOut = { ...view, squads: view.squads.map((squad) => (squad.id === "saltmarsh_column" ? { ...squad, status: "escaped" as const, hex: null } : squad)) };
    expect(goalFor(saltmarshColumn, 2, oneOut)?.progress).toBe("1/4");
  });

  it("stays quiet for battles whose briefing says it all", () => {
    expect(goalFor(firstBreach, 1)).toBeNull();
  });
});

describe("board wiring for staged goals and escape edges", () => {
  it("only Hold for Dawn turns its goal with the hour (the board fades its light faster there)", () => {
    expect(hasStageTurn(holdForDawn)).toBe(true);
    expect(hasStageTurn(firstBreach)).toBe(false);
    expect(hasStageTurn(saltmarshColumn)).toBe(false);
  });

  it("the Saltmarsh has an escape edge for the board to mark", () => {
    expect(saltmarshColumn.winCondition.kind).toBe("escapeEdge");
    expect(saltmarshColumn.winCondition.kind === "escapeEdge" && saltmarshColumn.winCondition.edgeHexes.length).toBeGreaterThan(0);
  });
});
