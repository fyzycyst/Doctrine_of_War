import { useEffect } from "react";
import { doctrineLibrary } from "../../game/engine";
import { useGame } from "../game/gameStore";
import { rosterName } from "../game/view";
import { useAppStore } from "../store";
import { COACH_COPY, FIRST_BATTLE, firstLesson, LESSON_WHY, lessonCopy, type CoachCopy } from "./coach";
import { CoachMark } from "./CoachMark";
import { useGuide, type CoachStep } from "./guideStore";

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

/** True in the battle the guidance teaches. */
export function useFirstBattle(): boolean {
  return useGame((s) => s.baseScenario.id === FIRST_BATTLE);
}

/**
 * Moves the coach along as the player does each thing (and catches up if they run
 * ahead), so the marks never nag about something already done.
 */
function useCoachTriggers(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return undefined;
    const ownSelected = () => {
      const { view } = useGame.getState();
      const id = useAppStore.getState().selectedSquadId;
      return view.squads.some((squad) => squad.id === id && squad.faction === view.viewer && squad.status === "active");
    };
    const sync = () => {
      const guide = useGuide.getState();
      const game = useGame.getState();
      if (guide.coach !== "active") return;
      if (game.stage === "resolving") guide.catchUp("watch");
      else if (game.stage === "report") guide.catchUp("chronicle");
      else if (game.stage === "command") {
        if (game.log.length > 0) {
          // Past the first phase: the lesson is done.
          guide.skip();
          return;
        }
        if (Object.keys(game.orders).length > 0) guide.catchUp("seal");
        else if (ownSelected()) guide.advance("select");
        else if (guide.step === "read" || guide.step === "assign") guide.back("select");
      }
    };
    sync();
    const unsubscribeGame = useGame.subscribe(sync);
    const unsubscribeApp = useAppStore.subscribe(sync);
    return () => {
      unsubscribeGame();
      unsubscribeApp();
    };
  }, [enabled]);
}

/** The first battle's coach marks over the command UI, and their announcements. */
export function CoachLayer() {
  const coach = useGuide((s) => s.coach);
  const step = useGuide((s) => s.step);
  const watchCallout = useGuide((s) => s.watchCallout);
  const stage = useGame((s) => s.stage);
  const scenario = useGame((s) => s.scenario);
  const view = useGame((s) => s.view);
  const selectedId = useAppStore((s) => s.selectedSquadId);
  const firstBattle = useFirstBattle();
  const active = coach === "active" && firstBattle;
  useCoachTriggers(active);
  if (!active) return null;

  // The one lesson (First Breach: give the Stoneford Riders the Clean Counterstroke card).
  const found = firstLesson(scenario);
  const company = found && view.squads.find((squad) => squad.id === found.squadId);
  const why = found && LESSON_WHY[`${found.squadId}:${found.doctrineId}`];
  const lesson =
    found && company && why
      ? { ...found, onLesson: selectedId === found.squadId, copy: (s: CoachStep) => lessonCopy(s, rosterName(company), doctrineLibrary[found.doctrineId].name, why, selectedId === found.squadId) }
      : null;
  const mark = markFor(step, stage, watchCallout, lesson);
  const copy = lesson && (step === "select" || step === "assign") ? lesson.copy(step) : COACH_COPY[step];
  return (
    <>
      <p className="sr-only" role="status" aria-live="polite">
        {mark || step === "chronicle" ? `Guide: ${copy.title}. ${copy.body}` : ""}
      </p>
      {mark}
    </>
  );
}

interface LessonMark {
  squadId: string;
  doctrineId: string;
  /** The lesson's company is the one selected. */
  onLesson: boolean;
  copy: (step: CoachStep) => CoachCopy;
}

function markFor(step: CoachStep, stage: string, watchCallout: number | null, lesson: LessonMark | null) {
  if (stage === "command") {
    const tab = (id: string) => find(`.roster .banner-tab.own[role="option"][data-squad="${id}"]`);
    switch (step) {
      case "select":
        return lesson ? (
          <CoachMark step="select" target={tab(lesson.squadId)} prefer="right" copy={lesson.copy("select")} />
        ) : (
          <CoachMark step="select" target={find('.roster .banner-tab.own[role="option"]')} prefer="right" />
        );
      case "read":
        return <CoachMark step="read" target={find(".inspector .insp-doctrine .doctrine-card")} prefer="left" />;
      case "assign":
        // The lesson's card in its company's hand; with another company selected, that company's tab first.
        if (lesson?.onLesson) {
          return <CoachMark step="assign" target={find(`.hand [role="option"][data-doctrine="${lesson.doctrineId}"]`)} prefer="above" copy={lesson.copy("assign")} />;
        }
        if (lesson) return <CoachMark step="assign" target={tab(lesson.squadId)} prefer="right" copy={lesson.copy("assign")} />;
        return <CoachMark step="assign" target={around(".hand-caption, .hand-cards")} prefer="above" />;
      case "seal":
        return <CoachMark step="seal" target={find(".wax-seal")} prefer="above" />;
      default:
        return null;
    }
  }
  if (stage === "resolving" && step === "watch" && watchCallout !== null) {
    return <CoachMark step="watch" target={find(`[data-callout-id="${watchCallout}"]`)} prefer="right" focusNext />;
  }
  return null;
}
