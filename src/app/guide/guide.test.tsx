// The tutorial (T15, reworked in T32): it runs in the player's first battle by any route, says
// it is a tutorial (a strip with step N of M, Back and Skip), teaches phase 1 and then phase 2's
// muster and relief on the live battle, and ends only when finished or skipped.
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { emberFord, firstBreach } from "../../game/engine";
import { memoryStore } from "../flow/testKit";
import { useFlow } from "../flow/flowStore";
import { useGame } from "../game/gameStore";
import { rosterName } from "../game/view";
import { Root } from "../Root";
import { useAppStore } from "../store";
import { COACH_STEPS, GUIDE_STORAGE_KEY, useGuide } from "./guideStore";
import { tutorialTargets } from "./tutorialTargets";

vi.mock("../../render/showcase/TitleScene", async () => ({ TitleScene: (await import("../flow/testKit")).FakeTitleScene }));
vi.mock("../../render/showcase/CampaignMap", async () => ({ CampaignMap: (await import("../flow/testKit")).FakeCampaignMap }));
vi.mock("../../render/showcase/CampaignSelectBackdrop", async () => ({ CampaignSelectBackdrop: (await import("../flow/testKit")).FakeTitleScene }));
vi.mock("../ui/BattleBoard", () => ({ BattleBoard: () => null }));

const guide = () => useGuide.getState();
const game = () => useGame.getState();
const strip = () => screen.queryByRole("region", { name: "Tutorial" });
const mark = () => screen.queryByRole("region", { name: "Tutorial step" });
const steps = COACH_STEPS.length;
const nameOf = (id: string) => rosterName(game().view.squads.find((squad) => squad.id === id)!);

function battleAt(scenario: typeof firstBreach, stage: "briefing" | "command") {
  act(() => game().loadBattle(scenario, { fortune: "on", seed: scenario.curatedSeed ?? 1 }, stage));
  useFlow.setState({ screen: "battle" });
}

/** Plays phase 1 with the intended plan straight through the store, into phase 2's command window. */
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
  act(() => guide().reset());
  useAppStore.getState().clearSelection();
  useFlow.setState({ screen: "title", campaign: null, save: "none", saved: null, store: memoryStore(), settingsOpen: false, howToOpen: false, skirmish: null });
  useGame.setState({ playbackSpeed: 1, pace: "readable" });
});

describe("the first battle, by any route", () => {
  it("campaign first: Standing orders, then 'Show me as I play', and the tutorial says it is one", async () => {
    const user = userEvent.setup();
    render(<Root />);
    await act(() => useFlow.getState().beginCampaign());
    act(() => useFlow.getState().openBattle("tutorial"));

    const intro = screen.getByRole("dialog", { name: "Standing orders" });
    expect(intro).toHaveTextContent("This battle is your tutorial");
    expect(within(intro).getByRole("button", { name: "Show me as I play" })).toHaveFocus();
    await user.click(within(intro).getByRole("button", { name: "Show me as I play" }));
    expect(localStorage.getItem(GUIDE_STORAGE_KEY)).toContain('"introSeen":true');

    await user.click(screen.getByRole("button", { name: "Take Command" }));
    // Deployment comes before the counted steps, and says what to do.
    expect(strip()).toHaveTextContent("Tutorial · before step 1Your companies start in position: March to positions");
    await user.click(screen.getByRole("button", { name: "March to positions" }));
    expect(strip()).toHaveTextContent(`Tutorial · step 1 of ${steps}`);
    expect(within(strip()!).getByRole("button", { name: "Skip tutorial" })).toBeInTheDocument();
    // First Breach's own lesson: the Stoneford Riders.
    expect(mark()).toHaveTextContent("Pick the Stoneford Riders to see their orders.");
  });

  it("skirmish first: it runs there, isn't used up by leaving, and the campaign's first battle teaches from the top", async () => {
    const user = userEvent.setup();
    render(<Root />);
    act(() => useFlow.getState().playSkirmish("skirmish_ash_and_banner_tutorial"));
    await user.click(within(screen.getByRole("dialog", { name: "Standing orders" })).getByRole("button", { name: "Show me as I play" }));
    await user.click(screen.getByRole("button", { name: "Take Command" }));
    await user.click(screen.getByRole("button", { name: "March to positions" }));
    expect(strip()).toHaveTextContent("step 1 of");
    // Play into phase 2, then walk away from the skirmish.
    toPhaseTwo();
    expect(guide().step).toBe("tiring");
    act(() => useFlow.getState().go("title"));
    expect(guide().coach).toBe("active");

    await act(() => useFlow.getState().beginCampaign());
    act(() => useFlow.getState().openBattle("tutorial"));
    expect(screen.queryByRole("dialog", { name: "Standing orders" })).not.toBeInTheDocument(); // seen already
    await user.click(screen.getByRole("button", { name: "Take Command" }));
    await user.click(screen.getByRole("button", { name: "March to positions" }));
    expect(strip()).toHaveTextContent(`Tutorial · step 1 of ${steps}`);
  });

  it("another first battle gets the general steps, not First Breach's lesson", () => {
    battleAt(emberFord, "command");
    act(() => guide().seeIntro());
    render(<Root />);
    expect(mark()).toHaveTextContent("Each banner is one of your companies. Pick one to see its orders.");
    expect(mark()).not.toHaveTextContent(/Stoneford Riders/);
  });

  it("'I know how to play' skips it for good; Settings shows it again from the start", async () => {
    const user = userEvent.setup();
    battleAt(firstBreach, "briefing");
    render(<Root />);
    await user.click(screen.getByRole("button", { name: "I know how to play" }));
    expect(guide()).toMatchObject({ introSeen: true, coach: "done" });
    await user.click(screen.getByRole("button", { name: "Take Command" }));
    expect(strip()).not.toBeInTheDocument();

    act(() => useFlow.getState().setSettingsOpen(true));
    await user.click(within(screen.getByRole("dialog", { name: "Settings" })).getByRole("button", { name: "Show the tutorial again" }));
    expect(guide()).toMatchObject({ introSeen: false, coach: "active", step: "select", musterTipSeen: false });
    act(() => useFlow.getState().setSettingsOpen(false));
    battleAt(firstBreach, "briefing");
    expect(screen.getByRole("dialog", { name: "Standing orders" })).toBeInTheDocument();
  });
});

describe("phase 1", () => {
  beforeEach(() => act(() => guide().seeIntro()));

  it("walks through select → read → assign → seal → watch → chronicle, then on to phase 2", async () => {
    const user = userEvent.setup();
    battleAt(firstBreach, "command");
    render(<Root />);

    expect(within(mark()!).getByRole("heading", { name: "Choose a company" })).toBeInTheDocument();
    expect(screen.getByText(/Tutorial: Choose a company\./)).toBeInTheDocument();
    // Another company first: the lesson sends the player to the Riders.
    await user.click(screen.getByRole("option", { name: /Greyford Shields/ }));
    expect(guide().step).toBe("read");
    expect(strip()).toHaveTextContent(`step 2 of ${steps}`);
    await user.click(within(mark()!).getByRole("button", { name: "Next" }));
    expect(mark()).toHaveTextContent(
      "Select the Stoneford Riders, then click the Clean Counterstroke card in their hand: it makes them charge any enemy that comes on alone, as the Ford Reavers are about to.",
    );
    await user.click(screen.getByRole("option", { name: /Stoneford Riders/ }));
    await user.click(document.querySelector('.hand [role="option"][data-doctrine="clean_counterstroke"]') as HTMLElement);
    expect(game().orders).toEqual({ stoneford_riders: "clean_counterstroke" });
    expect(within(mark()!).getByRole("heading", { name: "Seal your orders" })).toBeInTheDocument();

    act(() => useGame.setState({ playbackSpeed: 100 }));
    await user.click(screen.getByRole("button", { name: "Seal Orders" }));
    await user.click(screen.getByRole("button", { name: "Seal anyway" }));
    expect(guide().step).toBe("watch");
    // Playback stops on the first of your rule banners until you carry on.
    await waitFor(() => expect(guide().watchCallout).not.toBeNull(), { timeout: 5000 });
    const carryOn = within(mark()!).getByRole("button", { name: "Carry on" });
    expect(carryOn).toHaveFocus();
    await user.click(carryOn);
    await waitFor(() => expect(game().stage).toBe("report"), { timeout: 5000 });
    const report = screen.getByRole("dialog", { name: /./ });
    const inline = within(report).getByRole("region", { name: "Tutorial step" });
    expect(within(inline).getByRole("heading", { name: "Read the chronicle" })).toBeInTheDocument();
    // One button: the tutorial's Next is the report's next phase.
    await user.click(within(inline).getByRole("button", { name: "Next phase" }));
    expect(game()).toMatchObject({ stage: "command" });
    expect(guide()).toMatchObject({ coach: "active", step: "tiring" });
  });

  it("Back returns to the step before within the same moment, never across one", async () => {
    const user = userEvent.setup();
    battleAt(firstBreach, "command");
    render(<Root />);
    expect(within(strip()!).getByRole("button", { name: "Back" })).toBeDisabled();
    await user.click(screen.getByRole("option", { name: /Greyford Shields/ }));
    expect(guide().step).toBe("read");
    await user.click(within(strip()!).getByRole("button", { name: "Back" }));
    expect(guide().step).toBe("select");
    expect(useAppStore.getState().selectedSquadId).toBeNull();
    act(() => useGuide.setState({ step: "watch" }));
    expect(within(strip()!).getByRole("button", { name: "Back" })).toBeDisabled();
  });

  it("catches up when the player runs ahead", async () => {
    const user = userEvent.setup();
    battleAt(firstBreach, "command");
    render(<Root />);
    act(() => void game().assignDoctrine("greyford_shields", "fighting_withdrawal"));
    expect(guide().step).toBe("seal");
    await user.click(screen.getByRole("button", { name: "Seal Orders" }));
    await user.click(screen.getByRole("button", { name: "Seal anyway" }));
    expect(guide().step).toBe("watch");
    await user.click(screen.getByRole("button", { name: /Skip\s*Space/ }));
    await waitFor(() => expect(game().stage).toBe("report"));
    expect(guide().step).toBe("chronicle");
  });

  it("skips with Escape or the strip's Skip, for good", async () => {
    const user = userEvent.setup();
    battleAt(firstBreach, "command");
    render(<Root />);
    await user.keyboard("{Escape}");
    expect(guide().coach).toBe("done");
    expect(strip()).not.toBeInTheDocument();
    act(() => guide().reset());
    act(() => guide().seeIntro());
    await user.click(within(strip()!).getByRole("button", { name: "Skip tutorial" }));
    expect(localStorage.getItem(GUIDE_STORAGE_KEY)).toContain('"coach":"done"');
  });

  it("never pauses playback in capture mode (the tutorial is hidden there)", async () => {
    const { useCaptureStore } = await import("../captureStore");
    useCaptureStore.setState({ captureMode: true });
    act(() => useGuide.setState({ step: "watch" }));
    battleAt(firstBreach, "command");
    render(<Root />);
    act(() => {
      useGame.setState({ playbackSpeed: 200 });
      game().sealOrders();
    });
    await waitFor(() => expect(game().stage).toBe("report"), { timeout: 5000 });
    expect(guide().watchCallout).toBeNull();
    useCaptureStore.setState({ captureMode: false });
  });
});

describe("phase 2: muster and relief, on the live battle", () => {
  beforeEach(() => act(() => guide().seeIntro()));

  it("shows the line tiring, guides one muster and one relief, then the relief in the chronicle, and finishes", async () => {
    const user = userEvent.setup();
    battleAt(firstBreach, "command");
    render(<Root />);
    toPhaseTwo();
    expect(game().log).toHaveLength(1);
    expect(guide().step).toBe("tiring");
    expect(strip()).toHaveTextContent(`step 7 of ${steps}`);
    const targets = tutorialTargets(game().engine, game().scenario, game().muster);
    expect(targets.tired && targets.mover && targets.relief).toBeTruthy();
    const tired = targets.tired!;
    expect(mark()).toHaveTextContent(`${nameOf(tired.squadId)}: cohesion down from ${tired.from} to ${tired.cohesion}.`);
    // A company that broke in phase 1 is named, with why.
    for (const id of targets.routed) expect(mark()).toHaveTextContent(`${nameOf(id)} broke and ran`);
    for (const id of targets.destroyed) expect(mark()).toHaveTextContent(`${nameOf(id)} was destroyed: its strength reached 0`);
    await user.click(within(mark()!).getByRole("button", { name: "Next" }));

    // Muster: select the free company, then move it.
    const mover = targets.mover!;
    expect(mark()).toHaveTextContent(`Select ${nameOf(mover.squadId)}.`);
    await user.click(screen.getByRole("option", { name: new RegExp(nameOf(mover.squadId)) }));
    expect(mark()).toHaveTextContent(`Where ${nameOf(mover.squadId)} can go glows on the board`);
    const hex = await import("../game/muster").then(({ musterTargets }) => musterTargets(game().engine, game().scenario, game().muster, mover.squadId).hexes[0]);
    act(() => void game().planMuster({ squadId: mover.squadId, to: hex }));
    expect(guide().step).toBe("relieve");

    // Relief: select the reliever, then relieve.
    const relief = tutorialTargets(game().engine, game().scenario, game().muster).relief!;
    expect(mark()).toHaveTextContent(`${nameOf(relief.tired)} is in contact. ${nameOf(relief.reliever)}, beside it and out of contact, can relieve it`);
    // One story: the tired company shown earlier isn't the one doing the relieving.
    expect(tired.squadId).not.toBe(relief.reliever);
    await user.click(screen.getByRole("option", { name: new RegExp(nameOf(relief.reliever)) }));
    expect(mark()).toHaveTextContent(`Choose Relieve ${nameOf(relief.tired)} here`);
    await user.click(screen.getByRole("button", { name: `Relieve ${nameOf(relief.tired)}` }));
    expect(guide().step).toBe("sealAgain");
    expect(within(mark()!).getByRole("heading", { name: "Seal again" })).toBeInTheDocument();

    // Seal; the chronicle quotes the relief, and the last step finishes the tutorial.
    act(() => {
      game().sealOrders();
      game().finishPlayback();
    });
    expect(guide().step).toBe("relief");
    const inline = within(screen.getByRole("dialog", { name: /./ })).getByRole("region", { name: "Tutorial step" });
    expect(inline).toHaveTextContent(`"${nameOf(relief.reliever)} relieved ${nameOf(relief.tired)} in the line"`);
    expect(inline).toHaveTextContent("Press F1 any time for the Field Manual.");
    await user.click(within(inline).getByRole("button", { name: "Finish the tutorial" }));
    expect(guide()).toMatchObject({ coach: "done", musterTipSeen: true });
    expect(game().log).toHaveLength(2);
    expect(game().stage).not.toBe("report"); // and on to phase 3
    expect(strip()).not.toBeInTheDocument();
  });

  it("is done once the battle moves past phase 2 even without the last click", () => {
    battleAt(firstBreach, "command");
    render(<Root />);
    toPhaseTwo();
    act(() => {
      game().sealOrders();
      game().finishPlayback();
    });
    expect(guide().step).toBe("relief");
    act(() => game().nextPhase());
    expect(guide().coach).toBe("done");
  });

  it("a new battle after leaving part way starts from the top", () => {
    battleAt(firstBreach, "command");
    render(<Root />);
    toPhaseTwo();
    expect(guide().step).toBe("tiring");
    battleAt(firstBreach, "command");
    expect(guide().step).toBe("select");
  });
});

describe("the muster line (T21), outside the tutorial", () => {
  beforeEach(() => act(() => useGuide.setState({ introSeen: true, coach: "done" })));

  it("appears once, in First Breach's second command window, and stays dismissed", async () => {
    const user = userEvent.setup();
    battleAt(firstBreach, "command");
    render(<Root />);
    expect(screen.queryByText("Muster & relief")).not.toBeInTheDocument();
    act(() => {
      useGame.setState({ playbackSpeed: 400 });
      game().sealOrders();
      game().finishPlayback();
      game().nextPhase();
    });
    const tip = screen.getByRole("region", { name: "Tip" });
    expect(tip).toHaveTextContent("Between phases, free companies can muster 1 hex (cavalry 2), or a fresh company can relieve one that's worn out.");
    await user.click(within(tip).getByRole("button", { name: "Got it" }));
    expect(localStorage.getItem(GUIDE_STORAGE_KEY)).toContain('"musterTipSeen":true');
  });

  it("never shows during the tutorial, which teaches muster itself", () => {
    act(() => useGuide.setState({ coach: "active" }));
    battleAt(firstBreach, "command");
    render(<Root />);
    toPhaseTwo();
    expect(screen.queryByRole("region", { name: "Tip" })).not.toBeInTheDocument();
  });

  it("has a panel in How to play", () => {
    useFlow.setState({ howToOpen: true });
    render(<Root />);
    expect(screen.getByRole("region", { name: "Muster & relief" })).toHaveTextContent(/relieve/);
  });
});

describe("signposts", () => {
  it("the title points newcomers at the campaign until the tutorial is done", () => {
    render(<Root />);
    expect(screen.getByRole("button", { name: "Begin the Campaign" })).toHaveAccessibleDescription("New here? Begin the Campaign. Its first battle teaches as you go.");
    act(() => guide().skip());
    expect(screen.queryByText(/New here\?/)).not.toBeInTheDocument();
  });

  it("Skirmish says where the tutorial runs", () => {
    useFlow.setState({ screen: "skirmish" });
    render(<Root />);
    expect(screen.getByText(/The tutorial runs in your first battle, whichever you choose/)).toBeInTheDocument();
  });

  it("How to play opens from the title's Help and from Settings", async () => {
    const user = userEvent.setup();
    act(() => useGuide.setState({ introSeen: true, coach: "done" }));
    render(<Root />);
    await user.click(screen.getByRole("button", { name: "Help" }));
    expect(screen.getByRole("dialog", { name: "How to play" })).toBeInTheDocument();
    await user.click(within(screen.getByRole("dialog", { name: "How to play" })).getByRole("button", { name: "Back" }));
    await user.click(screen.getByRole("button", { name: "Settings" }));
    await user.click(within(screen.getByRole("dialog", { name: "Settings" })).getByRole("button", { name: "Field Manual" }));
    expect(screen.getByRole("dialog", { name: "How to play" })).toBeInTheDocument();
  });
});
