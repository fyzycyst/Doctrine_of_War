import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { firstBreach } from "../../game/engine";
import { memoryStore } from "../flow/testKit";
import { useFlow } from "../flow/flowStore";
import { useGame } from "../game/gameStore";
import { Root } from "../Root";
import { useAppStore } from "../store";
import { GUIDE_STORAGE_KEY, useGuide } from "./guideStore";

vi.mock("../../render/showcase/TitleScene", async () => ({ TitleScene: (await import("../flow/testKit")).FakeTitleScene }));
vi.mock("../../render/showcase/CampaignMap", async () => ({ CampaignMap: (await import("../flow/testKit")).FakeCampaignMap }));
vi.mock("../ui/BattleBoard", () => ({ BattleBoard: () => null }));

const guide = () => useGuide.getState();
const coachRegion = () => screen.queryByRole("region", { name: "Guide" });

function firstBattleAt(stage: "briefing" | "command") {
  act(() => useGame.getState().loadBattle(firstBreach, { fortune: "on", seed: firstBreach.curatedSeed! }, stage));
  useFlow.setState({ screen: "battle" });
}

beforeEach(() => {
  act(() => guide().reset());
  useAppStore.getState().clearSelection();
  useFlow.setState({ screen: "title", campaign: null, save: "none", saved: null, store: memoryStore(), settingsOpen: false, howToOpen: false });
  useGame.setState({ playbackSpeed: 1, pace: "readable" });
});

describe("What is a doctrine?", () => {
  it("opens the first campaign battle once, before the briefing", async () => {
    const user = userEvent.setup();
    render(<Root />);
    await act(() => useFlow.getState().beginCampaign());
    act(() => useFlow.getState().openBattle("tutorial"));

    const intro = screen.getByRole("dialog", { name: "Standing orders" });
    expect(intro).toHaveAccessibleDescription("You don't command soldiers. You give each company standing orders, then watch them act.");
    expect(within(intro).getByText("Shield the Line")).toBeInTheDocument();
    expect(within(intro).getByRole("button", { name: "Continue" })).toHaveFocus();

    await user.click(within(intro).getByRole("button", { name: "Continue" }));
    expect(screen.getByRole("heading", { name: "The First Breach" })).toBeInTheDocument();
    expect(localStorage.getItem(GUIDE_STORAGE_KEY)).toContain('"introSeen":true');

    // Back on the briefing later: no intro again.
    act(() => useFlow.getState().openBattle("tutorial"));
    expect(screen.queryByRole("dialog", { name: "Standing orders" })).not.toBeInTheDocument();
  });
});

describe("first-battle coach marks", () => {
  beforeEach(() => act(() => useGuide.setState({ introSeen: true })));

  it("walks through select → read → assign → seal → watch → chronicle, then never again", async () => {
    const user = userEvent.setup();
    firstBattleAt("command");
    render(<Root />);

    expect(within(coachRegion()!).getByRole("heading", { name: "Choose a company" })).toBeInTheDocument();
    expect(screen.getByText(/Guide: Choose a company\./)).toBeInTheDocument();

    await user.click(screen.getByRole("option", { name: /Greyford Shields/ }));
    expect(guide().step).toBe("read");
    await user.click(within(coachRegion()!).getByRole("button", { name: "Next" }));
    expect(within(coachRegion()!).getByRole("heading", { name: "Give new orders" })).toBeInTheDocument();

    await user.click(screen.getByRole("option", { name: /Fighting Withdrawal/ }));
    expect(within(coachRegion()!).getByRole("heading", { name: "Seal your orders" })).toBeInTheDocument();

    act(() => useGame.setState({ playbackSpeed: 100 }));
    await user.click(screen.getByRole("button", { name: "Seal Orders" }));
    await user.click(screen.getByRole("button", { name: "Seal anyway" }));
    expect(guide().step).toBe("watch");

    // Playback stops on the first of your rule banners until you carry on.
    await waitFor(() => expect(guide().watchCallout).not.toBeNull(), { timeout: 5000 });
    const carryOn = within(coachRegion()!).getByRole("button", { name: "Carry on" });
    expect(carryOn).toHaveFocus();
    const pinned = useGame.getState().callouts.find((callout) => callout.id === guide().watchCallout);
    expect(pinned).toMatchObject({ kind: "rule", faction: "free_banners" });
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(useGame.getState().stage).toBe("resolving");

    await user.click(carryOn);
    await waitFor(() => expect(useGame.getState().stage).toBe("report"), { timeout: 5000 });
    const report = screen.getByRole("dialog", { name: /./ });
    const inline = within(report).getByRole("region", { name: "Guide" });
    expect(within(inline).getByRole("heading", { name: "Read the chronicle" })).toBeInTheDocument();
    await user.click(within(inline).getByRole("button", { name: "Finish the guide" }));
    expect(guide().coach).toBe("done");
    expect(localStorage.getItem(GUIDE_STORAGE_KEY)).toContain('"coach":"done"');
    expect(within(report).queryByRole("region", { name: "Guide" })).not.toBeInTheDocument();
  });

  it("skips the whole guide with Escape, for good", async () => {
    const user = userEvent.setup();
    firstBattleAt("command");
    render(<Root />);
    expect(coachRegion()).toBeInTheDocument();
    await user.keyboard("{Escape}");
    expect(guide().coach).toBe("done");
    expect(coachRegion()).not.toBeInTheDocument();
    expect(localStorage.getItem(GUIDE_STORAGE_KEY)).toContain('"coach":"done"');
  });

  it("catches up when the player runs ahead, and never nags about what is done", async () => {
    const user = userEvent.setup();
    firstBattleAt("command");
    render(<Root />);
    act(() => void useGame.getState().assignDoctrine("greyford_shields", "fighting_withdrawal"));
    expect(guide().step).toBe("seal");
    await user.click(screen.getByRole("button", { name: "Seal Orders" }));
    await user.click(screen.getByRole("button", { name: "Seal anyway" }));
    expect(guide().step).toBe("watch");
    await user.click(screen.getByRole("button", { name: /Skip\s*Space/ }));
    await waitFor(() => expect(useGame.getState().stage).toBe("report"));
    expect(guide().step).toBe("chronicle");
  });

  it("stays out of every other battle", () => {
    act(() => useGame.getState().loadBattle({ ...firstBreach, id: "ember_ford_like" }, { fortune: "off", seed: 1 }, "command"));
    useFlow.setState({ screen: "battle" });
    render(<Root />);
    expect(coachRegion()).not.toBeInTheDocument();
  });
});

describe("How to play", () => {
  it("opens from the title and from Settings, and Settings can show the guide again", async () => {
    const user = userEvent.setup();
    act(() => useGuide.setState({ introSeen: true, coach: "done" }));
    render(<Root />);
    await user.click(screen.getByRole("button", { name: "How to play" }));
    const page = screen.getByRole("dialog", { name: "How to play" });
    for (const heading of ["The doctrine loop", "A doctrine", "Three beats a phase", "Resolve and renown", "Fortune", "Fog of war"]) {
      expect(within(page).getByRole("heading", { name: heading })).toBeInTheDocument();
    }
    await user.click(within(page).getByRole("button", { name: "Back" }));
    expect(screen.queryByRole("dialog", { name: "How to play" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Settings" }));
    await user.click(screen.getByRole("button", { name: "Show the guide again" }));
    expect(guide()).toMatchObject({ introSeen: false, coach: "active", step: "select" });
    await user.click(within(screen.getByRole("dialog", { name: "Settings" })).getByRole("button", { name: "How to play" }));
    expect(screen.queryByRole("dialog", { name: "Settings" })).not.toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: "How to play" })).toBeInTheDocument();
  });
});
