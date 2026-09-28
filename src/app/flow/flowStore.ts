// The app flow (T14): which screen is up, the campaign in progress and its save.
// The battle itself lives in the game store; this store decides what surrounds it.
import { create } from "zustand";
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

  go: (screen: Screen) => void;
  /** Looks for a usable save (for the title's Continue). */
  checkSave: () => Promise<SaveStatus>;
  /** A fresh campaign, saved at once, opening on the campaign map. */
  beginCampaign: () => Promise<void>;
  /** Loads the save and opens the campaign map. */
  continueCampaign: () => Promise<void>;
  /** Replaces the campaign and autosaves it. */
  commitCampaign: (state: CampaignState) => Promise<void>;
}

export const useFlow = create<FlowState>((set, get) => ({
  screen: "title",
  definition: ashAndBanner,
  campaign: null,
  save: "checking",
  saved: null,
  store: defaultStore(),
  saveError: null,

  go: (screen) => set({ screen }),

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
