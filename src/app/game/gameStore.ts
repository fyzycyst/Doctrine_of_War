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
} from "../../game/engine";
import { ashAndBanner, applyCampaign, startCampaign, type CampaignDefinition, type CampaignState } from "../../game/campaign";
import { useAppStore } from "../store";
import { applyDeployment, checkPlacement, initialDeployment, type Deployment, type PlacementCheck } from "./deploy";

export type Stage = "briefing" | "deploy" | "command" | "resolving" | "report" | "outcome";
export type Pace = "readable" | "fast";

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
  seed: number;
  weather: Weather;
  status: EngineState["status"];
  /** eventsFor(events, playerFaction): the only events the UI may show. */
  events: EngineEvent[];
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
  /** Tests and dev capture only: swap in an engine state (the view is re-derived). */
  replaceEngine: (engine: EngineState) => void;
}

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
    ...battleFor(scenario, deployment, setup),
  };
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
  pace: "readable",

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
    if (
      !planning ||
      !squad ||
      squad.faction !== scenario.playerFaction ||
      squad.status !== "active" ||
      !scenario.playerDoctrineIds.includes(doctrineId)
    ) {
      return false;
    }
    set({ orders: { ...orders, [squadId]: doctrineId } });
    return true;
  },

  defaultedSquads: () => {
    const { view, scenario, orders } = get();
    return view.squads
      .filter((squad) => squad.faction === scenario.playerFaction && squad.status === "active" && !orders[squad.id])
      .map((squad) => squad.id);
  },

  sealOrders: () => {
    const { stage, engine, orders, scenario, log } = get();
    if (stage !== "command" || engine.status !== "command") {
      return;
    }
    const result = resolvePhase(engine, orders, scenario);
    const entry: PhaseLog = {
      phase: result.report.phase,
      title: result.report.title,
      seed: result.report.seed,
      weather: result.report.weather,
      status: result.state.status,
      events: eventsFor(result.events, scenario.playerFaction),
    };
    // "resolving" is where T06 playback will run; until then it goes straight to the report.
    set({ ...derive(scenario, result.state), orders: {}, log: [...log, entry], stage: "report", notice: null });
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

  setPace: (pace) => set({ pace }),
  clearNotice: () => set({ notice: null }),
  replaceEngine: (engine) => set(derive(get().scenario, engine)),
}));
