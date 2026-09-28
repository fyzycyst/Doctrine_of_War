import { act, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";
import { useGame } from "./app/game/gameStore";
import { holdForDawn, timeOfDayAt } from "./game/engine";

vi.mock("./app/ui/BattleBoard", () => ({ BattleBoard: () => null }));

const game = () => useGame.getState();

/** Plays phases with the reference plan (playback skipped) until `phase` is the one to command. */
function commandPhase(phase: number) {
  act(() => {
    game().loadBattle(holdForDawn, { fortune: "off", seed: 1 }, "command");
    while (game().stage === "command" && game().view.phase < phase) {
      for (const [id, doctrine] of Object.entries(holdForDawn.referencePlans!.intended)) game().assignDoctrine(id, doctrine);
      game().sealOrders();
      game().finishPlayback();
      game().nextPhase();
    }
  });
}

beforeEach(() => useGame.setState({ playbackSpeed: 1 }));

describe("Hold for Dawn: the staged goal", () => {
  it("shows the goal, then makes dawn a moment: banner, new light, chronicle line, new aim", async () => {
    commandPhase(4);
    expect(game().stage).toBe("command");
    render(<App />);
    expect(screen.getByRole("status", { name: "Goal: Hold the Last Gate until dawn" })).toBeInTheDocument();

    act(() => {
      useGame.setState({ playbackSpeed: 400 });
      game().sealOrders();
    });
    const banner = await screen.findByText("Dawn breaks", {}, { timeout: 5000 });
    expect(banner.closest(".stage-banner")).toHaveTextContent("Break the Cinderram");
    // The dawn light arrives with the banner: the board shows the next phase (sunrise).
    expect(game().display?.phase).toBe(5);
    expect(timeOfDayAt(holdForDawn, game().display!.phase)).toBe("sunrise");

    await waitFor(() => expect(game().stage).toBe("report"), { timeout: 5000 });
    const report = screen.getByRole("dialog", { name: /./ });
    expect(within(report).getByText(/The line held through the night/)).toHaveTextContent("Now: Break the Cinderram.");

    act(() => game().nextPhase());
    expect(screen.getByRole("status", { name: "Goal: Break the Cinderram" })).toBeInTheDocument();
  });
});
