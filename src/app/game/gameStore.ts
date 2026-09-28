// The game store (tech plan D8). The engine drives every outcome: this store only
// holds the battle, the player's pending orders and where the UI is in the phase loop.
//
// THE RULE: components read `view` (visibleState for the player's faction) and the
// phase log's `events` (eventsFor the player's faction). `engine` is the raw state the
// engine needs for the next call; it is never rendered.
import { create } from "zustand";
import type { HexCoord } from "../../game/board";
import {
  createInitialState,
  doctrineLibrary,
  eventsFor,
  firstBreach,
  resolvePhase,
  visibleState,
  type EngineEvent,
  type EngineScenario,
  type EngineState,
  type FortuneMode,
  type Orders,
  type VisibleState,
  type Weather,
  isOrderAllowed,
  withVariants,
  type CheckedVariant,
} from "../../game/engine";
import { ashAndBanner, applyCampaign, startCampaign, type CampaignDefinition, type CampaignState } from "../../game/campaign";
import type { CalloutSpec } from "../playback/director";
import type { Pace } from "../playback/timeline";
import { useSettings } from "../settingsStore";
import { useAppStore } from "../store";
import { isVariantId, useVariants } from "../variants/variantStore";
import { applyDeployment, checkPlacement, initialDeployment, type Deployment, type PlacementCheck } from "./deploy";

export type Stage = "briefing" | "deploy" | "command" | "resolving" | "report" | "outcome";
export type { Pace } from "../playback/timeline";

export interface BattleSetup {
  seed: number;
  fortune: FortuneMode;
}

/** The campaign a battle belongs to. Its roster (names, Resolve, renown) is applied to the scenario. */
export interface CampaignContext {
  def: CampaignDefinition;
  state: CampaignState;
}

/** One resolved phase as the player experienced it. */
export interface PhaseLog {
  phase: number;
  title: string;
  /** The Host's intent for the phase (the headline, without "Phase N:"). */
  intent: string;
  seed: number;
  weather: Weather;
  status: EngineState["status"];
  /** eventsFor(events, playerFaction): the only events the UI may show. */
  events: EngineEvent[];
  /** What the player saw when the phase began (playback starts here; names come from it). */
  start: VisibleState;
}

export interface GameState {
  /** The scenario as fought: after applyCampaign when there is a campaign. */
  scenario: EngineScenario;
  /** The authored scenario, kept so a retry can re-apply the campaign. */
  baseScenario: EngineScenario;
  /** null for a standalone battle (dev picker, tests). */
  campaign: CampaignContext | null;
  setup: BattleSetup;
  stage: Stage;
  /** Raw engine state. Only the store and report narration read it; render `view`. */
  engine: EngineState;
  /** visibleState(engine, playerFaction). */
  view: VisibleState;
  deployment: Deployment;
  /** Explicit doctrine assignments for the phase being planned. */
  orders: Orders;
  log: PhaseLog[];
  pace: Pace;
  /** The last thing the UI refused, in plain words (deploy rejections). */
  notice: string | null;
  /**
   * Doctrine variants this battle can play (T16): the player's saved variants, plus any
   * deleted mid-battle that a company still stands on. The engine sees them as ordinary
   * doctrines through withVariants(); only those whose base the scenario allows play.
   */
  variants: CheckedVariant[];
  /** Custom orders (a variant) were sealed in this battle: the campaign record notes it. */
  customOrders: boolean;

  // Playback (T06). While `stage` is "resolving", the board and roster show `display`,
  // which the director advances step by step from the phase's opening view.
  display: VisibleState | null;
  /** Bumped for each playback (a seal or a replay); the director restarts on it. */
  runId: number;
  /** 0 before the first beat. */
  beat: number;
  callouts: Callout[];
  /** The hex the camera leans toward, if any. */
  focus: HexCoord | null;
  /** Time (performance.now) of the last gate hit, to shake the board. */
  shakeAt: number;
  /** The latest playback line, for the playback bar and screen readers. */
  caption: string;
  /** Tests and capture only: >1 fast-forwards playback timers. */
  playbackSpeed: number;

  loadBattle: (scenario: EngineScenario, setup: BattleSetup, stage?: Stage, campaign?: CampaignContext | null) => void;
  takeCommand: () => void;
  placeSquad: (squadId: string, hex: HexCoord) => PlacementCheck;
  confirmDeployment: () => void;
  assignDoctrine: (squadId: string, doctrineId: string) => boolean;
  /** Squads that would fight this phase on a doctrine the player did not choose. */
  defaultedSquads: () => string[];
  sealOrders: () => void;
  nextPhase: () => void;
  retry: (seed: "same" | "new") => void;
  setPace: (pace: Pace) => void;
  clearNotice: () => void;
  /** The saved variants changed: play the new versions, and drop orders for deleted ones. */
  syncVariants: (live: CheckedVariant[]) => void;
  /** Tests and dev capture only: swap in an engine state (the view is re-derived). */
  replaceEngine: (engine: EngineState) => void;
  /** Playback reached the end, or was skipped: show the final state and the report. */
  finishPlayback: () => void;
  /** Plays the last phase again from the report. The engine is not re-run. */
  replayPhase: () => void;
  setPlayback: (patch: Partial<Pick<GameState, "display" | "beat" | "focus" | "shakeAt" | "caption">>) => void;
  pushCallout: (spec: CalloutSpec) => number;
  dropCallout: (id: number) => void;
}

export interface Callout extends CalloutSpec {
  id: number;
}

const idle = { display: null, beat: 0, callouts: [], focus: null, caption: "" };
let calloutIds = 0;

function derive(scenario: EngineScenario, engine: EngineState) {
  return { engine, view: visibleState(engine, scenario.playerFaction) };
}

function battleFor(scenario: EngineScenario, deployment: Deployment, setup: BattleSetup) {
  return derive(scenario, createInitialState(applyDeployment(scenario, deployment), setup));
}

function freshBattle(baseScenario: EngineScenario, setup: BattleSetup, stage: Stage, campaign: CampaignContext | null) {
  // Every battle's setup goes through the campaign, so its companies carry their Resolve and renown in.
  const scenario = campaign ? applyCampaign(campaign.def, campaign.state, baseScenario) : baseScenario;
  const deployment = initialDeployment(scenario);
  return {
    scenario,
    baseScenario,
    campaign,
    setup,
    stage,
    deployment,
    orders: {},
    log: [],
    notice: null,
    variants: useVariants.getState().variants,
    customOrders: false,
    ...idle,
    ...battleFor(scenario, deployment, setup),
  };
}

/** The scenario and doctrine library as the engine should see them, variants included. */
function played({ scenario, variants }: Pick<GameState, "scenario" | "variants">) {
  return withVariants(scenario, variants, doctrineLibrary);
}

/**
 * A selected company that routed, was destroyed or escaped would open the next command
 * window on a dead inspector with no hand; select the first company still fighting.
 */
function reconcileSelection(view: VisibleState) {
  const app = useAppStore.getState();
  const selected = view.squads.find((squad) => squad.id === app.selectedSquadId);
  if (!app.selectedSquadId || selected?.status === "active") {
    return;
  }
  const next = view.squads.find((squad) => squad.faction === view.viewer && squad.status === "active");
  app.selectSquad(next?.id ?? null);
  app.selectHex(next?.hex ?? null);
}

/** A fresh seed for "retry with new fortune". The engine stays pure; chance is picked here. */
function newSeed(previous: number) {
  let seed = previous;
  while (seed === previous) {
    seed = 1 + Math.floor(Math.random() * 99_999);
  }
  return seed;
}

export const useGame = create<GameState>((set, get) => ({
  // Production start: the tutorial on its curated seed with fortune on. boot.ts may
  // swap in a dev scenario (?scenario=) before the first render.
  ...freshBattle(firstBreach, { seed: firstBreach.curatedSeed ?? 1, fortune: "on" }, "briefing", {
    def: ashAndBanner,
    state: startCampaign(ashAndBanner),
  }),
  pace: useSettings.getState().defaultPace,
  runId: 0,
  shakeAt: 0,
  playbackSpeed: 1,

  loadBattle: (scenario, setup, stage = "briefing", campaign = null) => {
    useAppStore.getState().clearSelection();
    set(freshBattle(scenario, setup, stage, campaign));
  },

  takeCommand: () => {
    if (get().stage === "briefing") {
      set({ stage: "deploy", notice: null });
    }
  },

  placeSquad: (squadId, hex) => {
    const { stage, scenario, deployment, setup } = get();
    if (stage !== "deploy") {
      return { ok: false, reason: "Deployment is over once the battle begins." };
    }
    const check = checkPlacement(scenario, deployment, squadId, hex);
    if (!check.ok) {
      set({ notice: check.reason });
      return check;
    }
    const next = { ...deployment, [squadId]: { ...hex } };
    set({ deployment: next, notice: null, ...battleFor(scenario, next, setup) });
    return check;
  },

  confirmDeployment: () => {
    if (get().stage === "deploy") {
      set({ stage: "command", notice: null });
    }
  },

  assignDoctrine: (squadId, doctrineId) => {
    const { stage, scenario, view, orders } = get();
    const squad = view.squads.find((item) => item.id === squadId);
    const planning = stage === "command" || stage === "deploy";
    // A variant must still be saved (not one deleted mid-battle) and its base allowed here.
    const liveVariant = !isVariantId(doctrineId) || useVariants.getState().variants.some((item) => item.variant.id === doctrineId);
    if (
      !planning ||
      !squad ||
      squad.faction !== scenario.playerFaction ||
      squad.status !== "active" ||
      !liveVariant ||
      !isOrderAllowed(played(get()).scenario, squadId, doctrineId)
    ) {
      return false;
    }
    set({ orders: { ...orders, [squadId]: doctrineId } });
    return true;
  },

  defaultedSquads: () => {
    const { view, scenario, orders } = get();
    return view.squads
      .filter((squad) => squad.faction === scenario.playerFaction && squad.status === "active" && !squad.noncombatant && !orders[squad.id])
      .map((squad) => squad.id);
  },

  sealOrders: () => {
    const { stage, engine, orders, scenario, log, view } = get();
    if (stage !== "command" || engine.status !== "command") {
      return;
    }
    const battle = played(get());
    const result = resolvePhase(engine, orders, battle.scenario, { doctrines: battle.doctrines });
    const entry: PhaseLog = {
      phase: result.report.phase,
      title: result.report.title,
      intent: result.report.intent,
      seed: result.report.seed,
      weather: result.report.weather,
      status: result.state.status,
      events: eventsFor(result.events, scenario.playerFaction),
      start: view,
    };
    // The engine has already decided the phase; playback shows it from the opening view.
    set({
      ...derive(scenario, result.state),
      orders: {},
      log: [...log, entry],
      customOrders: get().customOrders || Object.values(orders).some(isVariantId),
      stage: "resolving",
      notice: null,
      ...idle,
      display: view,
      runId: get().runId + 1,
    });
  },

  nextPhase: () => {
    const { stage, engine, view } = get();
    if (stage === "report") {
      set({ stage: engine.status === "command" ? "command" : "outcome" });
      reconcileSelection(view);
    }
  },

  retry: (seedMode) => {
    const { baseScenario, setup, campaign } = get();
    const seed = seedMode === "same" ? setup.seed : newSeed(setup.seed);
    get().loadBattle(baseScenario, { ...setup, seed }, "deploy", campaign);
  },

  finishPlayback: () => {
    if (get().stage === "resolving") {
      set({ stage: "report", ...idle });
    }
  },

  replayPhase: () => {
    const { stage, log } = get();
    const last = log[log.length - 1];
    if (stage === "report" && last) {
      set({ stage: "resolving", ...idle, display: last.start, runId: get().runId + 1 });
    }
  },

  setPlayback: (patch) => set(patch),
  pushCallout: (spec) => {
    calloutIds += 1;
    const id = calloutIds;
    set({ callouts: [...get().callouts.slice(-7), { ...spec, id }] });
    return id;
  },
  dropCallout: (id) => set({ callouts: get().callouts.filter((callout) => callout.id !== id) }),

  setPace: (pace) => set({ pace }),
  clearNotice: () => set({ notice: null }),
  syncVariants: (live) => {
    const { variants, orders, engine } = get();
    const liveIds = new Set(live.map((item) => item.variant.id));
    const standing = new Set(engine.squads.map((squad) => squad.doctrineId));
    // Keep a deleted variant only while a company stands on it (the engine needs its rules).
    const kept = variants.filter((item) => !liveIds.has(item.variant.id) && standing.has(item.variant.id));
    const nextOrders = Object.fromEntries(Object.entries(orders).filter(([, id]) => !isVariantId(id) || liveIds.has(id)));
    set({ variants: [...live, ...kept], orders: nextOrders });
  },
  replaceEngine: (engine) => set(derive(get().scenario, engine)),
}));

/** What the board and roster show: the playback layer while resolving, else the view. */
export const useShownView = () => useGame((s) => s.display ?? s.view);

// Variants saved or deleted mid-battle (from the hand's "Edit a copy…") play at once.
useVariants.subscribe((state, previous) => {
  if (state.variants !== previous.variants) {
    useGame.getState().syncVariants(state.variants);
  }
});
