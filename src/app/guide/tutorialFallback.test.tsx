// T32: phase 2 when this run offers no tired company, no free company or no relief (fortune
// decides): each step says so, explains the idea, and moves on with Next.
import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import App from "../../App";
import { firstBreach } from "../../game/engine";
import { useGame } from "../game/gameStore";
import { useGuide } from "./guideStore";

vi.mock("../ui/BattleBoard", () => ({ BattleBoard: () => null }));
vi.mock("./tutorialTargets", () => ({ tutorialTargets: () => ({ broke: [], tired: null, relief: null, mover: null }) }));

const mark = () => screen.getByRole("region", { name: "Tutorial step" });

beforeEach(() => act(() => useGuide.setState({ introSeen: true, coach: "active", step: "select", off: false })));

describe("phase 2 with nothing to point at", () => {
  it("explains each idea and moves on", async () => {
    const user = userEvent.setup();
    act(() => useGame.getState().loadBattle(firstBreach, { fortune: "on", seed: firstBreach.curatedSeed! }, "command"));
    render(<App />);
    act(() => {
      useGame.setState({ playbackSpeed: 400 });
      useGame.getState().sealOrders();
      useGame.getState().finishPlayback();
    });
    act(() => useGame.getState().nextPhase());
    expect(useGuide.getState().step).toBe("tiring");
    expect(mark()).toHaveTextContent("This bar is a company's cohesion, its nerve.");
    await user.click(within(mark()).getByRole("button", { name: "Next" }));
    expect(mark()).toHaveTextContent("Nobody is free to this phase");
    await user.click(within(mark()).getByRole("button", { name: "Next" }));
    expect(mark()).toHaveTextContent("No company can this phase. When one can, its tab says Can relieve.");
    await user.click(within(mark()).getByRole("button", { name: "Next" }));
    expect(useGuide.getState().step).toBe("sealAgain");
  });
});
