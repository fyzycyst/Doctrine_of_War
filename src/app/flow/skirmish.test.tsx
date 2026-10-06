// Skirmish mode (M1, P6; T25 §4): every battle of every campaign, fought on its default
// forces and a fresh seed, with nothing saved and no Resolve carried or won. WebGL scenes
// are stood in for.
import { act, cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ashAndBanner, assembleBattle, cinderRoad, recommendedForce, startCampaign } from "../../game/campaign";
import { prototypeScenarios } from "../../game/engine/fixtures";
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
    expect(screen.getByRole("region", { name: "Skirmish" })).toHaveAccessibleDescription(
      /Every skirmish starts with the battle's default forces: its own companies, all fresh, with no veterans\. The Host comes at its usual strength\. Nothing is saved\./,
    );
    const offered = registry.skirmishes().map(({ skirmish }) => skirmish.title);
    // Grouped by campaign, in campaign order.
    expect(screen.getByRole("region", { name: "Ash & Banner" })).toBeInTheDocument();
    expect(within(screen.getByRole("region", { name: "Cinder Road" })).getByRole("button", { name: "Fight: The Saltmarsh, Northbound" })).toBeInTheDocument();
    // Every Cinder Road battle says so (one line per battle).
    expect(within(screen.getByRole("region", { name: "Cinder Road" })).getAllByText("Default force: the recommended call.").length).toBeGreaterThanOrEqual(2);
    expect(within(screen.getByRole("region", { name: "Cinder Road" })).getByRole("button", { name: "Fight: Open a Road" })).toBeInTheDocument();
    expect(within(screen.getByRole("region", { name: "Cinder Road" })).getByRole("button", { name: "Fight: Cut the Retreat" })).toBeInTheDocument();
    expect(within(screen.getByRole("region", { name: "Ash & Banner" })).queryByText("Default force: the recommended call.")).not.toBeInTheDocument();
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
    expect(useFlow.getState()).toMatchObject({ screen: "battle", skirmish: { scenarioId: "hold_for_dawn" } });
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

describe("every battle is a skirmish", () => {
  it("lists every built battle of every campaign in every pack, in campaign order, and no prototype", () => {
    const offered = registry.skirmishes().map(({ skirmish }) => skirmish.scenarioId);
    const battles = registry.packs.flatMap((pack) =>
      pack.campaigns.flatMap((def) => def.battles.filter((battle) => !battle.placeholder && registry.scenario(battle.scenarioId)).map((battle) => battle.scenarioId)),
    );
    expect(battles.length).toBeGreaterThan(4);
    expect(offered.slice(0, battles.length)).toEqual(battles);
    expect(offered).toContain("cinder_road_saltmarsh");
    expect(offered).toContain("cinder_road_wagon_park");
    expect(offered).toContain("cinder_road_ember_ford");
    expect(offered).toContain("cinder_road_gate_road");
    for (const prototype of prototypeScenarios) expect(offered).not.toContain(prototype.id);
    expect(new Set(registry.skirmishes().map(({ skirmish }) => skirmish.id)).size).toBe(offered.length);
  });

  it("fights a later Roll battle (Cinder Road battle 2) on the starting army's recommended force at that battle", async () => {
    const user = userEvent.setup();
    launch();
    await user.click(screen.getByRole("button", { name: "Fight: Strike the Wagon Park" }));
    const scenario = registry.scenario("cinder_road_wagon_park")!;
    const at = { ...startCampaign(cinderRoad), battleIndex: 1 };
    const expected = assembleBattle(cinderRoad, at, scenario, recommendedForce(cinderRoad, at, scenario));
    expect(useFlow.getState().screen).toBe("battle");
    expect(useGame.getState().campaign).toBeNull();
    expect(useGame.getState().scenario.squads).toEqual(expected.squads);
    fightOpenBattle("intended");
    expect(useGame.getState().stage).toBe("outcome");
  });

  it("fights Cinder Road battle 1 on the starting army's recommended force, all fresh, no veterans, to an outcome; nothing saved", async () => {
    const user = userEvent.setup();
    const store = launch();
    await user.click(screen.getByRole("button", { name: "Fight: The Saltmarsh, Northbound" }));
    const scenario = registry.scenario("cinder_road_saltmarsh")!;
    const start = startCampaign(cinderRoad);
    const expected = assembleBattle(cinderRoad, start, scenario, recommendedForce(cinderRoad, start, scenario));
    const game = useGame.getState();
    expect(useFlow.getState().screen).toBe("battle");
    expect(game.campaign).toBeNull();
    // The same companies, profiles and Host as the starting army's recommended call (fresh, no carried veterans).
    expect(game.scenario.squads).toEqual(expected.squads);
    expect(game.scenario.squads.map((squad) => squad.name)).toContain("Coldwater Shields");
    fightOpenBattle("intended");
    expect(useGame.getState().stage).toBe("outcome");
    expect(await screen.findByText(/a skirmish: nothing is saved/)).toBeInTheDocument();
    expect(store.data).toBeNull();
    expect(runs.save).not.toHaveBeenCalled();
  });
});

describe("Open a Road as a skirmish", () => {
  it("fights Cinder Road battle 3 on the starting army's recommended force to an outcome; nothing saved", async () => {
    const user = userEvent.setup();
    const store = launch();
    await user.click(screen.getByRole("button", { name: "Fight: Open a Road" }));
    const scenario = registry.scenario("cinder_road_ember_ford")!;
    // The starting army (all fresh, no veterans), called up for battle 3 rather than battle 1.
    const start = { ...startCampaign(cinderRoad), battleIndex: cinderRoad.battles.findIndex((battle) => battle.scenarioId === scenario.id) };
    const expected = assembleBattle(cinderRoad, start, scenario, recommendedForce(cinderRoad, start, scenario));
    expect(useFlow.getState().screen).toBe("battle");
    expect(useGame.getState().campaign).toBeNull();
    expect(useGame.getState().scenario.squads).toEqual(expected.squads);
    fightOpenBattle("intended");
    expect(useGame.getState().stage).toBe("outcome");
    expect(await screen.findByText(/a skirmish: nothing is saved/)).toBeInTheDocument();
    expect(store.data).toBeNull();
    expect(runs.save).not.toHaveBeenCalled();
  });
});

describe("firstSentence", () => {
  it("keeps a briefing's opening sentence", () => {
    expect(firstSentence("This is the last wall. Everything comes at dawn.")).toBe("This is the last wall.");
    expect(firstSentence("No full stop here")).toBe("No full stop here");
    expect(firstSentence("Greyford's 3.5 leagues hold! Then more.")).toBe("Greyford's 3.5 leagues hold!");
  });
});
