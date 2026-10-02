// Skirmish mode (M1, P6): the packs' skirmish lists, fought as authored on a fresh seed,
// with nothing saved and no Resolve carried or won. WebGL scenes are stood in for.
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ashAndBanner } from "../../game/campaign";
import { registry } from "../../game/packs";
import { useGame } from "../game/gameStore";
import { installRollApi, type RunStore } from "../roll/api";
import { Root } from "../Root";
import { useFlow } from "./flowStore";
import { firstSentence } from "./SkirmishList";
import { memoryStore } from "./testKit";

vi.mock("../../render/showcase/TitleScene", async () => ({ TitleScene: (await import("./testKit")).FakeTitleScene }));
vi.mock("../../render/showcase/CampaignMap", async () => ({ CampaignMap: (await import("./testKit")).FakeCampaignMap }));
vi.mock("../../render/showcase/CampaignSelectBackdrop", async () => ({ CampaignSelectBackdrop: (await import("./testKit")).FakeTitleScene }));
vi.mock("../ui/BattleBoard", () => ({ BattleBoard: () => null }));

let runs: RunStore;
let restore: () => void = () => {};

function launch(screenName: "title" | "skirmish" = "skirmish") {
  cleanup();
  const store = memoryStore();
  runs = { load: vi.fn(), loadBackup: vi.fn(), save: vi.fn(), setAside: vi.fn(), payload: vi.fn() };
  restore = installRollApi({ runs });
  useFlow.setState({ screen: screenName, definition: ashAndBanner, campaign: null, save: "checking", saved: null, store, saveError: null, skirmish: null, lastRecord: null });
  render(<Root />);
  return store;
}

/** Plays the open battle to its end with a reference plan. */
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

beforeEach(() => useGame.setState({ playbackSpeed: 1 }));
afterEach(() => {
  restore();
  restore = () => {};
  vi.restoreAllMocks();
});

describe("skirmish", () => {
  it("opens from the title and lists every skirmish the packs offer", async () => {
    const user = userEvent.setup();
    launch("title");
    await user.click(await screen.findByRole("button", { name: "Skirmish" }));
    expect(useFlow.getState().screen).toBe("skirmish");
    expect(screen.getByRole("region", { name: "Skirmish" })).toHaveAccessibleDescription(/Nothing is saved, and no company gains or loses Resolve/);
    const offered = registry.skirmishes().map(({ skirmish }) => skirmish.title);
    expect(offered.length).toBeGreaterThan(0);
    expect(screen.getAllByRole("button", { name: /^Fight: / }).map((button) => button.getAttribute("aria-label"))).toEqual(offered.map((title) => `Fight: ${title}`));
    expect(screen.getByRole("button", { name: "Fight: The First Breach" })).toHaveFocus();
    await user.click(screen.getByRole("button", { name: /Title screen/ }));
    expect(useFlow.getState().screen).toBe("title");
  });

  it("fights the authored battle at authored strength, on a fresh seed, outside any campaign", async () => {
    const user = userEvent.setup();
    launch();
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    await user.click(screen.getByRole("button", { name: "Fight: Hold for Dawn" }));
    const game = useGame.getState();
    const authored = registry.scenario("hold_for_dawn")!;
    expect(useFlow.getState()).toMatchObject({ screen: "battle", skirmish: { id: "skirmish_hold_for_dawn" } });
    expect(game).toMatchObject({ stage: "briefing", campaign: null, setup: { seed: 50_000 } });
    expect(game.setup.seed).not.toBe(authored.curatedSeed);
    // The scenario as written: no campaign Resolve, renown or names applied.
    expect(game.scenario).toBe(authored);
  });

  it("saves nothing, then plays again on a new seed or goes back to the list", async () => {
    const user = userEvent.setup();
    const store = launch();
    await user.click(screen.getByRole("button", { name: "Fight: The First Breach" }));
    fightOpenBattle("intended");

    expect(useGame.getState().stage).toBe("outcome");
    expect(await screen.findByText(/a skirmish: nothing is saved/)).toBeInTheDocument();
    expect(screen.queryByText(/campaign saved/)).not.toBeInTheDocument();
    expect(screen.queryByRole("list", { name: "Resolve after the battle" })).not.toBeInTheDocument();
    expect(store.data).toBeNull();
    expect(runs.save).not.toHaveBeenCalled();
    expect(useFlow.getState()).toMatchObject({ campaign: null, lastRecord: null });

    const seed = useGame.getState().setup.seed;
    expect(screen.getByRole("button", { name: "Play again" })).toHaveFocus();
    await user.click(screen.getByRole("button", { name: "Play again" }));
    expect(useGame.getState()).toMatchObject({ stage: "deploy", campaign: null });
    expect(useGame.getState().setup.seed).not.toBe(seed);

    fightOpenBattle("bad");
    await user.click(await screen.findByRole("button", { name: "Back to the skirmishes" }));
    expect(useFlow.getState().screen).toBe("skirmish");
    expect(store.data).toBeNull();
  });

  it("leaves a campaign in progress untouched", async () => {
    const user = userEvent.setup();
    const store = launch("title");
    await act(() => useFlow.getState().beginCampaign());
    const campaign = useFlow.getState().campaign;
    const saved = store.data;
    act(() => useFlow.getState().go("skirmish"));
    await user.click(await screen.findByRole("button", { name: "Fight: The First Breach" }));
    fightOpenBattle("intended");

    await screen.findByText(/a skirmish: nothing is saved/);
    expect(useFlow.getState().campaign).toBe(campaign);
    expect(store.data).toBe(saved);
    // A campaign battle opened afterwards is a campaign battle again.
    act(() => useFlow.getState().openBattle(ashAndBanner.battles[0].id));
    expect(useFlow.getState().skirmish).toBeNull();
    await waitFor(() => expect(useGame.getState().campaign?.state).toBe(campaign));
  });
});

describe("firstSentence", () => {
  it("keeps a briefing's opening sentence", () => {
    expect(firstSentence("This is the last wall. Everything comes at dawn.")).toBe("This is the last wall.");
    expect(firstSentence("No full stop here")).toBe("No full stop here");
    expect(firstSentence("Greyford's 3.5 leagues hold! Then more.")).toBe("Greyford's 3.5 leagues hold!");
  });
});
