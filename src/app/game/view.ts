// Pure helpers that turn the player's filtered view of a battle into UI data.
// Inputs are visibleState() and eventsFor() output only; never raw engine state.
import {
  doctrineLibrary,
  type Doctrine,
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

/** The engine titles reports "Phase N: intent"; the UI shows the phase separately. */
export function reportHeadline(title: string): string {
  return title.replace(/^Phase \d+:\s*/, "");
}
