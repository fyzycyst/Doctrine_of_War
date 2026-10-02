// M1 (P6): choosing a campaign, carry-over, Call the Banners and a Roll battle end to end,
// on the engine's real Roll and per-campaign saves (over in-memory storage) with the
// preview pack. WebGL scenes are stood in for.
import { act, cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ashAndBanner,
  localStorageCampaignStore,
  localStorageKeyFor,
  saveCampaign,
  serializeCampaignSave,
  startCampaign,
  LEVY_ID,
} from "../../game/campaign";
import { createRegistry } from "../../game/packs";
import { campaignAfter } from "../flow/devCampaign";
import { useFlow } from "../flow/flowStore";
import { memoryStore } from "../flow/testKit";
import { useGame } from "../game/gameStore";
import { Root } from "../Root";
import { Outcome } from "../ui/Outcome";
import { engineRuns, installRollApi, runs } from "./api";
import { wornBattle, wornRun } from "./devBoot";
import { cinderRoadPreview, previewPacks, PREVIEW_CAMPAIGN_ID } from "./fixtures";
import { memoryStorage } from "./memoryStorage";

vi.mock("../../render/showcase/TitleScene", async () => ({ TitleScene: (await import("../flow/testKit")).FakeTitleScene }));
vi.mock("../../render/showcase/CampaignMap", async () => ({ CampaignMap: (await import("../flow/testKit")).FakeCampaignMap }));
vi.mock("../../render/showcase/CampaignSelectBackdrop", async () => ({ CampaignSelectBackdrop: (await import("../flow/testKit")).FakeTitleScene }));
vi.mock("../ui/BattleBoard", () => ({ BattleBoard: () => null }));

const registry = createRegistry(previewPacks);
const KEY = localStorageKeyFor(PREVIEW_CAMPAIGN_ID);
let storage = memoryStorage();
let restore: () => void = () => {};

function launch({ intro = null as string | null, run = null as string | null, backup = null as string | null } = {}) {
  cleanup();
  storage = memoryStorage();
  if (run) storage.setItem(KEY, run);
  if (backup) storage.setItem(`${KEY}:backup`, backup);
  restore();
  restore = installRollApi({ registry, runs: engineRuns(localStorageCampaignStore(storage), registry) });
  useFlow.setState({
    screen: "campaigns",
    definition: ashAndBanner,
    campaign: null,
    save: "checking",
    saved: null,
    store: memoryStore(intro),
    runReads: {},
    backupReads: {},
    carryOver: null,
    notice: null,
    saveError: null,
  });
  render(<Root />);
}

beforeEach(() => useGame.setState({ playbackSpeed: 1 }));
afterEach(() => {
  restore();
  restore = () => {};
});

/** A run set aside is kept under some aside key (unique per set-aside), never deleted. */
const keptAside = (payload: string) => Object.entries(storage.data).some(([key, value]) => key.startsWith(`${KEY}:aside`) && value === payload);

const card = async (title: RegExp) => (await screen.findByRole("heading", { level: 3, name: title })).closest("li")!;

describe("choose a campaign", () => {
  it("lists every campaign with its status, and the intro still begins as before", async () => {
    const user = userEvent.setup();
    launch();
    expect(await card(/Ash & Banner/)).toHaveTextContent("Not started");
    expect(await card(/Cinder Road/)).toHaveTextContent("Call the Banners: choose your companies for each battle · 6 battles");
    await user.click(screen.getByRole("button", { name: "Begin: Ash & Banner" }));
    expect(useFlow.getState()).toMatchObject({ screen: "campaign", definition: ashAndBanner });
    expect(useFlow.getState().store).toBeDefined();
  });

  it("starts a Roll campaign in its own save, leaving the intro's untouched", async () => {
    const user = userEvent.setup();
    launch();
    await user.click(await screen.findByRole("button", { name: "Begin: Cinder Road (preview)" }));
    await waitFor(() => expect(useFlow.getState().screen).toBe("campaign"));
    expect(useFlow.getState().definition.id).toBe(PREVIEW_CAMPAIGN_ID);
    expect((await runs().load(PREVIEW_CAMPAIGN_ID)).kind).toBe("ok");
    expect((useFlow.getState().store as ReturnType<typeof memoryStore>).data).toBeNull();
  });

  it("shows a run this build cannot continue honestly, keeps it, and restores the backup on request", async () => {
    const user = userEvent.setup();
    const good = serializeCampaignSave(registry, startCampaign(cinderRoadPreview));
    const stale = JSON.stringify({ ...JSON.parse(good), provenance: { ...JSON.parse(good).provenance, contentRevision: 2 } });
    launch({ run: stale, backup: good });
    const cinder = await card(/Cinder Road/);
    await waitFor(() => expect(cinder).toHaveTextContent("different edition"));
    expect(cinder).toHaveTextContent("Your run is kept as it is.");
    expect(within(cinder).queryByRole("button", { name: /^Begin/ })).not.toBeInTheDocument();
    // Saving over it is refused by the store; nothing on this screen tries.
    expect(storage.getItem(KEY)).toBe(stale);
    await user.click(within(cinder).getByRole("button", { name: /Restore from backup/ }));
    await waitFor(() => expect(useFlow.getState().screen).toBe("campaign"));
    expect(keptAside(stale)).toBe(true); // set aside, never deleted
    expect((await runs().load(PREVIEW_CAMPAIGN_ID)).kind).toBe("ok");
  });

  it("sets a preserved run aside only after asking, and starts again", async () => {
    const user = userEvent.setup();
    launch({ run: "{ not a save" });
    const cinder = await card(/Cinder Road/);
    await waitFor(() => expect(within(cinder).getByRole("button", { name: /Set aside and start again/ })).toBeInTheDocument());
    await user.click(within(cinder).getByRole("button", { name: /Set aside and start again/ }));
    const ask = screen.getByRole("alertdialog", { name: "Set this run aside?" });
    expect(ask).toHaveTextContent("Nothing is deleted.");
    await user.click(within(ask).getByRole("button", { name: "Keep it where it is" }));
    expect(storage.getItem(KEY)).toBe("{ not a save");
    await user.click(within(cinder).getByRole("button", { name: /Set aside and start again/ }));
    await user.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Set aside and start again" }));
    await waitFor(() => expect(useFlow.getState().screen).toBe("campaign"));
    expect(keptAside("{ not a save")).toBe(true);
  });
});

describe("carry-over", () => {
  it("offers up to five companies from the completed intro, shows the clamp, and snapshots the pick", async () => {
    const user = userEvent.setup();
    const done = campaignAfter(ashAndBanner, ashAndBanner.battles.length, { fortune: "on" });
    launch({ intro: saveCampaign(done) });
    await user.click(await screen.findByRole("button", { name: "Begin: Cinder Road (preview)" }));
    const picker = await screen.findByRole("dialog", { name: /Bring veterans to Cinder Road/ });
    expect(picker).toHaveTextContent("Resolve carries between -1 and +2; renown is kept.");
    const boxes = within(picker).getAllByRole("checkbox");
    for (const box of boxes.slice(0, 6)) await user.click(box);
    expect(within(picker).getByText("5 of 5 chosen")).toBeInTheDocument();
    expect(boxes[5]).toBeDisabled();
    // A company carried at +3 shows the clamp.
    if (done.companies.some((company) => company.resolve > 2)) expect(picker).toHaveTextContent(/\(was \+3\)/);
    await user.click(within(picker).getByRole("button", { name: "Begin with these companies" }));
    await waitFor(() => expect(useFlow.getState().screen).toBe("campaign"));
    const carried = useFlow.getState().campaign!.carried!;
    expect(carried).toHaveLength(5);
    expect(carried.every((company) => company.resolve <= 2 && company.from.campaignId === "ash_and_banner")).toBe(true);
  });
});

describe("Call the Banners", () => {
  async function toTheCall(run: string | null = null) {
    const user = userEvent.setup();
    launch({ run });
    await user.click(await screen.findByRole("button", { name: /^(Begin|Continue): Cinder Road/ }));
    await waitFor(() => expect(useFlow.getState().screen).toBe("campaign"));
    await user.click(screen.getByRole("button", { name: /Take the field:/ }));
    expect(useFlow.getState().screen).toBe("roll");
    return user;
  }

  it("opens on the recommended force, with posts in order, a flex post and the Host's fixed threat", async () => {
    await toTheCall();
    const posts = screen.getAllByRole("button", { name: /^Post \d/ }).map((post) => post.getAttribute("aria-label")!);
    // Positions in activation order, never the borrowed board's squad names.
    expect(posts).toHaveLength(6);
    expect(posts.map((label) => label.match(/^Post (\d)/)![1])).toEqual(["1", "2", "3", "4", "5", "6"]);
    expect(posts[4]).toMatch(/flex: Cavalry or Line infantry$/);
    for (const borrowed of ["Greyford Shields", "Dawnwatch Archers", "Mercy Standard", "Stoneford Riders", "Kestrel Lancers", "Mill Lane Guard"]) {
      expect(posts.join(" ")).not.toContain(borrowed);
    }
    // Where they stand: one numbered marker per post on the map of the ground.
    expect(screen.getByRole("figure", { name: "Where the posts stand" }).querySelectorAll(".post-marker")).toHaveLength(6);
    expect(screen.getByRole("region", { name: "The Host" })).toHaveTextContent(/The Host .*Fixed before you choose/);
    expect(screen.getByRole("button", { name: "Take the field" })).toBeEnabled();
    expect(screen.getByRole("button", { name: /Recommended force/ })).toBeDisabled(); // already it
  });

  it("shows the engine's problems inline, keeps the threat fixed, and Recommended force puts it right", async () => {
    const user = await toTheCall();
    const threat = screen.getByRole("region", { name: "The Host" }).textContent;
    // The keyboard path: a post's company opens its list (arrows, Enter). Call the Ashgate
    // Shields to the sixth post.
    const sixth = screen.getAllByRole("button", { name: /^Company for / })[5];
    sixth.focus();
    await user.keyboard("{Enter}");
    const list = screen.getByRole("listbox", { name: /^Choose a company for / });
    expect(within(list).getByRole("option", { name: /Ashgate Shields/ })).toHaveTextContent(/now at/);
    within(list).getByRole("option", { name: /Ashgate Shields/ }).focus();
    await user.keyboard("{Enter}");
    // A company answers one post: it moved, leaving its first post empty.
    expect(screen.getAllByRole("button", { name: /^Company for / })[0]).toHaveAccessibleName(/: none$/);
    expect(screen.getAllByRole("button", { name: /^Company for / })[5]).toHaveAccessibleName(/: Ashgate Shields$/);
    expect(screen.getAllByRole("alert").length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "Take the field" })).toBeDisabled();
    expect(screen.getByRole("region", { name: "The Host" }).textContent).toBe(threat);
    await user.click(screen.getByRole("button", { name: /Recommended force/ }));
    expect(screen.queryAllByRole("alert")).toEqual([]);
    expect(screen.getByRole("button", { name: "Take the field" })).toBeEnabled();
  });

  it("calls by click: arm a post, then choose a company from the Roll", async () => {
    const user = await toTheCall();
    const sixth = screen.getAllByRole("button", { name: /^Post \d/ })[5];
    await user.click(sixth);
    expect(sixth).toHaveAttribute("aria-pressed", "true");
    await user.click(screen.getByRole("button", { name: /^Heron Stair Guard/ }));
    expect(screen.getAllByRole("button", { name: /^Company for / })[5]).toHaveAccessibleName(/: Heron Stair Guard$/);
    expect(screen.getByRole("button", { name: /^Heron Stair Guard.*called to / })).toBeInTheDocument();
  });

  it("shows conditions from a real battle: Worn rests, Reforming sits out, a levy fills what no one can", async () => {
    await toTheCall(serializeCampaignSave(registry, wornRun()));
    const roll = screen.getByRole("region", { name: "The Roll" });
    const state = useFlow.getState().campaign!;
    const worn = state.companies.filter((company) => company.condition === "worn");
    const reforming = state.companies.filter((company) => company.condition === "reforming");
    expect(worn.length).toBeGreaterThan(0);
    expect(reforming.map((company) => company.id)).toEqual(["cr_covenant_standard"]);
    for (const company of worn) expect(within(roll).getByRole("button", { name: new RegExp(`^${company.name}`) })).toHaveTextContent(/Worn −15\/−10/);
    const sitting = within(roll).getByRole("button", { name: /^Covenant Standard/ });
    expect(sitting).toBeDisabled();
    expect(sitting).toHaveTextContent("Reforming · sits out");
    // The only standard bearers sit out, so a levy fills their post, plainly marked.
    expect(screen.getAllByRole("button", { name: /^Company for .*: levy$/ })).toHaveLength(1);
    expect(document.querySelector(".post.levy")).toHaveTextContent("Levy (no ready company)");
    // The carried veteran answers the call with its renown.
    const veteran = state.companies.find((company) => company.id === "greyford_shields")!;
    expect(veteran.renown?.title).toBeTruthy();
    expect(within(roll).getByRole("button", { name: /^Greyford Shields/ })).toHaveTextContent(veteran.renown!.title);
    expect(screen.getByRole("button", { name: "Take the field" })).toBeEnabled();
  });

  it("takes the field: the briefing fields the called companies, and the result is saved in the campaign's own file", async () => {
    const user = await toTheCall();
    await user.click(screen.getByRole("button", { name: "Take the field" }));
    expect(useFlow.getState().screen).toBe("battle");
    const game = useGame.getState();
    expect(game.campaign?.assignment?.greyford_shields).toBe("cr_ashgate_shields");
    expect(game.view.squads.find((squad) => squad.id === "greyford_shields")?.name).toBe("Ashgate Shields");
    // Play it out (the engine decides); the outcome settles into the Roll campaign.
    act(() => {
      useGame.setState({ playbackSpeed: 400 });
      game.takeCommand();
      game.confirmDeployment();
    });
    for (let guard = 0; guard < 8 && useGame.getState().stage !== "outcome"; guard += 1) {
      act(() => useGame.getState().sealOrders());
      act(() => useGame.getState().finishPlayback());
      act(() => useGame.getState().nextPhase());
    }
    expect(useGame.getState().stage).toBe("outcome");
    await waitFor(async () => expect((await runs().load(PREVIEW_CAMPAIGN_ID)).kind).toBe("ok"));
    const read = await runs().load(PREVIEW_CAMPAIGN_ID);
    if (read.kind !== "ok") throw new Error("no run");
    expect(read.state.history).toHaveLength(1);
    expect(read.state.history[0].assignment?.greyford_shields).toBe("cr_ashgate_shields");
    expect(Object.values(read.state.history[0].assignment!)).not.toContain(LEVY_ID);
  });
});

describe("after a Roll battle", () => {
  it("the ledger shows the whole Roll with each company's condition", async () => {
    const user = userEvent.setup();
    launch({ run: serializeCampaignSave(registry, wornRun()) });
    await user.click(await screen.findByRole("button", { name: /^Continue: Cinder Road/ }));
    await waitFor(() => expect(useFlow.getState().screen).toBe("campaign"));
    const ledger = screen.getByRole("complementary", { name: "Army ledger" });
    expect(within(ledger).getByText("Greyford Shields")).toBeInTheDocument(); // carried, on the Roll
    expect(within(ledger).getByText("Covenant Standard").closest("li")).toHaveTextContent("Reforming · sits out");
    expect(within(ledger).getAllByText(/Worn −15\/−10/).length).toBeGreaterThan(0);
  });

  it("the outcome names each company's new condition, and any company rested back to fresh", () => {
    const { before, after } = wornBattle();
    launch();
    cleanup();
    const record = after.history[0];
    act(() => {
      useFlow.setState({ definition: cinderRoadPreview, campaign: after, lastRecord: record });
      useGame.setState({ campaign: { def: cinderRoadPreview, state: before, assignment: record.assignment }, stage: "outcome" });
    });
    render(<Outcome />);
    const list = screen.getByRole("list", { name: "Resolve after the battle" });
    for (const company of after.companies.filter((item) => item.condition !== "fresh" && record.companies.some((result) => result.companyId === item.id))) {
      expect(within(list).getByText(company.name).closest("li")).toHaveTextContent(company.condition === "worn" ? /Worn/ : /Reforming/);
    }
  });
});
