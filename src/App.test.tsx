import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";
import { useGame } from "./app/game/gameStore";
import { useAppStore } from "./app/store";
import { applyCampaign, ashAndBanner, startCampaign } from "./game/campaign";
import { createInitialState, doctrineLibrary, firstBreach } from "./game/engine";

// WebGL does not exist in jsdom; the diorama is exercised by the capture script instead.
vi.mock("./app/ui/BattleBoard", () => ({ BattleBoard: () => null }));

function loadFirstBreach(fortune: "on" | "off" = "off", seed = 1) {
  act(() => useGame.getState().loadBattle(firstBreach, { fortune, seed }));
}

const game = () => useGame.getState();

beforeEach(() => {
  useGame.setState({ playbackSpeed: 1, pace: "readable" });
  useAppStore.getState().clearSelection();
  useAppStore.getState().setHoveredSquad(null);
  loadFirstBreach();
});

async function toCommand(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "Take Command" }));
  await user.click(screen.getByRole("button", { name: "March to positions" }));
}

describe("command flow on The First Breach (fortune off)", () => {
  it("runs briefing → deploy → assign → seal → report → next phase → outcome", async () => {
    const user = userEvent.setup();
    render(<App />);

    // Briefing: title, plain-words conditions, and the one way forward.
    expect(screen.getByRole("heading", { name: "The First Breach" })).toBeInTheDocument();
    expect(screen.getByText("Keep Greyford Gate standing through all 3 phases.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Take Command" }));

    // Deploy: an occupied hex is refused with a reason, a free one is accepted.
    await user.click(screen.getByRole("option", { name: /Greyford Shields/ }));
    const deploy = screen.getByRole("group", { name: "Deploy Greyford Shields" });
    await user.click(within(deploy).getByRole("button", { name: /Upper Gate Road/ }));
    expect(screen.getByRole("status")).toHaveTextContent("Dawnwatch Archers already holds that hex.");
    await user.click(within(deploy).getByRole("button", { name: /^Gate Road/ }));
    expect(game().deployment.greyford_shields).toEqual({ q: 2, r: 2 });
    expect(game().view.squads.find((squad) => squad.id === "greyford_shields")?.hex).toEqual({ q: 2, r: 2 });
    await user.click(screen.getByRole("button", { name: "March to positions" }));

    // Assign by keyboard: the hand opens on the current doctrine; → then Enter assigns the next card.
    const hand = screen.getByRole("listbox", { name: "Doctrine for Greyford Shields" });
    const cards = within(hand).getAllByRole("option");
    expect(cards[0]).toHaveAttribute("aria-selected", "true");
    act(() => cards[0].focus());
    await user.keyboard("{ArrowRight}{Enter}");
    expect(game().orders).toEqual({ greyford_shields: "fighting_withdrawal" });
    expect(within(hand).getByRole("option", { name: /Fighting Withdrawal/ })).toHaveAttribute("aria-selected", "true");

    // Assign by click, then seal: the three untouched companies trigger a confirmation.
    await user.click(within(hand).getByRole("option", { name: /Shield the Line/ }));
    expect(game().orders).toEqual({ greyford_shields: "shield_the_line" });
    await user.click(screen.getByRole("button", { name: "Seal Orders" }));
    const confirm = screen.getByRole("alertdialog", { name: "Seal with standing doctrines?" });
    expect(within(confirm).getAllByRole("listitem")).toHaveLength(3);
    await user.click(within(confirm).getByRole("button", { name: "Seal anyway" }));

    // The phase plays out on the board; Skip jumps to the final state and the report.
    expect(game().stage).toBe("resolving");
    await user.click(screen.getByRole("button", { name: /Skip/ }));

    // Report for phase 1, then play on until the battle ends.
    expect(screen.getByText("Chronicle · Phase 1")).toBeInTheDocument();
    // The seed stays out of sight unless Settings → Support → Show battle details is on.
    expect(screen.queryByText(/seed/)).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Next Phase" }));
    expect(game().stage).toBe("command");

    for (let guard = 0; guard < 5 && game().stage !== "outcome"; guard += 1) {
      if (game().stage === "command") {
        await user.click(screen.getByRole("button", { name: "Seal Orders" }));
        await user.click(screen.getByRole("button", { name: "Seal anyway" }));
        await user.click(screen.getByRole("button", { name: /Skip/ }));
      }
      await user.click(screen.getByRole("button", { name: /Next Phase|See the outcome/ }));
    }
    expect(game().stage).toBe("outcome");
    expect(screen.getByRole("heading", { level: 2, name: /Victory|Defeat|Stalemate/ })).toBeInTheDocument();
    expect(game().log).toHaveLength(3);
  });

  it("opens the confirmation as a native modal and returns focus on Review orders", async () => {
    const user = userEvent.setup();
    render(<App />);
    await toCommand(user);
    const seal = screen.getByRole("button", { name: "Seal Orders" });
    await user.click(seal);
    const confirm = screen.getByRole("alertdialog", { name: "Seal with standing doctrines?" });
    expect(confirm.tagName).toBe("DIALOG");
    expect(confirm).toHaveAttribute("data-modal", "true");
    expect(within(confirm).getByRole("button", { name: "Seal anyway" })).toHaveFocus();
    await user.click(within(confirm).getByRole("button", { name: "Review orders" }));
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(seal).toHaveFocus();
  });

  it("shows the report as a modal and hands focus back to the roster after Next Phase", async () => {
    const user = userEvent.setup();
    render(<App />);
    await toCommand(user);
    act(() => {
      game().sealOrders();
      game().finishPlayback();
    });
    const report = screen.getByRole("dialog", { name: /./ });
    expect(report.tagName).toBe("DIALOG");
    expect(report).toHaveAttribute("data-modal", "true");
    const next = within(report).getByRole("button", { name: "Next Phase" });
    expect(next).toHaveFocus();
    await user.click(next);
    expect(screen.getByRole("option", { name: /Greyford Shields/ })).toHaveFocus();
  });

  it("seals without asking when every company has new orders", async () => {
    const user = userEvent.setup();
    render(<App />);
    await toCommand(user);
    for (const id of ["greyford_shields", "dawnwatch_archers", "mercy_standard", "stoneford_riders"]) {
      act(() => void game().assignDoctrine(id, "shield_the_line"));
    }
    await user.click(screen.getByRole("button", { name: "Seal Orders" }));
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(game().stage).toBe("resolving");
  });
});

describe("doctrine allowlist", () => {
  it("offers exactly the scenario's player doctrines and refuses anything else", async () => {
    const user = userEvent.setup();
    render(<App />);
    await toCommand(user);
    await user.click(screen.getByRole("option", { name: /Mercy Standard/ }));

    const hand = screen.getByRole("listbox", { name: "Doctrine for Mercy Standard" });
    const names = within(hand)
      .getAllByRole("option")
      .map((card) => card.textContent);
    expect(names).toHaveLength(firstBreach.playerDoctrineIds.length);
    firstBreach.playerDoctrineIds.forEach((id, index) => expect(names[index]).toContain(doctrineLibrary[id].name));

    // A Host doctrine, an unknown id, or an enemy squad are all refused.
    expect(game().assignDoctrine("mercy_standard", "iron_tide")).toBe(false);
    expect(game().assignDoctrine("mercy_standard", "no_such_doctrine")).toBe(false);
    expect(game().assignDoctrine("cinder_vanguard", "shield_the_line")).toBe(false);
    expect(game().orders).toEqual({});
  });

  it("shows no hand for an enemy squad", async () => {
    const user = userEvent.setup();
    render(<App />);
    await toCommand(user);
    await user.click(screen.getByRole("option", { name: /Cinder Vanguard/ }));
    expect(screen.queryByRole("listbox", { name: /Doctrine for/ })).not.toBeInTheDocument();
    // Fortune off: everything is in sight, so their doctrine is shown.
    expect(screen.getByText("Their doctrine")).toBeInTheDocument();
    expect(screen.getByText("Iron Tide")).toBeInTheDocument();
  });
});

describe("fog of war in the inspector", () => {
  it("shows a sighted enemy's doctrine and seals a last-known enemy's", async () => {
    const user = userEvent.setup();
    loadFirstBreach("on", 146);
    render(<App />);
    await toCommand(user);

    // Take the real engine state and let one sighted enemy slip out of sight.
    const engine = structuredClone(game().engine);
    const intel = engine.intel.free_banners ?? {};
    const [hiddenId] = Object.keys(intel).filter((id) => intel[id].visible);
    intel[hiddenId].visible = false;
    act(() => game().replaceEngine(engine));

    const hidden = game().view.squads.find((squad) => squad.id === hiddenId)!;
    expect(hidden.lastKnown).toBe(true);
    expect(hidden.doctrineId).toBeNull();

    await user.click(screen.getByRole("option", { name: new RegExp(hidden.name) }));
    const inspector = screen.getByRole("complementary", { name: `Inspector: ${hidden.name}` });
    expect(within(inspector).getByRole("group", { name: "Doctrine unknown" })).toBeInTheDocument();
    expect(within(inspector).queryByText("Their doctrine")).not.toBeInTheDocument();
    expect(within(inspector).getByText("Numbers as last seen")).toBeInTheDocument();
  });

  it("keeps the phase log to the player's filtered events", async () => {
    const user = userEvent.setup();
    loadFirstBreach("on", 146);
    render(<App />);
    await toCommand(user);
    act(() => game().sealOrders());
    const [entry] = game().log;
    expect(entry.events.length).toBeGreaterThan(0);
    expect(entry.events.every((event) => event.visibleTo.includes("free_banners"))).toBe(true);
  });
});

describe("retry", () => {
  async function playToOutcome() {
    const user = userEvent.setup();
    render(<App />);
    await toCommand(user);
    act(() => {
      for (let guard = 0; guard < 5 && game().stage !== "outcome"; guard += 1) {
        if (game().stage === "command") game().sealOrders();
        game().finishPlayback();
        game().nextPhase();
      }
    });
    expect(game().stage).toBe("outcome");
    return user;
  }

  it("restarts at deployment with the same seed", async () => {
    loadFirstBreach("on", 146);
    const user = await playToOutcome();
    await user.click(screen.getByRole("button", { name: "Retry, same fortune" }));
    expect(game().stage).toBe("deploy");
    expect(game().setup).toEqual({ fortune: "on", seed: 146 });
    expect(game().log).toEqual([]);
    expect(game().view.phase).toBe(1);
    expect(screen.getByRole("button", { name: "March to positions" })).toBeInTheDocument();
  });

  it("restarts with a new seed", async () => {
    loadFirstBreach("on", 146);
    const user = await playToOutcome();
    await user.click(screen.getByRole("button", { name: "Retry, new fortune" }));
    expect(game().stage).toBe("deploy");
    expect(game().setup.fortune).toBe("on");
    expect(game().setup.seed).not.toBe(146);
  });
});

describe("keyboard and board selection", () => {
  it("moves through the roster with the arrow keys", async () => {
    const user = userEvent.setup();
    render(<App />);
    await toCommand(user);
    const first = screen.getByRole("option", { name: /Greyford Shields/ });
    act(() => first.focus());
    await user.keyboard("{ArrowDown}");
    expect(useAppStore.getState().selectedSquadId).toBe("dawnwatch_archers");
    expect(screen.getByRole("option", { name: /Dawnwatch Archers/ })).toHaveFocus();
    await user.keyboard("{ArrowUp}{Escape}");
    expect(useAppStore.getState().selectedSquadId).toBeNull();
  });

  it("places the selected company when an empty board hex is picked during deployment", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("button", { name: "Take Command" }));
    // The Diorama's picking: select the hex, then the squad on it (none).
    await act(async () => {
      useAppStore.getState().selectSquad("greyford_shields");
      useAppStore.getState().selectHex({ q: 2, r: 3 });
      useAppStore.getState().selectSquad(null);
    });
    expect(game().deployment.greyford_shields).toEqual({ q: 2, r: 3 });
    expect(useAppStore.getState().selectedSquadId).toBe("greyford_shields");
  });

  it("acts on a second pick of the same hex after another company is armed", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("button", { name: "Take Command" }));
    await act(async () => {
      // Pick an empty hex with nothing armed: nothing moves.
      useAppStore.getState().selectHex({ q: 2, r: 3 });
      useAppStore.getState().selectSquad(null);
    });
    expect(game().deployment.greyford_shields).toEqual({ q: 3, r: 2 });
    await act(async () => {
      useAppStore.getState().selectSquad("greyford_shields");
      useAppStore.getState().selectHex({ q: 2, r: 3 });
      useAppStore.getState().selectSquad(null);
    });
    expect(game().deployment.greyford_shields).toEqual({ q: 2, r: 3 });
  });

  it("refuses a hex outside the deployment zone with a reason", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("button", { name: "Take Command" }));
    act(() => void game().placeSquad("greyford_shields", { q: 0, r: 4 }));
    expect(screen.getByRole("status")).toHaveTextContent("Outside your deployment zone");
    expect(game().deployment.greyford_shields).toEqual({ q: 3, r: 2 });
  });
});

describe("phase playback", () => {
  async function sealPhase(user: ReturnType<typeof userEvent.setup>) {
    await toCommand(user);
    act(() => game().sealOrders());
    expect(game().stage).toBe("resolving");
  }

  it("plays the phase on the board, then opens the report on its own", async () => {
    const user = userEvent.setup();
    loadFirstBreach("on", 146);
    render(<App />);
    const before = game().view.squads.map((squad) => [squad.id, squad.strength]);
    act(() => useGame.setState({ playbackSpeed: 200 }));
    await sealPhase(user);

    // The roster follows playback, not the resolved end state.
    expect(game().display?.squads.map((squad) => [squad.id, squad.strength])).toEqual(before);
    expect(screen.getByRole("button", { name: /Skip/ })).toHaveFocus();
    expect(screen.getByRole("img", { name: /The phase begins|Beat \d of 3/ })).toBeInTheDocument();

    await waitFor(() => expect(game().stage).toBe("report"), { timeout: 5000 });
    expect(game().display).toBeNull();
    expect(screen.getByText("Chronicle · Phase 1")).toBeInTheDocument();
  });

  // A guard on Playback.tsx's own timers. (jsdom has no animator, so the settle-race leak
  // itself is reproduced in director.test.ts, "no stray timers".)
  it("leaves no timers running once a phase has played out, or been skipped", async () => {
    vi.useFakeTimers();
    try {
      act(() => useGame.getState().loadBattle(firstBreach, { fortune: "on", seed: 146 }, "command"));
      const view = render(<App />);
      act(() => useGame.setState({ playbackSpeed: 20 }));
      act(() => game().sealOrders());
      for (let guard = 0; game().stage === "resolving" && guard < 2000; guard += 1) {
        await act(() => vi.advanceTimersByTimeAsync(25));
      }
      expect(game().stage).toBe("report");
      await act(() => vi.advanceTimersByTimeAsync(0));
      expect(vi.getTimerCount()).toBe(0);

      // Replay, skip mid-step, and unmount: nothing may keep sleeping.
      act(() => game().replayPhase());
      await act(() => vi.advanceTimersByTimeAsync(300));
      expect(vi.getTimerCount()).toBeGreaterThan(0);
      act(() => screen.getByRole("button", { name: /Skip/ }).click());
      await act(() => vi.advanceTimersByTimeAsync(0));
      expect(game().stage).toBe("report");
      view.unmount();
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it("announces a weather shift as a chyron in the top bar, not a banner over the board", async () => {
    const user = userEvent.setup();
    render(<App />);
    await sealPhase(user);
    act(() => void game().pushCallout({ kind: "weather", hex: null, faction: null, title: "The weather turns", text: "Rain", repeat: false, linger: 2200 }));
    const bar = screen.getByRole("banner");
    const chyron = bar.querySelector(".weather-chip.chyron");
    expect(chyron).toHaveAttribute("role", "status");
    // The new weather's effect, even before the board shows the rain.
    expect(chyron).toHaveTextContent("The weather turns: Rain · Fords end a move; counter-charges hit softer.");
    expect(document.querySelector(".callout-weather")).toBeNull();
    // When it has played, the chip is the plain weather chip again.
    act(() => game().dropCallout(game().callouts.find((callout) => callout.kind === "weather")!.id));
    expect(within(bar).queryByText(/The weather turns/)).not.toBeInTheDocument();
  });

  it("moves the depth-of-field focus to the acting company, never the camera, and clears it after", async () => {
    const user = userEvent.setup();
    loadFirstBreach("on", 146);
    render(<App />);
    const focused: (string | null)[] = [];
    const stop = useAppStore.subscribe((state, before) => {
      if (state.focusSquadId !== before.focusSquadId) focused.push(state.focusSquadId);
    });
    act(() => useGame.setState({ playbackSpeed: 200 }));
    await sealPhase(user);
    await waitFor(() => expect(game().stage).toBe("report"), { timeout: 5000 });
    stop();
    const squads = new Set(game().view.squads.map((squad) => squad.id));
    expect(focused.filter((id) => id !== null).length).toBeGreaterThan(0);
    expect(focused.every((id) => id === null || squads.has(id))).toBe(true);
    expect(useAppStore.getState().focusSquadId).toBeNull();
  });

  it("skips to the final state with Space", async () => {
    const user = userEvent.setup();
    loadFirstBreach("on", 146);
    render(<App />);
    await sealPhase(user);
    await user.keyboard(" ");
    await waitFor(() => expect(game().stage).toBe("report"));
    expect(game().display).toBeNull();
    expect(screen.getByRole("button", { name: "Next Phase" })).toBeInTheDocument();
  });

  it("skips with Escape too, and the pace toggle is live during playback", async () => {
    const user = userEvent.setup();
    render(<App />);
    await sealPhase(user);
    await user.click(screen.getByRole("button", { name: "Fast" }));
    expect(game().pace).toBe("fast");
    await user.keyboard("{Escape}");
    await waitFor(() => expect(game().stage).toBe("report"));
  });

  it("replays the phase from the report without re-running the engine", async () => {
    const user = userEvent.setup();
    loadFirstBreach("on", 146);
    render(<App />);
    await sealPhase(user);
    await user.click(screen.getByRole("button", { name: /Skip/ }));
    const engine = game().engine;
    const log = game().log;
    const runId = game().runId;

    await user.click(screen.getByRole("button", { name: /Replay phase/ }));
    expect(game().stage).toBe("resolving");
    expect(game().runId).toBe(runId + 1);
    expect(game().display).toEqual(log[0].start);
    await user.click(screen.getByRole("button", { name: /Skip/ }));
    await waitFor(() => expect(game().stage).toBe("report"));
    expect(game().engine).toBe(engine);
    expect(game().log).toBe(log);
  });
});

describe("selection after a phase", () => {
  it("moves the selection off a company that routed", async () => {
    const user = userEvent.setup();
    render(<App />);
    await toCommand(user);
    await user.click(screen.getByRole("option", { name: /Dawnwatch Archers/ }));
    act(() => {
      game().sealOrders();
      game().finishPlayback();
    });
    // Rout the selected company in the resolved state, as the engine would.
    const engine = structuredClone(game().engine);
    const archers = engine.squads.find((squad) => squad.id === "dawnwatch_archers")!;
    Object.assign(archers, { status: "routed", hex: null, cohesion: 0 });
    act(() => game().replaceEngine(engine));
    await user.click(screen.getByRole("button", { name: "Next Phase" }));
    expect(useAppStore.getState().selectedSquadId).toBe("greyford_shields");
    expect(screen.getByRole("listbox", { name: "Doctrine for Greyford Shields" })).toBeInTheDocument();
  });
});

describe("inspector hover", () => {
  it("previews a hovered squad and falls back to the pinned selection", async () => {
    const user = userEvent.setup();
    render(<App />);
    await toCommand(user);
    await user.click(screen.getByRole("option", { name: /Greyford Shields/ }));
    expect(screen.getByRole("complementary", { name: "Inspector: Greyford Shields" })).toBeInTheDocument();

    act(() => useAppStore.getState().setHoveredSquad("cinder_vanguard"));
    expect(screen.getByRole("complementary", { name: "Inspector: Cinder Vanguard" })).toBeInTheDocument();
    // The hand still belongs to the pinned company.
    expect(screen.getByRole("listbox", { name: "Doctrine for Greyford Shields" })).toBeInTheDocument();

    act(() => useAppStore.getState().setHoveredSquad(null));
    expect(screen.getByRole("complementary", { name: "Inspector: Greyford Shields" })).toBeInTheDocument();
  });
});

describe("battle setup", () => {
  it("builds the battle from the engine's own initial state", () => {
    expect(game().engine).toEqual(createInitialState(firstBreach, { fortune: "off", seed: 1 }));
    expect(game().stage).toBe("briefing");
  });

  it("starts production at the First Breach briefing, curated seed, fortune on, through the campaign", async () => {
    vi.resetModules();
    const { useGame: fresh } = await import("./app/game/gameStore");
    const state = fresh.getState();
    expect(state.baseScenario.id).toBe(firstBreach.id);
    expect(state.setup).toEqual({ seed: firstBreach.curatedSeed, fortune: "on" });
    expect(state.stage).toBe("briefing");
    expect(state.campaign?.def.id).toBe(ashAndBanner.id);
    expect(state.scenario).toEqual(applyCampaign(ashAndBanner, startCampaign(ashAndBanner), firstBreach));
  });
});
