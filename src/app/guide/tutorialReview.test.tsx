// PR #4 review (T32): four ways the tutorial could dead-end or teach the wrong thing. Each
// test reproduces one finding.
import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import App from "../../App";
import { firstBreach } from "../../game/engine";
import { useGame } from "../game/gameStore";
import { useAppStore } from "../store";
import { PHASE2_COPY } from "./coach";
import { useGuide } from "./guideStore";
import { tutorialTargets } from "./tutorialTargets";

vi.mock("../ui/BattleBoard", () => ({ BattleBoard: () => null }));

const game = () => useGame.getState();
const guide = () => useGuide.getState();
const strip = () => screen.getByRole("region", { name: "Tutorial" });

function battleAt(stage: "deploy" | "command") {
  act(() => game().loadBattle(firstBreach, { fortune: "on", seed: firstBreach.curatedSeed! }, stage));
}

/** Phase 1 with the intended plan, into phase 2's command window. */
function toPhaseTwo() {
  act(() => {
    useGame.setState({ playbackSpeed: 400 });
    for (const [id, doctrine] of Object.entries(game().scenario.referencePlans!.intended)) game().assignDoctrine(id, doctrine);
    game().sealOrders();
    game().finishPlayback();
  });
  act(() => game().nextPhase());
}

beforeEach(() => {
  act(() => {
    guide().reset();
    guide().seeIntro();
    useAppStore.getState().clearSelection();
  });
  useGame.setState({ playbackSpeed: 1 });
});

describe("1. Back never strands an action step", () => {
  it("Back from Seal to Give new orders: giving the order again returns to Seal", async () => {
    const user = userEvent.setup();
    battleAt("command");
    render(<App />);
    act(() => void game().assignDoctrine("stoneford_riders", "clean_counterstroke"));
    expect(guide().step).toBe("seal");
    await user.click(within(strip()).getByRole("button", { name: "Back" }));
    expect(guide().step).toBe("assign");
    // The company already has this order: the same card again is still the action.
    act(() => void game().assignDoctrine("stoneford_riders", "clean_counterstroke"));
    expect(guide().step).toBe("seal");
  });

  it("Back from Seal again to Relief: relieving again returns to Seal again", async () => {
    const user = userEvent.setup();
    battleAt("command");
    render(<App />);
    toPhaseTwo();
    const relief = tutorialTargets(game().engine, game().scenario, game().muster).relief!;
    act(() => void game().planMuster({ squadId: relief.reliever, relieve: relief.tired }));
    expect(guide().step).toBe("sealAgain");
    await user.click(within(strip()).getByRole("button", { name: "Back" }));
    expect(guide().step).toBe("relieve");
    act(() => void game().planMuster({ squadId: relief.reliever, relieve: relief.tired }));
    expect(guide().step).toBe("sealAgain");
  });
});

describe("2. A company selected before command begins", () => {
  it("one picked during deployment moves Choose a company on when the command window opens", () => {
    battleAt("deploy");
    render(<App />);
    act(() => useAppStore.getState().selectSquad("stoneford_riders"));
    expect(guide().step).toBe("select");
    act(() => game().confirmDeployment());
    expect(game().stage).toBe("command");
    expect(guide().step).toBe("read");
  });
});

describe("3. The report's own Next Phase", () => {
  it("moves the tutorial on as well as the battle", async () => {
    const user = userEvent.setup();
    battleAt("command");
    render(<App />);
    act(() => {
      useGame.setState({ playbackSpeed: 400 });
      game().sealOrders();
      game().finishPlayback();
    });
    expect(guide().step).toBe("chronicle");
    await user.click(screen.getByRole("button", { name: "Next Phase" }));
    expect(game().stage).toBe("command");
    expect(guide().step).toBe("tiring");
  });

  it("finishing the battle during the tutorial completes it (it does not restart next battle)", () => {
    battleAt("command");
    render(<App />);
    expect(guide().coach).toBe("active");
    act(() => useGame.setState({ stage: "outcome" }));
    expect(guide()).toMatchObject({ coach: "done", musterTipSeen: true });
  });
});

describe("4. Destroyed is not routed", () => {
  it("names a routed company's cohesion and a destroyed company's strength", () => {
    battleAt("command");
    const [routed, destroyed] = game().engine.squads.filter((squad) => squad.faction === firstBreach.playerFaction);
    const engine = {
      ...game().engine,
      squads: game().engine.squads.map((squad) =>
        squad.id === routed.id ? { ...squad, status: "routed" as const } : squad.id === destroyed.id ? { ...squad, status: "destroyed" as const, strength: 0 } : squad,
      ),
    };
    const targets = tutorialTargets(engine, firstBreach, []);
    expect(targets.routed).toEqual([routed.id]);
    expect(targets.destroyed).toEqual([destroyed.id]);
    const copy = PHASE2_COPY.tiring("Mercy Standard", 60, 82, ["Dawnwatch Archers"], ["Greyford Shields"]).body;
    expect(copy).toMatch(/^Dawnwatch Archers broke and ran: its cohesion reached 0\. Greyford Shields was destroyed: its strength reached 0\./);
    expect(PHASE2_COPY.broke([], ["Greyford Shields"]).body).toMatch(/^Greyford Shields was destroyed: its strength reached 0\./);
    expect(PHASE2_COPY.broke([], ["Greyford Shields"]).body).not.toMatch(/cohesion reached 0/);
  });
});
