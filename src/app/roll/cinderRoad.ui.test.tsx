// M1 (P5 + P6), end to end on the shipped content: the real Cinder Road from "Choose a
// campaign" through Call the Banners to battle 1's outcome, saved in its own file (the
// engine's browser store over in-memory storage) while the intro's save stays untouched.
// Also: set-aside limits, and Support → Export by campaign. WebGL scenes are stood in for.
import { act, cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ashAndBanner,
  cinderRoad,
  localStorageCampaignStore,
  localStorageKeyFor,
  saveCampaign,
  serializeCampaignSave,
  startCampaign,
} from "../../game/campaign";
import { MAX_ASIDES, TOO_MANY_ASIDES } from "../../game/campaign/saveFiles";
import { registry } from "../../game/packs";
import { campaignAfter } from "../flow/devCampaign";
import { useFlow } from "../flow/flowStore";
import { memoryStore } from "../flow/testKit";
import { useGame } from "../game/gameStore";
import { Root } from "../Root";
import { exportFileName } from "../support";
import { engineRuns, installRollApi } from "./api";
import { memoryStorage } from "./memoryStorage";

vi.mock("../../render/showcase/TitleScene", async () => ({ TitleScene: (await import("../flow/testKit")).FakeTitleScene }));
vi.mock("../../render/showcase/CampaignMap", async () => ({ CampaignMap: (await import("../flow/testKit")).FakeCampaignMap }));
vi.mock("../../render/showcase/CampaignSelectBackdrop", async () => ({ CampaignSelectBackdrop: (await import("../flow/testKit")).FakeTitleScene }));
vi.mock("../ui/BattleBoard", () => ({ BattleBoard: () => null }));

const KEY = localStorageKeyFor(cinderRoad.id);
const scenario = registry.scenario(cinderRoad.battles[0].scenarioId)!;
let storage = memoryStorage();
let restore: () => void = () => {};

function launch({ intro = null as string | null, run = null as string | null, screen: at = "campaigns" as "title" | "campaigns" } = {}) {
  cleanup();
  storage = memoryStorage();
  if (run) storage.setItem(KEY, run);
  restore();
  // The shipped registry: the real Cinder Road. Only the storage under the engine's store is in memory.
  restore = installRollApi({ registry, runs: engineRuns(localStorageCampaignStore(storage), registry) });
  const store = memoryStore(intro);
  useFlow.setState({
    screen: at,
    definition: ashAndBanner,
    campaign: null,
    save: "checking",
    saved: null,
    store,
    runReads: {},
    backupReads: {},
    carryOver: null,
    skirmish: null,
    notice: null,
    saveError: null,
    settingsOpen: false,
  });
  render(<Root />);
  return store;
}

/** Plays the open battle to its end with the scenario's reference plan. */
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

const card = async (title: RegExp) => (await screen.findByRole("heading", { level: 3, name: title })).closest("li")!;

beforeEach(() => useGame.setState({ playbackSpeed: 1 }));
afterEach(() => {
  restore();
  restore = () => {};
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("Cinder Road, end to end", () => {
  it("plays battle 1 through Call the Banners into its own save, leaving the intro's save untouched", async () => {
    const user = userEvent.setup();
    // An intro campaign in progress, saved in its own (v1) file.
    const intro = saveCampaign(campaignAfter(ashAndBanner, 1, { fortune: "on" }));
    const introStore = launch({ intro });

    const cinder = await card(/^Cinder Road$/);
    expect(cinder).toHaveTextContent("Call the Banners: choose your companies for each battle · 1 battle");
    expect(cinder).toHaveTextContent("Not started");
    await user.click(within(cinder).getByRole("button", { name: "Begin: Cinder Road" }));
    await waitFor(() => expect(useFlow.getState().screen).toBe("campaign"));
    expect(storage.getItem(KEY)).not.toBeNull(); // begun and saved at once, in its own key

    await user.click(screen.getByRole("button", { name: /Take the field: The Saltmarsh, Northbound/ }));
    expect(useFlow.getState().screen).toBe("roll");
    // The authored posts, by where they stand, in the order they act; two flex.
    const posts = screen.getAllByRole("button", { name: /^Post \d/ }).map((post) => post.getAttribute("aria-label")!);
    const labels = cinderRoad.battles[0].call!.labels!;
    expect(posts).toHaveLength(Object.keys(labels).length);
    for (const label of Object.values(labels)) expect(posts.some((post) => post.includes(`: ${label},`))).toBe(true);
    expect(posts.filter((post) => /flex:/.test(post))).toHaveLength(2);
    expect(screen.getByRole("figure", { name: "Where the posts stand" }).querySelectorAll(".post-marker")).toHaveLength(posts.length);
    // The recommended force is the authored call.
    for (const [slotId, companyId] of Object.entries(cinderRoad.battles[0].slots)) {
      const name = cinderRoad.companies.find((company) => company.id === companyId)!.name;
      expect(screen.getByRole("button", { name: `Company for ${labels[slotId]}: ${name}` })).toBeInTheDocument();
    }

    await user.click(screen.getByRole("button", { name: "Take the field" }));
    expect(useFlow.getState().screen).toBe("battle");
    expect(useGame.getState()).toMatchObject({ stage: "briefing", baseScenario: { id: scenario.id } });
    expect(useGame.getState().campaign?.assignment).toEqual(cinderRoad.battles[0].slots);
    fightOpenBattle("intended");

    expect(useGame.getState().stage).toBe("outcome");
    expect(await screen.findByText(/campaign saved/)).toBeInTheDocument();
    const saved = JSON.parse(storage.getItem(KEY)!);
    expect(saved.provenance).toMatchObject({ packId: "first_call", campaignId: cinderRoad.id });
    const read = await engineRuns(localStorageCampaignStore(storage), registry).load(cinderRoad.id);
    if (read.kind !== "ok") throw new Error(`run not readable: ${read.kind}`);
    expect(read.state.history).toHaveLength(1);
    expect(read.state.history[0]).toMatchObject({ battleId: cinderRoad.battles[0].id, assignment: cinderRoad.battles[0].slots });
    // The intro's save: byte for byte as it was.
    expect(introStore.data).toBe(intro);

    // Battle 1 completes the campaign as it stands: Cinder Road's own ending, which never
    // offers to begin (and so overwrite) the intro.
    await user.click(screen.getByRole("button", { name: "Read the epilogue" }));
    expect(useFlow.getState().screen).toBe("ending");
    expect(screen.getByText(/Cinder Road is won: 1 battle fought/)).toBeInTheDocument();
    expect(screen.queryByText(/last wall/)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Begin a new campaign" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Choose a campaign" }));
    expect(useFlow.getState().screen).toBe("campaigns");
    expect(await card(/^Cinder Road$/)).toHaveTextContent("Completed · 1 battle fought");
    expect(introStore.data).toBe(intro);
  });

  it("brings veterans from the completed intro onto Cinder Road's Roll", async () => {
    const user = userEvent.setup();
    const done = campaignAfter(ashAndBanner, ashAndBanner.battles.length, { fortune: "on" });
    launch({ intro: saveCampaign(done) });
    await user.click(await screen.findByRole("button", { name: "Begin: Cinder Road" }));
    const picker = await screen.findByRole("dialog", { name: "Bring veterans to Cinder Road?" });
    const boxes = within(picker).getAllByRole("checkbox");
    await user.click(boxes[0]);
    await user.click(boxes[1]);
    await user.click(within(picker).getByRole("button", { name: "Begin with these companies" }));
    await waitFor(() => expect(useFlow.getState().screen).toBe("campaign"));
    const carried = useFlow.getState().campaign!.carried!;
    expect(carried).toHaveLength(2);
    await user.click(screen.getByRole("button", { name: /Take the field: The Saltmarsh, Northbound/ }));
    const roll = screen.getByRole("region", { name: "The Roll" });
    for (const veteran of carried) expect(within(roll).getByRole("button", { name: new RegExp(`^${veteran.name}`) })).toBeInTheDocument();
  });
});

describe("set-aside runs", () => {
  it("says plainly when a campaign already keeps the most set-aside runs, and keeps everything", async () => {
    const user = userEvent.setup();
    launch({ run: "{ not a save" });
    for (let slot = 1; slot <= MAX_ASIDES; slot += 1) storage.setItem(`${KEY}:aside:${slot}`, `kept ${slot}`);
    const cinder = await card(/^Cinder Road$/);
    await user.click(await within(cinder).findByRole("button", { name: /Set aside and start again/ }));
    await user.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Set aside and start again" }));
    // The engine's own sentence, not wrapped in "could not be set aside (…)".
    expect((await screen.findByRole("alert")).textContent).toBe(TOO_MANY_ASIDES);
    expect(useFlow.getState().screen).toBe("campaigns");
    expect(storage.getItem(KEY)).toBe("{ not a save");
    expect(storage.getItem(`${KEY}:aside:${MAX_ASIDES}`)).toBe(`kept ${MAX_ASIDES}`);
  });
});

describe("Support → Export by campaign", () => {
  const openSettings = () => act(() => useFlow.setState({ settingsOpen: true }));

  it("downloads the chosen campaign's own save on the web", async () => {
    const user = userEvent.setup();
    const run = serializeCampaignSave(registry, startCampaign(cinderRoad));
    launch({ run, screen: "title" });
    openSettings();
    const created: Blob[] = [];
    vi.stubGlobal("URL", { ...URL, createObjectURL: (blob: Blob) => (created.push(blob), "blob:save"), revokeObjectURL: vi.fn() });
    const clicked: HTMLAnchorElement[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
      clicked.push(this);
    });
    await user.selectOptions(screen.getByRole("combobox", { name: "Campaign to export" }), cinderRoad.id);
    await user.click(screen.getByRole("button", { name: "Export save file…" }));
    expect(await screen.findByText("Save file exported.")).toBeInTheDocument();
    expect(clicked[0]).toMatchObject({ download: exportFileName(cinderRoad.id) });
    const text = await new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.readAsText(created[0]);
    });
    expect(text).toBe(run);
  });

  it("refuses to export a damaged run, and says there is none when there is none", async () => {
    const user = userEvent.setup();
    launch({ run: "{ not a save", screen: "title" });
    openSettings();
    await user.selectOptions(screen.getByRole("combobox", { name: "Campaign to export" }), cinderRoad.id);
    await user.click(screen.getByRole("button", { name: "Export save file…" }));
    expect(await screen.findByText("The save file could not be exported (save file is not readable).")).toBeInTheDocument();
    storage.removeItem(KEY);
    await user.click(screen.getByRole("button", { name: "Export save file…" }));
    expect(await screen.findByText("There is no saved campaign yet.")).toBeInTheDocument();
  });

  it("asks Electron's main for the chosen campaign by id (the intro's call still carries none)", async () => {
    const user = userEvent.setup();
    const exporter = vi.fn(async (..._args: unknown[]) => ({ exported: true }));
    vi.stubGlobal("doctrineOfWar", { platform: "darwin", saves: { read: async () => null, write: async () => {}, export: exporter } });
    launch({ screen: "title" });
    openSettings();
    const picker = screen.getByRole("combobox", { name: "Campaign to export" });
    expect(picker).toHaveValue(ashAndBanner.id); // the campaign being played
    await user.click(screen.getByRole("button", { name: "Export save file…" }));
    expect(exporter).toHaveBeenLastCalledWith();
    await user.selectOptions(picker, cinderRoad.id);
    await user.click(screen.getByRole("button", { name: "Export save file…" }));
    expect(exporter).toHaveBeenLastCalledWith(cinderRoad.id);
  });
});
