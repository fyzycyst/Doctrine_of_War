import { FastForward } from "lucide-react";
import { useEffect, useRef, type RefObject } from "react";
import { playSfx } from "../../audio";
import type { SquadAnimationApi } from "../../render/figures/squadAnimation";
import { emberDusk } from "../../render/skins";
import { useGame } from "../game/gameStore";
import { FIRST_BATTLE } from "../guide/coach";
import { useGuide } from "../guide/guideStore";
import { PlaybackDirector } from "../playback/director";
import { buildTimeline, snapshotBefore } from "../playback/timeline";

declare global {
  interface Window {
    /** Dev capture: set when a `?pauseAt=` playback freezes on its step. */
    __playbackFrozen?: { ready: boolean; frames: number };
  }
}

/**
 * Runs the phase playback while the stage is "resolving" (T06): builds the timeline
 * from the player's projected events and drives the director against the diorama.
 * Remounts per run (key = runId), so a replay starts clean.
 */
export function Playback({
  animation,
  pauseAt,
  headless = false,
}: {
  animation: RefObject<SquadAnimationApi | null>;
  pauseAt?: string;
  /** No bar (capture mode): the phase still plays on the board. */
  headless?: boolean;
}) {
  const runId = useGame((s) => s.runId);
  const director = useRef<PlaybackDirector | null>(null);
  const skipButton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const game = useGame.getState();
    const entry = game.log[game.log.length - 1];
    if (!entry) {
      game.finishPlayback();
      return undefined;
    }
    let alive = true;
    let frozen = false;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const later = (ms: number, fn: () => void) => {
      const timer = setTimeout(() => {
        timers.delete(timer);
        fn();
      }, ms / Math.max(0.001, useGame.getState().playbackSpeed));
      timers.add(timer);
    };
    const final = game.view;
    const factions = new Map([...entry.start.squads, ...final.squads].map((squad) => [squad.id, squad.faction]));
    const timeline = buildTimeline(entry.events, game.pace, {
      playerFaction: game.scenario.playerFaction,
      factionOf: (id) => factions.get(id),
    });

    const run = new PlaybackDirector(timeline, {
      board: game.scenario.board,
      playerFaction: game.scenario.playerFaction,
      maxFigures: emberDusk.figures.maxFigures,
      animator: () => animation.current,
      pace: () => useGame.getState().pace,
      display: () => useGame.getState().display ?? entry.start,
      setDisplay: (display) => useGame.getState().setPlayback({ display }),
      // Emerging squads start as they were when first seen, not as they end the phase.
      known: (id, step) => snapshotBefore(final.squads.find((squad) => squad.id === id), entry.events, step.index),
      setBeat: (beat) => useGame.getState().setPlayback({ beat }),
      callout: (spec) => {
        const id = useGame.getState().pushCallout(spec);
        // First battle: the guide stops on the first of your rule banners so it can be read.
        const guide = useGuide.getState();
        const teach =
          guide.coach === "active" &&
          guide.step === "watch" &&
          guide.watchCallout === null &&
          game.baseScenario.id === FIRST_BATTLE &&
          spec.kind === "rule" &&
          spec.faction === game.scenario.playerFaction &&
          !spec.repeat;
        if (teach) {
          guide.pinCallout(id);
          run.pause();
          animation.current?.pause();
          if (import.meta.env.DEV) later(500, () => (window.__playbackFrozen = { ready: true, frames: 9999 }));
          return;
        }
        later(spec.linger, () => {
          if (!frozen) useGame.getState().dropCallout(id);
        });
        const match = pauseAt === spec.kind || (pauseAt === "rule-mine" && spec.kind === "rule" && spec.faction === game.scenario.playerFaction && !spec.repeat);
        if (import.meta.env.DEV && match && !frozen) {
          frozen = true;
          freeze(run, animation.current, later);
        }
      },
      focus: (focus) => useGame.getState().setPlayback({ focus }),
      shake: () => useGame.getState().setPlayback({ shakeAt: performance.now() }),
      sfx: (name) => playSfx(name),
      caption: (caption) => useGame.getState().setPlayback({ caption }),
      sleep: (ms) => new Promise((resolve) => later(ms, resolve)),
    });
    director.current = run;
    skipButton.current?.focus({ preventScroll: true });
    void boardReady(Boolean(import.meta.env.DEV && pauseAt))
      .then(() => (alive ? run.run() : "skipped"))
      .then(() => {
        if (alive) {
          useGame.getState().finishPlayback();
        }
      });

    // When the "watch" mark is answered (or the guide skipped), carry on and let its banner go.
    const unsubscribeGuide = useGuide.subscribe((guide, before) => {
      const pinned = before.watchCallout;
      if (pinned !== null && (guide.step !== "watch" || guide.coach !== "active")) {
        useGuide.getState().pinCallout(null);
        animation.current?.resume();
        run.resume();
        later(600, () => useGame.getState().dropCallout(pinned));
      }
    });

    return () => {
      alive = false;
      unsubscribeGuide();
      if (useGuide.getState().watchCallout !== null) useGuide.getState().pinCallout(null);
      run.skip();
      timers.forEach(clearTimeout);
      animation.current?.reset();
    };
  }, [runId, animation, pauseAt]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === " " || event.key === "Escape") {
        event.preventDefault();
        director.current?.skip();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return headless ? null : <PlaybackBar skipRef={skipButton} onSkip={() => director.current?.skip()} />;
}

/** Dev capture boots straight into playback; wait for the board so the still has figures. */
function boardReady(wait: boolean): Promise<void> {
  if (!wait) return Promise.resolve();
  return new Promise((resolve) => {
    const poll = () => (window.__battleBoard?.ready ? resolve() : setTimeout(poll, 100));
    poll();
  });
}

/** Dev capture: hold the scene still a moment after the chosen callout appears. */
function freeze(run: PlaybackDirector, animator: SquadAnimationApi | null, later: (ms: number, fn: () => void) => void) {
  run.hold();
  later(450, () => {
    animator?.pause();
    window.__playbackFrozen = { ready: true, frames: 9999 };
  });
}

function PlaybackBar({ skipRef, onSkip }: { skipRef: RefObject<HTMLButtonElement | null>; onSkip: () => void }) {
  const beat = useGame((s) => s.beat);
  const caption = useGame((s) => s.caption);
  const callouts = useGame((s) => s.callouts);
  const weather = callouts.filter((callout) => callout.hex === null);

  return (
    <>
      {weather.map((callout) => (
        <div key={callout.id} className="callout callout-weather screen" role="status">
          <span className="callout-title">{callout.title}</span>
          <span className="callout-text">{callout.text}</span>
        </div>
      ))}
      <div className="playback-bar">
        <div className="beat-indicator" role="img" aria-label={beat > 0 ? `Beat ${beat} of 3` : "The phase begins"}>
          <span className="beat-label" aria-hidden="true">
            {beat > 0 ? `Beat ${beat}/3` : "Orders sealed"}
          </span>
          <span className="pips" aria-hidden="true">
            {[1, 2, 3].map((n) => (
              <span key={n} className={`pip ${n < beat ? "done" : n === beat ? "now" : ""}`} />
            ))}
          </span>
        </div>
        <p className="playback-caption" aria-live="polite">
          {caption}
        </p>
        <button ref={skipRef} type="button" className="btn-quiet skip" onClick={onSkip}>
          <FastForward size={14} aria-hidden="true" /> Skip
          <kbd>Space</kbd>
        </button>
      </div>
    </>
  );
}
