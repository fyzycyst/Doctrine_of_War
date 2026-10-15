// Which battle the guidance teaches, and the words of each coach mark.
import type { EngineScenario } from "../../game/engine";
import type { CoachStep } from "./guideStore";

export const FIRST_BATTLE = "first_breach";

export interface CoachCopy {
  title: string;
  body: string;
  /** A button to move on; steps without one advance when the player does the thing. */
  next?: string;
}

export const COACH_COPY: Record<CoachStep, CoachCopy> = {
  select: { title: "Choose a company", body: "Each banner is one of your companies. Pick one to see its orders." },
  read: {
    title: "Read its doctrine",
    body: "These are its standing orders. Each beat it follows the first rule that fits, from the top.",
    next: "Next",
  },
  assign: { title: "Give new orders", body: "Pick a different card from your hand to change what this company does." },
  seal: { title: "Seal your orders", body: "When every company has its orders, seal them. The phase then plays out on its own." },
  watch: {
    title: "Watch your orders fire",
    body: "Each banner shows the rule a company is following right now. The battle waits while you read.",
    next: "Carry on",
  },
  chronicle: {
    title: "Read the chronicle",
    body: "After each phase: which of your orders fired, and what came of them.",
    next: "Finish the guide",
  },
};

/**
 * The first battle's one lesson: the company whose default doctrine differs from the
 * intended plan (First Breach: the Stoneford Riders, from Hold for Dawn to Clean
 * Counterstroke). Derived from the scenario data, so the guide follows the engine's
 * defaults; null unless exactly one company differs.
 */
export function firstLesson(scenario: EngineScenario): { squadId: string; doctrineId: string } | null {
  const intended = scenario.referencePlans?.intended ?? {};
  const differs = scenario.squads.filter(
    (squad) => squad.faction === scenario.playerFaction && !squad.noncombatant && intended[squad.id] && intended[squad.id] !== squad.doctrineId,
  );
  return differs.length === 1 ? { squadId: differs[0].id, doctrineId: intended[differs[0].id] } : null;
}

/** Why the lesson's card is right, keyed "squadId:doctrineId" (lower-case start: it follows a colon). */
export const LESSON_WHY: Record<string, string> = {
  "stoneford_riders:clean_counterstroke": "they'll charge any enemy that comes on alone, and the Ford Reavers will.",
};

/**
 * The select and assign marks, naming the lesson's company and card. `onLesson`: the
 * lesson's company is the one selected (else the mark sends the player to it first).
 */
export function lessonCopy(step: CoachStep, company: string, doctrine: string, why: string, onLesson: boolean): CoachCopy {
  if (step === "select") {
    return { title: COACH_COPY.select.title, body: `Each banner is one of your companies. Pick the ${company} to see their orders.` };
  }
  return {
    title: COACH_COPY.assign.title,
    body: onLesson ? `Give the ${company} the ${doctrine} card: ${why}` : `Select the ${company}, then give them the ${doctrine} card: ${why}`,
  };
}
