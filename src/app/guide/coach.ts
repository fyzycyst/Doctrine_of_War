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
  seal: {
    title: "Seal your orders",
    body: "Companies you didn't give new orders simply follow their standing orders. That's normal: change only what you want changed. Seal, and the phase plays out on its own.",
  },
  watch: {
    title: "Watch your orders fire",
    body: "Each banner shows the rule a company is following right now. The battle waits while you read.",
    next: "Carry on",
  },
  chronicle: {
    title: "Read the chronicle",
    body: "After each phase: which of your orders fired, and what came of them. Phase 2 adds something new.",
    next: "Next phase",
  },
  tiring: {
    title: "Your line is tiring",
    body: "This bar is a company's cohesion, its nerve. When it reaches 0 the company breaks and runs, however strong it is.",
    next: "Next",
  },
  muster: {
    title: "Muster: move a company",
    body: "Before you seal, a company not in contact may muster: move 1 hex (cavalry 2). Select it and its hexes glow: click one, or pick one in its panel.",
  },
  relieve: {
    title: "Relief: swap a company out of the line",
    body: "A company out of contact, beside one in contact, can relieve it: they swap places, and the tired one steps out of the line.",
  },
  sealAgain: {
    title: "Seal again",
    body: "Your musters and reliefs happen first, before the Host moves. Every other company follows its standing orders, as usual. Then the phase plays out.",
  },
  relief: {
    title: "The whole loop",
    body: "That's the whole loop: orders, muster, seal, watch, read. Play on to the end of the battle. Press F1 any time for the Field Manual.",
    next: "Finish the tutorial",
  },
};

/**
 * How phase 1's losses fell, each by its own cause: a routed company's cohesion reached 0
 * (it broke and ran); a destroyed company's strength reached 0.
 */
function fallenLines(routed: string[], destroyed: string[]): string {
  const routedLine = routed.length ? `${routed.join(" and ")} broke and ran: ${routed.length === 1 ? "its" : "their"} cohesion reached 0. ` : "";
  const destroyedLine = destroyed.length ? `${destroyed.join(" and ")} ${destroyed.length === 1 ? "was" : "were"} destroyed: ${destroyed.length === 1 ? "its" : "their"} strength reached 0. ` : "";
  return routedLine + destroyedLine;
}

/** Phase 2's marks, naming the real companies (tutorialTargets.ts); fallbacks when this run offers none. */
export const PHASE2_COPY = {
  tiring: (company: string, cohesion: number, from: number, routed: string[], destroyed: string[]): CoachCopy => ({
    title: COACH_COPY.tiring.title,
    body: `${fallenLines(routed, destroyed)}${company}: cohesion down from ${from} to ${cohesion}. Cohesion is a company's nerve: at 0 it breaks and runs, however strong it is.`,
    next: "Next",
  }),
  /** Phase 1 cost companies but none still standing lost nerve: say how each fell. */
  broke: (routed: string[], destroyed: string[]): CoachCopy => ({
    title: COACH_COPY.tiring.title,
    body: `${fallenLines(routed, destroyed)}This bar is cohesion, a company's nerve: at 0 it breaks and runs, however strong it is.`,
    next: "Next",
  }),
  musterSelect: (company: string): CoachCopy => ({
    title: COACH_COPY.muster.title,
    body: `Before you seal, a company not in contact may muster: move before the phase begins. Select ${company}.`,
  }),
  musterPick: (company: string, reach: number): CoachCopy => ({
    title: COACH_COPY.muster.title,
    body: `Muster to bring a company closer to the fight or onto better ground. Where ${company} can go glows on the board (${reach} hex${reach === 1 ? "" : "es"}): click a glowing hex on the board, or pick one here in the Inspector (each named for its ground).`,
  }),
  musterNone: {
    title: COACH_COPY.muster.title,
    body: "Before you seal, a company not in contact may move 1 hex (cavalry 2). Nobody is free to this phase; select a company later and its muster hexes glow.",
    next: "Next",
  } satisfies CoachCopy,
  reliefSelect: (reliever: string, tired: string): CoachCopy => ({
    title: COACH_COPY.relieve.title,
    body: `${tired} is in contact. ${reliever}, beside it and out of contact, can relieve it: the two swap places and ${tired} steps out of the line to recover. Select ${reliever}.`,
  }),
  reliefPick: (tired: string): CoachCopy => ({
    title: COACH_COPY.relieve.title,
    body: `Click ${tired} on the board (its hex glows), or choose Relieve ${tired} here in the Inspector.`,
  }),
  reliefNone: {
    title: COACH_COPY.relieve.title,
    body: "A company out of contact, beside one in contact, can relieve it: they swap places, and the tired one steps out. No company can this phase. When one can, its tab says Can relieve.",
    next: "Next",
  } satisfies CoachCopy,
  reliefRead: (line: string): CoachCopy => ({
    ...COACH_COPY.relief,
    body: `Your relief opened the chronicle: "${line}". That's the whole loop: orders, muster, seal, watch, read. Play on to the end of the battle. Press F1 any time for the Field Manual.`,
  }),
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
  "stoneford_riders:clean_counterstroke": "it makes them charge any enemy that comes on alone, as the Ford Reavers are about to.",
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
    body: onLesson ? `Click the ${doctrine} card in the hand below: ${why}` : `Select the ${company}, then click the ${doctrine} card in their hand: ${why}`,
  };
}
