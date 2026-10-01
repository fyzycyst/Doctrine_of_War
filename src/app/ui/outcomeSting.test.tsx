import { act, cleanup, render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { playBattle } from "../../game/engine/balance";
import { firstBreach, saltmarshColumn, type EngineScenario } from "../../game/engine";
import { useFlow } from "../flow/flowStore";
import { memoryStore } from "../flow/testKit";
import { useGame } from "../game/gameStore";

const stings: string[] = [];
vi.mock("../../audio", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../audio")>()),
  playSting: (kind: string) => stings.push(kind),
}));

const { Outcome } = await import("./Outcome");

/** A battle played to its end with a reference plan, shown on the outcome screen. */
function outcomeOf(scenario: EngineScenario, plan: "intended" | "bad", seed = scenario.curatedSeed ?? 1, status?: "stalemate") {
  const played = playBattle(scenario, scenario.referencePlans![plan], seed, "on");
  // The outcome screen reads only the final status; a stalemate is set directly so the
  // test does not hang on a balance-dependent seed.
  const final = status ? { ...played, status } : played;
  act(() => {
    useGame.getState().loadBattle(scenario, { seed, fortune: "on" }, "command");
    useGame.getState().replaceEngine(final);
    useGame.setState({ stage: "outcome" });
  });
  return final.status;
}

beforeEach(() => {
  cleanup();
  stings.length = 0;
  useFlow.setState({ screen: "battle", campaign: null, store: memoryStore() });
});

describe("the outcome stinger", () => {
  it("plays victory once as a won battle's outcome appears", () => {
    expect(outcomeOf(firstBreach, "intended")).toBe("victory");
    const { rerender } = render(<Outcome />);
    rerender(<Outcome />);
    expect(stings).toEqual(["victory"]);
  });

  it("plays defeat for a lost battle", () => {
    expect(outcomeOf(firstBreach, "bad")).toBe("defeat");
    render(<Outcome />);
    expect(stings).toEqual(["defeat"]);
  });

  it("stays silent on a stalemate (the score carries it)", () => {
    expect(outcomeOf(saltmarshColumn, "intended", undefined, "stalemate")).toBe("stalemate");
    render(<Outcome />);
    expect(stings).toEqual([]);
  });
});
