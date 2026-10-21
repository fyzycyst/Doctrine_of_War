import { useEffect, useMemo } from "react";
import { doctrineLibrary } from "../../game/engine";
import { isRelief } from "../game/muster";
import { useGame } from "../game/gameStore";
import { rosterName } from "../game/view";
import { useAppStore } from "../store";
import { COACH_COPY, FIRST_BATTLE, firstLesson, LESSON_WHY, lessonCopy, PHASE2_COPY, type CoachCopy } from "./coach";
import { CoachMark } from "./CoachMark";
import { canStepBack, COACH_STEPS, STEP_MOMENT, tutorialOn, useGuide, type CoachStep } from "./guideStore";
import { tutorialTargets } from "./tutorialTargets";

const find = (selector: string) => () => document.querySelector(selector);

/** The bounding box of every element matching `selector` (null if none). */
const around = (selector: string) => () => {
  const rects = [...document.querySelectorAll(selector)].map((element) => element.getBoundingClientRect());
  if (rects.length === 0) return null;
  const left = Math.min(...rects.map((rect) => rect.left));
  const top = Math.min(...rects.map((rect) => rect.top));
  const right = Math.max(...rects.map((rect) => rect.right));
  const bottom = Math.max(...rects.map((rect) => rect.bottom));
  return new DOMRect(left, top, right - left, bottom - top);
};

/** True in First Breach, the battle the first lesson (the Stoneford Riders' card) is written for. */
export function useFirstBattle(): boolean {
  return useGame((s) => s.baseScenario.id === FIRST_BATTLE);
}

/** The tutorial is running: not finished or skipped (it runs in whichever battle comes first). */
export function useTutorial(): boolean {
  return useGuide(tutorialOn);
}

/**
 * Moves the tutorial along as the player does each thing, and catches up if they run ahead.
 * Edge-triggered (on what changed), so the strip's Back can return to a step without the
 * state that ended it pushing straight past it again.
 */
function useTutorialTriggers(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return undefined;
    const isOwnActive = (id: string | null) => {
      const { view } = useGame.getState();
      return view.squads.some((squad) => squad.id === id && squad.faction === view.viewer && squad.status === "active");
    };
    // Where the battle is: phase 1's command window, the second's, or past them.
    const place = () => {
      const game = useGame.getState();
      const guide = useGuide.getState();
      const phase = game.log.length;
      // A new battle (or a retry): a tutorial left part way starts again from the top.
      if (phase === 0 && STEP_MOMENT[guide.step] !== "orders1") {
        useGuide.setState({ step: "select", watchCallout: null });
        return;
      }
      if (game.stage === "command" && phase === 1) guide.catchUp("tiring");
      else if (game.stage === "command" && phase >= 2) guide.advance("relief"); // past phase 2's report: done
      else if (game.stage === "resolving" && phase === 1) guide.catchUp("watch");
      else if (game.stage === "resolving" && phase === 2) guide.catchUp("sealAgain");
      else if (game.stage === "report" && phase === 1) guide.catchUp("chronicle");
      else if (game.stage === "report" && phase === 2) guide.catchUp("relief");
    };
    place();
    const unsubscribeGame = useGame.subscribe((game, before) => {
      const guide = useGuide.getState();
      if (!tutorialOn(guide)) return;
      if (game.stage !== before.stage || game.log.length !== before.log.length) return place();
      if (game.stage !== "command") return;
      // Phase 1: orders given → seal.
      if (game.log.length === 0 && Object.keys(game.orders).length > Object.keys(before.orders).length) guide.catchUp("seal");
      // Phase 2: a muster planned → relief; a relief planned → seal again.
      if (game.muster !== before.muster) {
        if (game.muster.some(isRelief) && !before.muster.some(isRelief)) guide.catchUp("sealAgain");
        else if (game.muster.some((move) => !isRelief(move)) && guide.step === "muster") guide.advance("muster");
      }
    });
    const unsubscribeApp = useAppStore.subscribe((app, before) => {
      const guide = useGuide.getState();
      if (!tutorialOn(guide) || app.selectedSquadId === before.selectedSquadId || useGame.getState().stage !== "command") return;
      if (isOwnActive(app.selectedSquadId)) guide.advance("select");
      else if (!app.selectedSquadId && (guide.step === "read" || guide.step === "assign")) guide.back("select");
    });
    return () => {
      unsubscribeGame();
      unsubscribeApp();
    };
  }, [enabled]);
}

/** The tutorial over the command UI: its strip, the current step's mark, and their announcements. */
export function CoachLayer() {
  const active = useTutorial();
  const step = useGuide((s) => s.step);
  const watchCallout = useGuide((s) => s.watchCallout);
  const stage = useGame((s) => s.stage);
  const scenario = useGame((s) => s.scenario);
  const view = useGame((s) => s.view);
  const engine = useGame((s) => s.engine);
  const muster = useGame((s) => s.muster);
  const selectedId = useAppStore((s) => s.selectedSquadId);
  const firstBattle = useFirstBattle();
  useTutorialTriggers(active);
  const targets = useMemo(() => (active && stage === "command" ? tutorialTargets(engine, scenario, muster) : null), [active, stage, engine, scenario, muster]);
  if (!active) return null;

  const name = (id: string) => {
    const squad = view.squads.find((item) => item.id === id);
    return squad ? rosterName(squad) : id;
  };
  // First Breach's one lesson (the Stoneford Riders → Clean Counterstroke); elsewhere the general steps.
  const found = firstBattle ? firstLesson(scenario) : null;
  const company = found && view.squads.find((squad) => squad.id === found.squadId);
  const why = found && LESSON_WHY[`${found.squadId}:${found.doctrineId}`];
  const lesson =
    found && company && why
      ? { ...found, onLesson: selectedId === found.squadId, copy: (s: CoachStep) => lessonCopy(s, rosterName(company), doctrineLibrary[found.doctrineId].name, why, selectedId === found.squadId) }
      : null;
  const shown = markFor(step, stage, watchCallout, lesson, targets, selectedId, name);
  const copy = shown?.copy ?? (lesson && (step === "select" || step === "assign") ? lesson.copy(step) : COACH_COPY[step]);
  return (
    <>
      {stage === "deploy" ? (
        <TutorialStrip step={step} label="Tutorial · before step 1" title="Your companies start in position: March to positions" />
      ) : (
        <TutorialStrip step={step} title={copy.title} />
      )}
      <p className="sr-only" role="status" aria-live="polite">
        {shown || step === "chronicle" || step === "relief" ? `Tutorial: ${copy.title}. ${copy.body}` : ""}
      </p>
      {shown?.mark}
    </>
  );
}

/** "Tutorial · step N of M", always on screen while it runs, with Back and Skip. */
function TutorialStrip({ step, title, label }: { step: CoachStep; title: string; label?: string }) {
  const stepBack = useGuide((s) => s.stepBack);
  const skip = useGuide((s) => s.skip);
  const back = useGuide((s) => s.back);
  const select = useAppStore((s) => s.selectSquad);
  return (
    <section className="tutorial-strip" aria-label="Tutorial">
      <span className="tutorial-strip-label">{label ?? `Tutorial · step ${COACH_STEPS.indexOf(step) + 1} of ${COACH_STEPS.length}`}</span>
      <span className="tutorial-strip-title">{title}</span>
      <button
        type="button"
        className="btn-quiet"
        disabled={Boolean(label) || !canStepBack(step)}
        onClick={() => {
          // Back to choosing a company: let go of the one selected, so the step reads true.
          if (step === "read") {
            select(null);
            back("select");
          } else stepBack();
        }}
      >
        Back
      </button>
      <button type="button" className="btn-quiet" onClick={skip}>
        Skip tutorial
      </button>
    </section>
  );
}

interface LessonMark {
  squadId: string;
  doctrineId: string;
  /** The lesson's company is the one selected. */
  onLesson: boolean;
  copy: (step: CoachStep) => CoachCopy;
}

type Targets = ReturnType<typeof tutorialTargets> | null;

function markFor(
  step: CoachStep,
  stage: string,
  watchCallout: number | null,
  lesson: LessonMark | null,
  targets: Targets,
  selectedId: string | null,
  name: (id: string) => string,
): { mark: React.ReactNode; copy: CoachCopy } | null {
  const tab = (id: string) => find(`.roster .banner-tab.own[role="option"][data-squad="${id}"]`);
  const mark = (copy: CoachCopy, target: () => Element | DOMRect | null, prefer: "above" | "below" | "left" | "right", focusNext = false) => ({
    copy,
    mark: <CoachMark step={step} target={target} prefer={prefer} copy={copy} focusNext={focusNext} />,
  });
  if (stage === "command") {
    switch (step) {
      case "select":
        return lesson ? mark(lesson.copy("select"), tab(lesson.squadId), "right") : mark(COACH_COPY.select, find('.roster .banner-tab.own[role="option"]'), "right");
      case "read":
        return mark(COACH_COPY.read, find(".inspector .insp-doctrine .doctrine-card"), "left");
      case "assign":
        // The lesson's card in its company's hand; with another company selected, that company's tab first.
        if (lesson?.onLesson) return mark(lesson.copy("assign"), find(`.hand [role="option"][data-doctrine="${lesson.doctrineId}"]`), "above");
        if (lesson) return mark(lesson.copy("assign"), tab(lesson.squadId), "right");
        return mark(COACH_COPY.assign, around(".hand-caption, .hand-cards"), "above");
      case "seal":
      case "sealAgain":
        return mark(COACH_COPY[step], find(".wax-seal"), "above");
      case "tiring": {
        const tired = targets?.tired;
        const broke = targets?.broke.map(name) ?? [];
        if (tired) return mark(PHASE2_COPY.tiring(name(tired.squadId), tired.cohesion, tired.from, broke), find(`.roster .banner-tab[data-squad="${tired.squadId}"] .meter-row.cohesion`), "right", true);
        return mark(broke.length ? PHASE2_COPY.broke(broke) : COACH_COPY.tiring, find(".roster .banner-tab.own .meter-row.cohesion"), "right", true);
      }
      case "muster": {
        const mover = targets?.mover;
        if (!mover) return mark(PHASE2_COPY.musterNone, find(".roster .banner-tab.own"), "right", true);
        return selectedId === mover.squadId
          ? mark(PHASE2_COPY.musterPick(name(mover.squadId), mover.reach), find(".inspector .insp-muster"), "left")
          : mark(PHASE2_COPY.musterSelect(name(mover.squadId)), tab(mover.squadId), "right");
      }
      case "relieve": {
        const relief = targets?.relief;
        if (!relief) return mark(PHASE2_COPY.reliefNone, find(".roster .banner-tab.own"), "right", true);
        return selectedId === relief.reliever
          ? mark(PHASE2_COPY.reliefPick(name(relief.tired)), find(".inspector .insp-muster"), "left")
          : mark(PHASE2_COPY.reliefSelect(name(relief.reliever), name(relief.tired)), tab(relief.reliever), "right");
      }
      default:
        return null;
    }
  }
  if (stage === "resolving" && step === "watch" && watchCallout !== null) {
    return mark(COACH_COPY.watch, find(`[data-callout-id="${watchCallout}"]`), "right", true);
  }
  return null;
}
