// Which battle the guidance teaches, and the words of each coach mark.
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
