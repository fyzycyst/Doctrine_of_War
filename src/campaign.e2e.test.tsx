// End-to-end campaign QA (T18): the whole campaign through the real UI with real
// clicks — title, campaign map, intro and coach marks, briefing, deployment, the
// doctrine hand, the seal, playback, the chronicle, outcomes and the ending — plus
// defeat → fight again, a stalemate, relaunch-and-continue, Doctrine only, Fast pace
// and capture mode. WebGL scenes are stood in for (jsdom has none).
import { act, cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useCaptureStore } from "./app/captureStore";
import { useFlow } from "./app/flow/flowStore";
import { memoryStore } from "./app/flow/testKit";
import { useGame } from "./app/game/gameStore";
import { useGuide } from "./app/guide/guideStore";
import { Root } from "./app/Root";
import { useSettings } from "./app/settingsStore";
import { useAppStore } from "./app/store";
import { ashAndBanner, currentBattle, loadCampaign } from "./game/campaign";
import { doctrineLibrary } from "./game/engine";

vi.mock("./render/showcase/TitleScene", async () => ({ TitleScene: (await import("./app/flow/testKit")).FakeTitleScene }));
vi.mock("./render/showcase/CampaignMap", async () => ({ CampaignMap: (await import("./app/flow/testKit")).FakeCampaignMap }));
vi.mock("./app/ui/BattleBoard", () => ({ BattleBoard: () => null }));

type User = ReturnType<typeof userEvent.setup>;
const game = () => useGame.getState();

function launch(store = memoryStore()) {
  cleanup();
  useAppStore.getState().clearSelection();
  useFlow.setState({ screen: "title", campaign: null, save: "checking", saved: null, store, saveError: null, notice: null, settingsOpen: false, howToOpen: false });
  render(<Root />);
  return store;
}

beforeEach(() => {
  useCaptureStore.setState({ captureMode: false });
  act(() => useSettings.getState().set({ doctrineOnly: false, defaultPace: "readable", motion: "system", quality: "high" }));
  act(() => useGuide.setState({ introSeen: true, coach: "done" }));
});

/** Gives every company in the reference plan its doctrine by clicking the roster and the hand. */
async function orderByHand(user: User, plan: "intended" | "bad") {
  const orders = game().scenario.referencePlans?.[plan] ?? {};
  for (const [squadId, doctrineId] of Object.entries(orders)) {
    const squad = game().view.squads.find((item) => item.id === squadId);
    if (!squad || squad.status !== "active") continue;
    await user.click(screen.getByRole("option", { name: new RegExp(squad.name) }));
    const hand = screen.getByRole("listbox", { name: `Doctrine for ${squad.name}` });
    await user.click(within(hand).getByRole("option", { name: new RegExp(doctrineLibrary[doctrineId].name) }));
  }
}

/** From a briefing, through every phase, to the outcome screen. Returns the outcome word. */
async function fightBattle(user: User, plan: "intended" | "bad" = "intended"): Promise<string> {
  const intro = screen.queryByRole("dialog", { name: "Standing orders" });
  if (intro) await user.click(within(intro).getByRole("button", { name: "Continue" }));
  await user.click(screen.getByRole("button", { name: "Take Command" }));
  await user.click(screen.getByRole("button", { name: "March to positions" }));
  for (let guard = 0; guard < 8 && game().stage === "command"; guard += 1) {
    await orderByHand(user, plan);
    await user.click(screen.getByRole("button", { name: "Seal Orders" }));
    const confirm = screen.queryByRole("alertdialog");
    if (confirm) await user.click(within(confirm).getByRole("button", { name: "Seal anyway" }));
    expect(game().stage).toBe("resolving");
    await user.click(screen.getByRole("button", { name: /Skip\s*Space/ }));
    await waitFor(() => expect(game().stage).toBe("report"));
    const guideMark = screen.queryByRole("button", { name: "Finish the guide" });
    if (guideMark) await user.click(guideMark);
    await user.click(screen.getByRole("button", { name: /Next Phase|See the outcome/ }));
  }
  expect(game().stage).toBe("outcome");
  return screen.getByRole("heading", { level: 2, name: /Victory|Defeat|Stalemate/ }).textContent!;
}

const savedIndex = (store: { data: string | null }) => loadCampaign(store.data!, ashAndBanner).battleIndex;

describe("end-to-end campaign", () => {
  it(
    "plays all four battles with real clicks, survives a relaunch, and reaches the epilogue",
    async () => {
      act(() => useGuide.getState().reset()); // a first-time player
      const user = userEvent.setup();
      let store = launch();
      await user.click(await screen.findByRole("button", { name: "Begin the Campaign" }));

      const titles = ["The First Breach", "Ember Ford", "The Saltmarsh Column", "Hold for Dawn"];
      for (const [index, title] of titles.entries()) {
        if (index === 2) {
          // Quit mid-campaign and relaunch: Continue picks up from the autosave.
          store = launch(store);
          await user.click(await screen.findByRole("button", { name: new RegExp(`Continue\\s*${title}`) }));
        }
        await user.click(screen.getByRole("button", { name: `Take the field: ${title}` }));
        expect(game().baseScenario.title).toBe(title);
        // Every campaign battle runs on its curated seed with fortune on, first time.
        expect(game().setup).toEqual({ seed: game().baseScenario.curatedSeed, fortune: "on" });
        const outcome = await fightBattle(user);
        expect(outcome).toBe("Victory");
        await waitFor(() => expect(savedIndex(store)).toBe(index + 1));
        expect(screen.getByText(/campaign saved/)).toBeInTheDocument();
        await user.click(screen.getByRole("button", { name: index === 3 ? "Read the epilogue" : "Return to the campaign map" }));
      }

      expect(useFlow.getState().screen).toBe("ending");
      expect(screen.getByRole("heading", { name: "Epilogue" })).toBeInTheDocument();
      expect(loadCampaign(store.data!, ashAndBanner).status).toBe("complete");
      // The guide ran once, in the first battle only.
      expect(useGuide.getState()).toMatchObject({ introSeen: true, coach: "done" });
    },
    60_000,
  );

  it("loses with a bad plan, keeps the companies, and wins the same battle again", async () => {
    const user = userEvent.setup();
    const store = launch();
    await user.click(await screen.findByRole("button", { name: "Begin the Campaign" }));
    await user.click(screen.getByRole("button", { name: "Take the field: The First Breach" }));
    expect(await fightBattle(user, "bad")).toBe("Defeat");
    await waitFor(() => expect(useFlow.getState().campaign?.history).toHaveLength(1));
    expect(savedIndex(store)).toBe(0);

    await user.click(screen.getByRole("button", { name: "Fight it again" }));
    expect(game().stage).toBe("deploy");
    await user.click(screen.getByRole("button", { name: "March to positions" }));
    // (fightBattle expects a briefing; pick up from the orders window instead.)
    for (let guard = 0; guard < 8 && game().stage === "command"; guard += 1) {
      await orderByHand(user, "intended");
      await user.click(screen.getByRole("button", { name: "Seal Orders" }));
      const confirm = screen.queryByRole("alertdialog");
      if (confirm) await user.click(within(confirm).getByRole("button", { name: "Seal anyway" }));
      await user.click(screen.getByRole("button", { name: /Skip\s*Space/ }));
      await waitFor(() => expect(game().stage).toBe("report"));
      await user.click(screen.getByRole("button", { name: /Next Phase|See the outcome/ }));
    }
    expect(screen.getByRole("heading", { level: 2, name: "Victory" })).toBeInTheDocument();
    await waitFor(() => expect(savedIndex(store)).toBe(1));
    expect(useFlow.getState().campaign!.history.map((record) => [record.outcome, record.attempt])).toEqual([
      ["defeat", 1],
      ["victory", 2],
    ]);
  }, 30_000);

  it("settles a stalemate: the campaign moves on and the island shows it", async () => {
    const user = userEvent.setup();
    launch();
    await user.click(await screen.findByRole("button", { name: "Begin the Campaign" }));
    for (const title of ["The First Breach", "Ember Ford"]) {
      await user.click(screen.getByRole("button", { name: `Take the field: ${title}` }));
      await fightBattle(user);
      await user.click(screen.getByRole("button", { name: "Return to the campaign map" }));
    }
    // Seed 2 is a known stalemate for the intended plan in the Saltmarsh on this roster (fortune on).
    await user.click(screen.getByRole("button", { name: "Take the field: The Saltmarsh Column" }));
    act(() => game().loadBattle(game().baseScenario, { seed: 2, fortune: "on" }, "briefing", game().campaign));
    expect(await fightBattle(user)).toBe("Stalemate");
    await waitFor(() => expect(useFlow.getState().campaign?.battleIndex).toBe(3));
    await user.click(screen.getByRole("button", { name: "Return to the campaign map" }));
    expect(within(screen.getByRole("list", { name: "Islands" })).getByRole("button", { name: "The Saltmarsh Column" })).toHaveAttribute(
      "data-status",
      "stalemate",
    );
    expect(screen.getByRole("button", { name: "Take the field: Hold for Dawn" })).toBeInTheDocument();
  }, 40_000);

  it("plays Doctrine only (fortune off) at Fast pace, and films in capture mode", async () => {
    const user = userEvent.setup();
    act(() => useSettings.getState().set({ doctrineOnly: true, defaultPace: "fast" }));
    launch();
    await user.click(await screen.findByRole("button", { name: "Begin the Campaign" }));
    await user.click(screen.getByRole("button", { name: "Take the field: The First Breach" }));
    expect(game().setup.fortune).toBe("off");
    expect(game().pace).toBe("fast");
    await user.click(screen.getByRole("button", { name: "Take Command" }));
    await user.click(screen.getByRole("button", { name: "March to positions" }));
    expect(screen.getByRole("button", { name: "Fast" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByLabelText(/Fortune off/)).toBeInTheDocument();

    // Capture mode mid-battle: the HUD goes, the phase still plays out.
    await user.keyboard("{Control>}{Shift>}H{/Shift}{/Control}");
    expect(screen.queryByRole("navigation", { name: "Companies" })).not.toBeInTheDocument();
    act(() => {
      useGame.setState({ playbackSpeed: 400 });
      game().sealOrders();
    });
    await waitFor(() => expect(game().stage).toBe("report"), { timeout: 5000 });
    await user.keyboard("{Control>}{Shift>}H{/Shift}{/Control}");
    expect(screen.getByRole("button", { name: "Next Phase" })).toBeInTheDocument();
    useGame.setState({ playbackSpeed: 1 });
  }, 30_000);

  it("keeps the next battle in the save when the player quits from the outcome screen", async () => {
    const user = userEvent.setup();
    const store = launch();
    await user.click(await screen.findByRole("button", { name: "Begin the Campaign" }));
    await user.click(screen.getByRole("button", { name: "Take the field: The First Breach" }));
    await fightBattle(user);
    // Quit without pressing anything on the outcome screen.
    await waitFor(() => expect(savedIndex(store)).toBe(1));
    launch(store);
    await user.click(await screen.findByRole("button", { name: /Continue\s*Ember Ford/ }));
    expect(currentBattle(ashAndBanner, useFlow.getState().campaign!)?.title).toBe("Ember Ford");
  }, 30_000);
});
