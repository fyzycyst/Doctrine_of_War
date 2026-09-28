import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ashAndBanner, startCampaign } from "../../game/campaign";
import { useGame } from "../game/gameStore";
import { Root } from "../Root";
import { useFlow } from "./flowStore";
import { campaignAfter } from "./devCampaign";
import { afterTutorial, memoryStore, savedStore } from "./testKit";

vi.mock("../../render/showcase/TitleScene", async () => ({ TitleScene: (await import("./testKit")).FakeTitleScene }));
vi.mock("../../render/showcase/CampaignMap", async () => ({ CampaignMap: (await import("./testKit")).FakeCampaignMap }));
vi.mock("../ui/BattleBoard", () => ({ BattleBoard: () => null }));

function reset(store = memoryStore()) {
  useFlow.setState({ screen: "title", campaign: null, save: "checking", saved: null, store, saveError: null });
  return store;
}

beforeEach(() => {
  reset();
});

describe("title screen", () => {
  it("offers Begin, and a disabled Continue when there is no save", async () => {
    render(<Root />);
    expect(await screen.findByText("No saved campaign yet")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Continue" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Begin the Campaign" })).toHaveFocus();
  });

  it("begins a campaign: saves it at once and opens the campaign map", async () => {
    const user = userEvent.setup();
    const store = reset();
    render(<Root />);
    await user.click(await screen.findByRole("button", { name: "Begin the Campaign" }));
    await waitFor(() => expect(useFlow.getState().screen).toBe("campaign"));
    expect(useFlow.getState().campaign).toEqual(startCampaign(ashAndBanner));
    expect(store.data).toContain('"battleIndex":0');
  });

  it("continues a valid save, naming the battle it leads to", async () => {
    const user = userEvent.setup();
    reset(savedStore(afterTutorial()));
    render(<Root />);
    const button = await screen.findByRole("button", { name: /Continue\s*Ember Ford/ });
    expect(button).toBeEnabled();
    await user.click(button);
    await waitFor(() => expect(useFlow.getState().screen).toBe("campaign"));
    expect(useFlow.getState().campaign?.battleIndex).toBe(1);
  });

  it("asks before a new campaign replaces a save", async () => {
    const user = userEvent.setup();
    const store = reset(savedStore(afterTutorial()));
    render(<Root />);
    await user.click(await screen.findByRole("button", { name: "Begin the Campaign" }));
    expect(screen.getByRole("alertdialog", { name: "Begin a new campaign?" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Keep my campaign" }));
    expect(useFlow.getState().screen).toBe("title");
    expect(store.data).toContain('"battleIndex":1');

    await user.click(screen.getByRole("button", { name: "Begin the Campaign" }));
    await user.click(screen.getByRole("button", { name: "Begin anew" }));
    await waitFor(() => expect(useFlow.getState().screen).toBe("campaign"));
    expect(store.data).toContain('"battleIndex":0');
  });

  it("keeps Continue disabled for an unreadable save and never loads it", async () => {
    reset(memoryStore("{ not a save"));
    render(<Root />);
    expect(await screen.findByText("The saved campaign could not be read")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Continue" })).toBeDisabled();
    await act(() => useFlow.getState().continueCampaign());
    expect(useFlow.getState().campaign).toBeNull();
  });
});

describe("campaign map", () => {
  function onMap(state = startCampaign(ashAndBanner)) {
    useFlow.setState({ campaign: state, screen: "campaign", save: "valid" });
    render(<Root />);
  }

  it("shows the islands, the ledger and the next battle", () => {
    onMap(afterTutorial());
    const islands = screen.getByRole("list", { name: "Islands" });
    expect(within(islands).getByRole("button", { name: "The First Breach" })).toHaveAttribute("data-status", "won");
    expect(within(islands).getByRole("button", { name: "Ember Ford" })).toHaveAttribute("data-status", "current");
    expect(within(islands).getByRole("button", { name: /Hold for Dawn/ })).toBeDisabled();
    const ledger = screen.getByRole("complementary", { name: "Army ledger" });
    expect(within(ledger).getByText("Greyford Shields")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Take the field: Ember Ford/ })).toHaveFocus();
  });

  it("opens the current battle's briefing with the campaign's companies", async () => {
    const user = userEvent.setup();
    const state = afterTutorial();
    onMap(state);
    await user.click(screen.getByRole("button", { name: "Ember Ford" }));
    expect(useFlow.getState().screen).toBe("battle");
    const game = useGame.getState();
    expect(game.stage).toBe("briefing");
    expect(game.baseScenario.id).toBe("ember_ford");
    expect(game.campaign?.state).toBe(state);
    expect(screen.getByRole("heading", { name: "Ember Ford" })).toBeInTheDocument();
    // First attempt: the curated seed, fortune on.
    expect(game.setup).toEqual({ seed: game.baseScenario.curatedSeed, fortune: "on" });
  });

  it("says a battle is still being forged instead of opening it", async () => {
    const user = userEvent.setup();
    onMap(campaignAfter(ashAndBanner, 2));
    await user.click(screen.getByRole("button", { name: /The Saltmarsh Column/ }));
    expect(useFlow.getState().screen).toBe("campaign");
    expect(screen.getByRole("status")).toHaveTextContent("still being forged");
    expect(screen.getByRole("button", { name: "Read the chronicle so far" })).toBeInTheDocument();
  });

  it("goes back to the title", async () => {
    const user = userEvent.setup();
    onMap();
    await user.click(screen.getByRole("button", { name: /Title screen/ }));
    expect(useFlow.getState().screen).toBe("title");
  });
});

/** Plays the battle open in the game store to its end with a reference plan. */
function fightOpenBattle(plan: "intended" | "bad") {
  act(() => {
    const game = useGame.getState();
    if (game.stage === "briefing") game.takeCommand();
    if (useGame.getState().stage === "deploy") useGame.getState().confirmDeployment();
    for (let guard = 0; guard < 12 && useGame.getState().stage !== "outcome"; guard += 1) {
      const now = useGame.getState();
      if (now.stage === "command") {
        for (const [squadId, doctrineId] of Object.entries(now.scenario.referencePlans?.[plan] ?? {})) now.assignDoctrine(squadId, doctrineId);
        now.sealOrders();
      }
      useGame.getState().finishPlayback();
      useGame.getState().nextPhase();
    }
  });
}

describe("the campaign loop", () => {
  it("records a won battle, autosaves, and returns to the map with the next battle open", async () => {
    const user = userEvent.setup();
    const store = reset();
    render(<Root />);
    await user.click(await screen.findByRole("button", { name: "Begin the Campaign" }));
    await user.click(await screen.findByRole("button", { name: /Take the field: The First Breach/ }));
    fightOpenBattle("intended");

    expect(useGame.getState().view.status).toBe("victory");
    await waitFor(() => expect(useFlow.getState().campaign?.history).toHaveLength(1));
    expect(store.data).toContain('"battleIndex":1');
    expect(screen.getByText(/campaign saved/)).toBeInTheDocument();
    expect(screen.getByRole("list", { name: "Resolve after the battle" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Retry/ })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Return to the campaign map" }));
    expect(useFlow.getState().screen).toBe("campaign");
    expect(screen.getByRole("button", { name: /Take the field: Ember Ford/ })).toBeInTheDocument();
  });

  it("records a defeat without moving on, and fights the same battle again", async () => {
    const user = userEvent.setup();
    reset();
    await act(() => useFlow.getState().beginCampaign());
    render(<Root />);
    act(() => useFlow.getState().openBattle("tutorial"));
    fightOpenBattle("bad");

    expect(useGame.getState().view.status).toBe("defeat");
    await waitFor(() => expect(useFlow.getState().campaign?.history).toHaveLength(1));
    const afterDefeat = useFlow.getState().campaign!;
    expect(afterDefeat.battleIndex).toBe(0);
    expect(afterDefeat.history[0].outcome).toBe("defeat");

    await user.click(screen.getByRole("button", { name: "Fight it again" }));
    const game = useGame.getState();
    expect(game.stage).toBe("deploy");
    expect(game.baseScenario.id).toBe("first_breach");
    expect(game.campaign?.state).toBe(afterDefeat);

    fightOpenBattle("intended");
    await waitFor(() => expect(useFlow.getState().campaign?.history).toHaveLength(2));
    expect(useFlow.getState().campaign!.history[1]).toMatchObject({ attempt: 2, outcome: "victory" });
  });

  it("records each battle once, whatever re-renders or repeats", async () => {
    reset();
    await act(() => useFlow.getState().beginCampaign());
    render(<Root />);
    act(() => useFlow.getState().openBattle("tutorial"));
    fightOpenBattle("intended");
    await waitFor(() => expect(useFlow.getState().campaign?.history).toHaveLength(1));
    await act(() => useFlow.getState().recordOutcome());
    await act(() => useFlow.getState().recordOutcome());
    expect(useFlow.getState().campaign?.history).toHaveLength(1);
  });

  it("continues from the autosave after a restart", async () => {
    const user = userEvent.setup();
    const store = reset();
    await act(() => useFlow.getState().beginCampaign());
    act(() => useFlow.getState().openBattle("tutorial"));
    fightOpenBattle("intended");
    await waitFor(() => expect(store.data).toContain('"battleIndex":1'));

    // A fresh launch: nothing in memory but the save.
    reset(store);
    render(<Root />);
    await user.click(await screen.findByRole("button", { name: /Continue\s*Ember Ford/ }));
    expect(useFlow.getState().screen).toBe("campaign");
    expect(useFlow.getState().campaign?.history[0].outcome).toBe("victory");
  });
});

describe("the ending", () => {
  it("shows the chronicle so far while the next battle is still being built", async () => {
    const user = userEvent.setup();
    useFlow.setState({ campaign: campaignAfter(ashAndBanner, 2), screen: "campaign" });
    render(<Root />);
    await user.click(screen.getByRole("button", { name: "Read the chronicle so far" }));
    expect(screen.getByRole("heading", { name: "The chronicle so far" })).toBeInTheDocument();
    expect(screen.getByText(/The Saltmarsh Column waits beyond the fog/)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Final ledger" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Return to the campaign map" }));
    expect(useFlow.getState().screen).toBe("campaign");
  });

  it("closes a complete campaign with the epilogue and the final ledger", () => {
    const state = campaignAfter(ashAndBanner, 2);
    useFlow.setState({ campaign: { ...state, battleIndex: 4, status: "complete" }, screen: "ending" });
    render(<Root />);
    expect(screen.getByRole("heading", { name: "Epilogue" })).toBeInTheDocument();
    expect(screen.getByText(/Dawn came grey over the last wall/)).toBeInTheDocument();
    expect(screen.getAllByText("Greyford Shields").length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "Begin a new campaign" })).toBeInTheDocument();
  });
});
