import { act, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";
import { useGame } from "./app/game/gameStore";
import { useAppStore } from "./app/store";
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
    // Eleven companies: the roster turns compact so every tab fits.
    expect(screen.getByRole("navigation", { name: "Companies" })).toHaveClass("dense");

    // Note the board and the HUD at the instant the dawn banner goes up (the moment is
    // short at test speed, so read it as it happens rather than after).
    let dawnPhase: number | undefined;
    let dawnGoal: string | null = null;
    const unsubscribe = useGame.subscribe((state) => {
      if (dawnPhase === undefined && state.callouts.some((callout) => callout.kind === "stage")) {
        dawnPhase = state.display?.phase;
      }
    });
    act(() => {
      useGame.setState({ playbackSpeed: 40 });
      game().sealOrders();
    });
    const banner = await screen.findByText("Dawn breaks", {}, { timeout: 8000 });
    expect(banner.closest(".stage-banner")).toHaveTextContent("Break the Cinderram");
    dawnGoal = screen.queryByRole("status", { name: /Goal:/ })?.getAttribute("aria-label") ?? null;
    unsubscribe();
    // The aim turns with the light, during the moment itself.
    expect(dawnGoal).toBe("Goal: Break the Cinderram");
    // The dawn light arrives with the banner: the board shows the next phase (sunrise).
    expect(dawnPhase).toBe(5);
    expect(timeOfDayAt(holdForDawn, dawnPhase!)).toBe("sunrise");

    await waitFor(() => expect(game().stage).toBe("report"), { timeout: 8000 });
    const report = screen.getByRole("dialog", { name: /./ });
    expect(within(report).getByText(/The line held through the night/)).toHaveTextContent("Now: Break the Cinderram.");

    act(() => game().nextPhase());
    expect(screen.getByRole("status", { name: "Goal: Break the Cinderram" })).toBeInTheDocument();
    // At sunrise the inspector's sight has lost the night penalty.
    act(() => useAppStore.getState().selectSquad("greyford_shields"));
    const inspector = screen.getByRole("complementary", { name: "Inspector: Greyford Shields" });
    expect(within(inspector).getByText("Sight").nextElementSibling).toHaveTextContent(/^2 hexes$/);
  });
});
