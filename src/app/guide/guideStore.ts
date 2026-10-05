import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

/** The first battle's coach marks, in order. */
export const COACH_STEPS = ["select", "read", "assign", "seal", "watch", "chronicle"] as const;
export type CoachStep = (typeof COACH_STEPS)[number];

/**
 * First-battle guidance (T15), persisted so it is shown once: the "What is a doctrine?"
 * intro card, then coach marks through the first battle. Skipping or finishing ends
 * them for good; Settings can show them again.
 */
export interface GuideState {
  introSeen: boolean;
  coach: "active" | "done";
  /** Where the coach is (not persisted: a reload starts the marks from the top). */
  step: CoachStep;
  seeIntro: () => void;
  /** Moves on from `from` (ignored if the coach is elsewhere, so triggers can fire freely). */
  advance: (from: CoachStep) => void;
  /** Jumps forward to `to` (never back), e.g. when the player seals before reading. */
  catchUp: (to: CoachStep) => void;
  /** Steps back to `to` (e.g. the company was deselected while reading its orders). */
  back: (to: CoachStep) => void;
  /** The rule callout the "watch" mark points at; playback waits while it is pinned. */
  watchCallout: number | null;
  pinCallout: (id: number | null) => void;
  /** The muster line (T21), shown once in the first battle's second command window. */
  musterTipSeen: boolean;
  seeMusterTip: () => void;
  /** Call the Banners' "How the call works" overlay has opened once by itself (T25). */
  callHelpSeen: boolean;
  seeCallHelp: () => void;
  skip: () => void;
  reset: () => void;
}

export const GUIDE_STORAGE_KEY = "doctrine-of-war.guide";

export const useGuide = create<GuideState>()(
  persist(
    (set, get) => ({
      introSeen: false,
      coach: "active",
      step: "select",
      seeIntro: () => set({ introSeen: true }),
      advance: (from) => {
        const { coach, step } = get();
        if (coach !== "active" || step !== from) return;
        const next = COACH_STEPS[COACH_STEPS.indexOf(from) + 1];
        set(next ? { step: next } : { coach: "done" });
      },
      catchUp: (to) => {
        const { coach, step } = get();
        if (coach === "active" && COACH_STEPS.indexOf(to) > COACH_STEPS.indexOf(step)) set({ step: to });
      },
      back: (to) => {
        const { coach, step } = get();
        if (coach === "active" && COACH_STEPS.indexOf(to) < COACH_STEPS.indexOf(step)) set({ step: to });
      },
      watchCallout: null,
      pinCallout: (watchCallout) => set({ watchCallout }),
      musterTipSeen: false,
      seeMusterTip: () => set({ musterTipSeen: true }),
      callHelpSeen: false,
      seeCallHelp: () => set({ callHelpSeen: true }),
      skip: () => set({ coach: "done" }),
      reset: () => set({ introSeen: false, coach: "active", step: "select", watchCallout: null, musterTipSeen: false, callHelpSeen: false }),
    }),
    {
      name: GUIDE_STORAGE_KEY,
      storage: createJSONStorage(() => localStorage),
      partialize: ({ introSeen, coach, musterTipSeen, callHelpSeen }) => ({ introSeen, coach, musterTipSeen, callHelpSeen }),
    },
  ),
);
