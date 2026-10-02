// The app flow (T14): which screen is up, the campaign in progress and its save.
// The battle itself lives in the game store; this store decides what surrounds it.
import { create } from "zustand";
import { useGame } from "../game/gameStore";
import { useSettings } from "../settingsStore";
import { scenarioFor } from "./campaignView";
import {
  ashAndBanner,
  CampaignSaveError,
  currentBattle,
  defaultStore,
  loadCampaignFrom,
  recordBattle,
  saveCampaignTo,
  startCampaign,
  type Assignment,
  type BattleRecord,
  type CampaignDefinition,
  type CampaignSaveRead,
  type CampaignState,
  type CarriedCompany,
  type SaveStore,
} from "../../game/campaign";
import type { SkirmishEntry } from "../../game/packs";
import { packs, roll, runs } from "../roll/api";

/** "campaigns": choose a campaign (M1); "roll": Call the Banners before a Roll battle; "skirmish": the skirmish list. */
export type Screen = "title" | "campaigns" | "campaign" | "roll" | "battle" | "ending" | "skirmish";

/** A completed campaign whose companies may carry into a new one (M1 carry-over). */
export interface CarrySource {
  packId: string;
  def: CampaignDefinition;
  state: CampaignState;
  candidates: CarriedCompany[];
}

/** "invalid": a save exists but failed validation (it is never loaded). */
export type SaveStatus = "checking" | "none" | "valid" | "invalid";

/** Where the doctrine editor opens: a base doctrine, a saved variant, and the company it was opened for. */
export interface EditorTarget {
  baseId?: string;
  variantId?: string;
  /** Opened from the hand: the new variant is ordered for this company on save. */
  squadId?: string;
}

export interface FlowState {
  screen: Screen;
  /** The campaign being played (the intro unless another was chosen). */
  definition: CampaignDefinition;
  /** Every non-intro campaign's saved run, as last read (M1). The intro keeps `save`/`saved`. */
  runReads: Record<string, CampaignSaveRead>;
  /** For runs that cannot be continued: what their backup slot holds (Restore is offered when it is ok). */
  backupReads: Record<string, CampaignSaveRead>;
  /** Reads every campaign's run and, where it cannot be continued, its backup (never writes). */
  checkRuns: () => Promise<void>;
  /** Moves a run this build cannot continue aside (kept, never deleted) and starts the campaign afresh. */
  setAsideRun: (campaignId: string) => Promise<void>;
  /** Sets the current run aside and continues from the backup. */
  restoreRun: (campaignId: string) => Promise<void>;
  /** From "Choose a campaign": continue its run, or start one (asking about carry-over first). */
  chooseCampaign: (campaignId: string) => Promise<void>;
  /** Open while starting a Roll campaign that may take companies from a completed one. */
  carryOver: { campaignId: string; sources: CarrySource[] } | null;
  /** Starts a Roll campaign's run with these carried companies (none to start with its own army only). */
  startRun: (campaignId: string, carried: { source: CarrySource; ids: string[] } | null) => Promise<void>;
  closeCarryOver: () => void;
  /** The skirmish being fought, if any: an authored battle on a fresh seed, nothing saved, no Resolve carried. */
  skirmish: SkirmishEntry | null;
  /** Opens a skirmish's briefing (from the skirmish list). */
  playSkirmish: (skirmishId: string) => void;
  /** Call the Banners: the chosen force takes the field (the battle's briefing opens). */
  fieldBanners: (assignment: Assignment) => void;
  /** The campaign in progress; null before one is begun or continued. */
  campaign: CampaignState | null;
  save: SaveStatus;
  /** The saved campaign found by checkSave (for the title's Continue label). */
  saved: CampaignState | null;
  /** Where saves go: Electron's userData file or localStorage (tests swap it). */
  store: SaveStore;
  /** A save that failed to write, in plain words (the game carries on). */
  saveError: string | null;
  /** Why the last campaign-map choice could not be played, in plain words. */
  notice: string | null;
  settingsOpen: boolean;
  setSettingsOpen: (open: boolean) => void;
  /** The doctrine editor (T16), and what it opened on. */
  editor: EditorTarget | null;
  setEditor: (editor: EditorTarget | null) => void;
  howToOpen: boolean;
  setHowToOpen: (open: boolean) => void;

  go: (screen: Screen) => void;
  /** Looks for a usable save (for the title's Continue). */
  checkSave: () => Promise<SaveStatus>;
  /** A fresh campaign, saved at once, opening on the campaign map. */
  beginCampaign: () => Promise<void>;
  /** Loads the save and opens the campaign map. */
  continueCampaign: () => Promise<void>;
  /** Replaces the campaign and autosaves it. */
  commitCampaign: (state: CampaignState) => Promise<void>;
  /** Opens a battle's briefing, with the campaign's companies (current battle only). */
  openBattle: (battleId: string) => void;
  clearNotice: () => void;
  /** The last battle's campaign record (for the outcome screen's Resolve changes). */
  lastRecord: BattleRecord | null;
  /**
   * Settles a finished campaign battle into the campaign (recordBattle) and autosaves.
   * Runs once per battle: a battle loaded from an older campaign state is ignored.
   */
  recordOutcome: () => Promise<void>;
  /** After a defeat: the same battle again with the same companies (campaign rules). */
  retryBattle: (seed: "same" | "new") => void;
  /** After a settled battle: the map, or the ending once the campaign is complete. */
  leaveBattle: () => void;
}

/**
 * Completed campaigns that can lend companies to `target`: the intro (from its v1 save) and
 * any completed Roll run, each with its candidates (the engine's clamp applied).
 */
async function carrySources(target: string, introSaved: CampaignState | null): Promise<CarrySource[]> {
  const sources: CarrySource[] = [];
  for (const pack of packs().packs) {
    for (const def of pack.campaigns) {
      if (def.id === target) continue;
      let state: CampaignState | null = null;
      if (def.id === ashAndBanner.id) state = introSaved;
      else {
        const read = await runs().load(def.id);
        if (read.kind === "ok") state = read.state;
      }
      if (!state || state.status !== "complete") continue;
      const candidates = roll().carryOverCandidates(def, state, pack.id);
      if (candidates.length) sources.push({ packId: pack.id, def, state, candidates });
    }
  }
  return sources;
}

const freshSeed = () => 1 + Math.floor(Math.random() * 99_999);

/** First attempt: the scenario's curated seed. A retry draws a fresh one. */
function seedFor(state: CampaignState, battleId: string, curated: number | undefined): number {
  const attempts = state.history.filter((record) => record.battleId === battleId).length;
  return attempts === 0 && curated ? curated : freshSeed();
}

export const useFlow = create<FlowState>((set, get) => ({
  screen: "title",
  definition: ashAndBanner,
  runReads: {},
  backupReads: {},
  carryOver: null,
  skirmish: null,
  campaign: null,
  save: "checking",
  saved: null,
  store: defaultStore(),
  saveError: null,
  notice: null,
  lastRecord: null,
  settingsOpen: false,
  setSettingsOpen: (settingsOpen) => set({ settingsOpen }),
  editor: null,
  setEditor: (editor) => set({ editor }),
  howToOpen: false,
  setHowToOpen: (howToOpen) => set({ howToOpen }),

  go: (screen) => set({ screen, notice: null }),

  checkRuns: async () => {
    const reads: Record<string, CampaignSaveRead> = {};
    const backups: Record<string, CampaignSaveRead> = {};
    for (const pack of packs().packs) {
      for (const def of pack.campaigns) {
        if (def.id === ashAndBanner.id) continue; // the intro keeps its own v1 save (checkSave)
        reads[def.id] = await runs().load(def.id);
        if (reads[def.id].kind === "unavailable" || reads[def.id].kind === "unreadable") backups[def.id] = await runs().loadBackup(def.id);
      }
    }
    set({ runReads: reads, backupReads: backups });
  },

  setAsideRun: async (campaignId) => {
    try {
      await runs().setAside(campaignId);
    } catch (error) {
      set({ notice: `The run could not be set aside (${error instanceof Error ? error.message : "unknown error"}).` });
      return;
    }
    await get().checkRuns();
    await get().chooseCampaign(campaignId);
  },

  restoreRun: async (campaignId) => {
    const found = packs().campaign(campaignId);
    const backup = await runs().loadBackup(campaignId);
    if (!found || backup.kind !== "ok") return;
    try {
      await runs().setAside(campaignId);
      set({ definition: found.campaign });
      await runs().save(backup.state);
    } catch (error) {
      set({ notice: `The backup could not be restored (${error instanceof Error ? error.message : "unknown error"}).` });
      return;
    }
    await get().checkRuns();
    await get().chooseCampaign(campaignId);
  },

  chooseCampaign: async (campaignId) => {
    if (campaignId === ashAndBanner.id) {
      const status = await get().checkSave();
      if (status === "valid") await get().continueCampaign();
      else if (status === "none") await get().beginCampaign();
      return; // an unreadable intro save is shown, never replaced from here
    }
    const found = packs().campaign(campaignId);
    if (!found) return;
    const read = await runs().load(campaignId);
    set({ runReads: { ...get().runReads, [campaignId]: read } });
    if (read.kind === "ok") {
      set({
        definition: found.campaign,
        campaign: read.state,
        notice: null,
        screen: currentBattle(found.campaign, read.state) ? "campaign" : "ending",
      });
      return;
    }
    if (read.kind !== "empty") return; // unavailable or unreadable: kept as is, never overwritten
    const sources = await carrySources(campaignId, get().saved);
    if (found.campaign.mode === "roll" && sources.length > 0) {
      set({ carryOver: { campaignId, sources } });
      return;
    }
    await get().startRun(campaignId, null);
  },

  startRun: async (campaignId, carried) => {
    const found = packs().campaign(campaignId);
    if (!found) return;
    const carryOver = carried && carried.ids.length > 0 ? roll().snapshotCarryOver({ def: carried.source.def, state: carried.source.state, packId: carried.source.packId }, found.campaign, carried.ids) : [];
    set({ definition: found.campaign, carryOver: null, notice: null });
    await get().commitCampaign(startCampaign(found.campaign, { carryOver }));
    set({ screen: "campaign" });
  },

  closeCarryOver: () => set({ carryOver: null }),

  playSkirmish: (skirmishId) => {
    const found = packs()
      .skirmishes()
      .find((item) => item.skirmish.id === skirmishId);
    const scenario = found && packs().scenario(found.skirmish.scenarioId);
    if (!found || !scenario) return;
    const { doctrineOnly, defaultPace } = useSettings.getState();
    const game = useGame.getState();
    // No campaign: the authored companies at their authored strength, and nothing is recorded.
    game.loadBattle(scenario, { seed: freshSeed(), fortune: doctrineOnly ? "off" : "on" }, "briefing", null);
    game.setPace(defaultPace);
    set({ skirmish: found.skirmish, screen: "battle", notice: null });
  },

  fieldBanners: (assignment) => {
    const { definition, campaign } = get();
    const battle = campaign ? currentBattle(definition, campaign) : null;
    const scenario = battle ? scenarioFor(battle) : undefined;
    if (!campaign || !battle || !scenario) return;
    const assembled = roll().assembleBattle(definition, campaign, scenario, assignment);
    const { doctrineOnly, defaultPace } = useSettings.getState();
    const game = useGame.getState();
    game.loadBattle(assembled, { seed: seedFor(campaign, battle.id, scenario.curatedSeed), fortune: doctrineOnly ? "off" : "on" }, "briefing", {
      def: definition,
      state: campaign,
      assignment: { ...assignment },
    });
    game.setPace(defaultPace);
    set({ skirmish: null, screen: "battle", notice: null });
  },
  clearNotice: () => set({ notice: null }),

  openBattle: (battleId) => {
    const { definition, campaign } = get();
    const battle = definition.battles.find((item) => item.id === battleId);
    if (!campaign || !battle) {
      return;
    }
    if (currentBattle(definition, campaign)?.id !== battleId) {
      set({ notice: `${battle.title} is already decided; the campaign moves on.` });
      return;
    }
    const scenario = scenarioFor(battle);
    if (!scenario) {
      set({ notice: `${battle.title} is still being forged. It will open in a later build.` });
      return;
    }
    if (definition.mode === "roll") {
      // A Roll battle is called first: choose who fills each post, then the briefing.
      set({ screen: "roll", notice: null });
      return;
    }
    const { doctrineOnly, defaultPace } = useSettings.getState();
    const game = useGame.getState();
    game.loadBattle(scenario, { seed: seedFor(campaign, battleId, scenario.curatedSeed), fortune: doctrineOnly ? "off" : "on" }, "briefing", {
      def: definition,
      state: campaign,
    });
    game.setPace(defaultPace);
    set({ skirmish: null, screen: "battle", notice: null });
  },

  checkSave: async () => {
    const { store } = get();
    const definition = ashAndBanner;
    let save: SaveStatus;
    let saved: CampaignState | null = null;
    try {
      saved = await loadCampaignFrom(store, definition);
      save = saved ? "valid" : "none";
    } catch (error) {
      save = error instanceof CampaignSaveError ? "invalid" : "none";
    }
    set({ save, saved });
    return save;
  },

  beginCampaign: async () => {
    set({ definition: ashAndBanner });
    await get().commitCampaign(startCampaign(ashAndBanner));
    set({ screen: "campaign" });
  },

  continueCampaign: async () => {
    const { store } = get();
    const definition = ashAndBanner;
    set({ definition });
    try {
      const campaign = await loadCampaignFrom(store, definition);
      if (!campaign) {
        set({ save: "none" });
        return;
      }
      set({ campaign, save: "valid", screen: currentBattle(definition, campaign) ? "campaign" : "ending" });
    } catch {
      set({ save: "invalid" });
    }
  },

  recordOutcome: async () => {
    const game = useGame.getState();
    const { definition, campaign } = get();
    // Only the battle this campaign state opened: never a standalone battle, never twice.
    if (!campaign || !game.campaign || game.campaign.state !== campaign || game.engine.status === "command") {
      return;
    }
    const next =
      definition.mode === "roll"
        ? roll().recordBattle(definition, campaign, game.engine, { customOrders: game.customOrders, assignment: game.campaign.assignment })
        : recordBattle(definition, campaign, game.engine, { customOrders: game.customOrders });
    set({ lastRecord: next.history[next.history.length - 1] ?? null });
    await get().commitCampaign(next);
  },

  retryBattle: (seedMode) => {
    const { definition, campaign } = get();
    const game = useGame.getState();
    if (!campaign) {
      game.retry(seedMode);
      return;
    }
    const seed = seedMode === "same" ? game.setup.seed : 1 + Math.floor(Math.random() * 99_999);
    // A Roll battle is retried with the same force against the same (fixed) Host.
    game.loadBattle(game.baseScenario, { ...game.setup, seed }, "deploy", { def: definition, state: campaign, assignment: game.campaign?.assignment });
  },

  leaveBattle: () => {
    const { definition, campaign } = get();
    set({ screen: campaign && !currentBattle(definition, campaign) ? "ending" : "campaign", notice: null });
  },

  commitCampaign: async (campaign) => {
    set({ campaign });
    try {
      if (get().definition.mode === "roll") {
        // Its own file (P3); a run this build cannot continue is never overwritten (the save refuses).
        await runs().save(campaign);
        set({ runReads: { ...get().runReads, [campaign.campaignId]: { kind: "ok", state: campaign, provenance: provenanceOf(campaign.campaignId) } }, saveError: null });
        return;
      }
      await saveCampaignTo(get().store, campaign);
      set({ save: "valid", saved: campaign, saveError: null });
    } catch (error) {
      set({ saveError: `The campaign could not be saved (${error instanceof Error ? error.message : "unknown error"}).` });
    }
  },
}));

/** What a Roll run records about its content (for the in-memory status after a save). */
function provenanceOf(campaignId: string) {
  const found = packs().campaign(campaignId);
  return { packId: found?.pack.id ?? "", campaignId, contentRevision: found?.pack.revision.content ?? 0, rulesRevision: found?.pack.revision.rules ?? 0 };
}

// A battle that reaches its outcome is settled into the campaign at once, so the
// result is saved even if the player quits from the outcome screen.
useGame.subscribe((state, previous) => {
  if (state.stage === "outcome" && previous.stage !== "outcome") {
    void useFlow.getState().recordOutcome();
  }
});
