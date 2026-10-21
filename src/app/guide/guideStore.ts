import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

/**
 * The tutorial's steps, in order (T32): the first phase (choose, read, give orders, seal,
 * watch, read the chronicle), then the second (the line tires; muster; relief; seal again;
 * the relief in the chronicle). Finishing the last ends the tutorial.
 */
export const COACH_STEPS = ["select", "read", "assign", "seal", "watch", "chronicle", "tiring", "muster", "relieve", "sealAgain", "relief"] as const;
export type CoachStep = (typeof COACH_STEPS)[number];

/** When each step happens: Back only moves within the same moment (time can't be rewound). */
export const STEP_MOMENT: Record<CoachStep, "orders1" | "playback1" | "report1" | "orders2" | "report2"> = {
  select: "orders1",
  read: "orders1",
  assign: "orders1",
  seal: "orders1",
  watch: "playback1",
  chronicle: "report1",
  tiring: "orders2",
  muster: "orders2",
  relieve: "orders2",
  sealAgain: "orders2",
  relief: "report2",
};

/**
 * The tutorial (T15, reworked in T32), persisted so it runs once: the "Standing orders" card,
 * then guided steps through the player's first battle, whichever battle that is (a
 * campaign's, or a skirmish). It ends only when finished or skipped: leaving a battle part
 * way leaves it to start again in the next one. Settings can show it again.
 */
export interface GuideState {
  introSeen: boolean;
  /** "active": the tutorial hasn't been finished or skipped. */
  coach: "active" | "done";
  /** Where the tutorial is (not persisted: a battle left part way starts it from the top). */
  step: CoachStep;
  seeIntro: () => void;
  /** Moves on from `from` (ignored if the tutorial is elsewhere, so triggers can fire freely). The last step's advance finishes it. */
  advance: (from: CoachStep) => void;
  /** Jumps forward to `to` (never back), e.g. when the player seals before reading. */
  catchUp: (to: CoachStep) => void;
  /** Steps back to `to` (e.g. the company was deselected while reading its orders). */
  back: (to: CoachStep) => void;
  /** The tutorial strip's Back: the step before, within the same moment of the battle. */
  stepBack: () => void;
  /** The rule callout the "watch" step points at; playback waits while it is pinned. */
  watchCallout: number | null;
  pinCallout: (id: number | null) => void;
  /** The muster line (T21), for First Breach's second command window outside the tutorial. */
  musterTipSeen: boolean;
  seeMusterTip: () => void;
  /** Call the Banners' "How the call works" overlay has opened once by itself (T25). */
  callHelpSeen: boolean;
  seeCallHelp: () => void;
  /** Skip the tutorial (for good, until Settings shows it again). */
  skip: () => void;
  /** The tutorial is complete (its last step, or the battle it ran in ended). */
  finish: () => void;
  /** Settings → Show the tutorial again: everything back to a first visit. */
  reset: () => void;
  /** Dev and captures only, never saved: a battle opened straight from the URL shows no tutorial. */
  off: boolean;
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
        const { step } = get();
        if (!tutorialOn(get()) || step !== from) return;
        const next = COACH_STEPS[COACH_STEPS.indexOf(from) + 1];
        // Finishing the tutorial covers what the muster line says, so that line stays away.
        set(next ? { step: next } : { coach: "done", musterTipSeen: true });
      },
      catchUp: (to) => {
        const { step } = get();
        if (tutorialOn(get()) && COACH_STEPS.indexOf(to) > COACH_STEPS.indexOf(step)) set({ step: to });
      },
      back: (to) => {
        const { step } = get();
        if (tutorialOn(get()) && COACH_STEPS.indexOf(to) < COACH_STEPS.indexOf(step)) set({ step: to });
      },
      stepBack: () => {
        const { step } = get();
        const previous = COACH_STEPS[COACH_STEPS.indexOf(step) - 1];
        if (tutorialOn(get()) && previous && STEP_MOMENT[previous] === STEP_MOMENT[step]) set({ step: previous });
      },
      watchCallout: null,
      pinCallout: (watchCallout) => set({ watchCallout }),
      musterTipSeen: false,
      seeMusterTip: () => set({ musterTipSeen: true }),
      callHelpSeen: false,
      seeCallHelp: () => set({ callHelpSeen: true }),
      skip: () => set({ coach: "done" }),
      // Finishing it covers what the muster line says, so that line stays away.
      finish: () => set({ coach: "done", musterTipSeen: true, watchCallout: null }),
      reset: () => set({ introSeen: false, coach: "active", step: "select", watchCallout: null, musterTipSeen: false, callHelpSeen: false, off: false }),
      off: false,
    }),
    {
      name: GUIDE_STORAGE_KEY,
      storage: createJSONStorage(() => localStorage),
      partialize: ({ introSeen, coach, musterTipSeen, callHelpSeen }) => ({ introSeen, coach, musterTipSeen, callHelpSeen }),
    },
  ),
);

/** The tutorial is running (not finished, skipped, or turned off for a dev battle). Every gate asks this. */
export const tutorialOn = (state: Pick<GuideState, "coach" | "off">) => state.coach === "active" && !state.off;

/** Whether the strip's Back has somewhere to go from `step`. */
export function canStepBack(step: CoachStep): boolean {
  const previous = COACH_STEPS[COACH_STEPS.indexOf(step) - 1];
  return Boolean(previous && STEP_MOMENT[previous] === STEP_MOMENT[step]);
}
