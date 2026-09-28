// The app flow (T14): which screen is up, the campaign in progress and its save.
// The battle itself lives in the game store; this store decides what surrounds it.
import { create } from "zustand";
import { useGame } from "../game/gameStore";
import { scenarioFor } from "./campaignView";
import {
  ashAndBanner,
  CampaignSaveError,
  currentBattle,
  defaultStore,
  loadCampaignFrom,
  saveCampaignTo,
  startCampaign,
  type CampaignDefinition,
  type CampaignState,
  type SaveStore,
} from "../../game/campaign";

export type Screen = "title" | "campaign" | "battle" | "ending";

/** "invalid": a save exists but failed validation (it is never loaded). */
export type SaveStatus = "checking" | "none" | "valid" | "invalid";

export interface FlowState {
  screen: Screen;
  definition: CampaignDefinition;
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
}

/** First attempt: the scenario's curated seed. A retry draws a fresh one. */
function seedFor(state: CampaignState, battleId: string, curated: number | undefined): number {
  const attempts = state.history.filter((record) => record.battleId === battleId).length;
  return attempts === 0 && curated ? curated : 1 + Math.floor(Math.random() * 99_999);
}

export const useFlow = create<FlowState>((set, get) => ({
  screen: "title",
  definition: ashAndBanner,
  campaign: null,
  save: "checking",
  saved: null,
  store: defaultStore(),
  saveError: null,
  notice: null,

  go: (screen) => set({ screen, notice: null }),
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
    useGame
      .getState()
      .loadBattle(scenario, { seed: seedFor(campaign, battleId, scenario.curatedSeed), fortune: "on" }, "briefing", {
        def: definition,
        state: campaign,
      });
    set({ screen: "battle", notice: null });
  },

  checkSave: async () => {
    const { store, definition } = get();
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
    await get().commitCampaign(startCampaign(get().definition));
    set({ screen: "campaign" });
  },

  continueCampaign: async () => {
    const { store, definition } = get();
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

  commitCampaign: async (campaign) => {
    set({ campaign });
    try {
      await saveCampaignTo(get().store, campaign);
      set({ save: "valid", saved: campaign, saveError: null });
    } catch (error) {
      set({ saveError: `The campaign could not be saved (${error instanceof Error ? error.message : "unknown error"}).` });
    }
  },
}));
