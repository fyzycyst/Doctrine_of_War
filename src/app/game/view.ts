// Pure helpers that turn the player's filtered view of a battle into UI data.
// Inputs are visibleState() and eventsFor() output only; never raw engine state.
import {
  doctrineLibrary,
  narrateEvent,
  type Doctrine,
  type EngineEvent,
  type EngineState,
  type VisibleSquad,
  type VisibleState,
  type Weather,
} from "../../game/engine";
import type { DioramaSquad } from "../../render/figures/types";
import { dioramaSquads } from "../../render/fromEngine";

const RANKS: Record<string, string> = {
  "-3": "Broken",
  "-2": "Shaken",
  "-1": "Raw",
  "0": "Green",
  "1": "Tested",
  "2": "Hardened",
  "3": "Veteran",
};

/** The Resolve band as a word (the engine's scale runs -3 Broken … 0 Green … +3 Veteran). */
export function resolveRank(resolve: number): string {
  return RANKS[String(Math.max(-3, Math.min(3, Math.round(resolve))))];
}

export const WEATHER_NAME: Record<Weather, string> = {
  clear: "Clear",
  rain: "Rain",
  mist: "Mist",
  ashWind: "Ash-wind",
};

export const WEATHER_EFFECT: Record<Weather, string> = {
  clear: "No effect on sight or movement.",
  rain: "Fords end a move; counter-charges hit softer.",
  mist: "Sight shortened by one hex.",
  ashWind: "The Host's dread cuts deeper.",
};

export function getDoctrine(id: string | null | undefined): Doctrine | undefined {
  return id ? doctrineLibrary[id] : undefined;
}

/** "If enemy adjacent → brace shields" → { when: "If enemy adjacent", then: "Brace shields" }. */
export function splitRule(label: string): { when: string; then: string } {
  const [when, then] = label.split(/\s*→\s*/);
  if (then === undefined) {
    return { when: "", then: capitalize(when) };
  }
  return { when, then: capitalize(then) };
}

function capitalize(text: string) {
  return text ? text[0].toUpperCase() + text.slice(1) : text;
}

export function isOnField(squad: VisibleSquad): squad is VisibleSquad & { hex: NonNullable<VisibleSquad["hex"]> } {
  return squad.status === "active" && squad.hex !== null;
}

/**
 * Squads for the diorama: everyone the player can see, via the renderer's own mapper.
 * Last-known enemies are drawn where they were last seen.
 * TODO(T05/T08): mark them as ghost silhouettes once DioramaSquad has a lastKnown flag.
 */
export function toDioramaSquads(view: VisibleState): DioramaSquad[] {
  return dioramaSquads(view.squads.filter(isOnField));
}

// ---------------------------------------------------------------------------
// Phase report
// ---------------------------------------------------------------------------

export type ChronicleTone = "order" | "clash" | "rally" | "rout" | "surge" | "waver" | "dread" | "sight" | "weather" | "siege" | "outcome";

export interface ChronicleEntry {
  key: string;
  beat: number;
  tone: ChronicleTone;
  text: string;
}

/** The standing orders one company was seen to fire this phase. */
export interface FiredOrders {
  squadId: string;
  squadName: string;
  mine: boolean;
  rules: { label: string; count: number }[];
}

function toneOf(event: EngineEvent): ChronicleTone | null {
  switch (event.kind) {
    case "engagement":
      return "clash";
    case "rally":
      return "rally";
    case "rout":
    case "exit":
      return "rout";
    case "fortune":
      return event.outcome === "surge" ? "surge" : "waver";
    case "dread":
      return "dread";
    case "sighted":
      return "sight";
    case "weatherShift":
      return "weather";
    case "objectiveDamage":
      return "siege";
    case "outcome":
      return "outcome";
    // Rule firings are summarised separately; moves and blocks are playback detail.
    case "ruleFired":
    case "move":
    case "blocked":
      return null;
  }
}

/**
 * The key events of a phase, from the player's filtered stream. `names` is the state
 * used only to name the companies an event mentions (narrateEvent's lookup).
 */
export function buildChronicle(events: EngineEvent[], names: EngineState): ChronicleEntry[] {
  const entries: ChronicleEntry[] = [];
  events.forEach((event, index) => {
    const tone = toneOf(event);
    const text = tone ? narrateEvent(event, names) : null;
    if (tone && text) {
      entries.push({ key: `${index}-${event.kind}`, beat: event.beat, tone, text });
    }
  });
  return entries;
}

/** Which standing orders fired this phase, grouped by company, player companies first. */
export function firedOrders(events: EngineEvent[], names: EngineState, playerFaction: string): FiredOrders[] {
  const bySquad = new Map<string, FiredOrders>();
  for (const event of events) {
    if (event.kind !== "ruleFired" || !event.squadId) {
      continue;
    }
    let group = bySquad.get(event.squadId);
    if (!group) {
      const squad = names.squads.find((item) => item.id === event.squadId);
      group = {
        squadId: event.squadId,
        squadName: squad?.name ?? "An unseen company",
        mine: squad?.faction === playerFaction,
        rules: [],
      };
      bySquad.set(event.squadId, group);
    }
    const rule = group.rules.find((item) => item.label === event.label);
    if (rule) {
      rule.count += 1;
    } else {
      group.rules.push({ label: event.label, count: 1 });
    }
  }
  return [...bySquad.values()].sort((a, b) => Number(b.mine) - Number(a.mine));
}

/** The engine titles reports "Phase N: intent"; the UI shows the phase separately. */
export function reportHeadline(title: string): string {
  return title.replace(/^Phase \d+:\s*/, "");
}
