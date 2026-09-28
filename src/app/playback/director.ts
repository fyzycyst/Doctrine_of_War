// The playback director (T06): runs a phase timeline against the diorama's squad
// animator, advancing the displayed board state as each step lands. Every effect
// goes through injected hooks, so it runs headless in tests (no animator, fake timers).
import type { BoardLayout, HexCoord } from "../../game/board";
import { doctrineLibrary, type EngineEvent, type FactionId, type VisibleSquad, type VisibleState } from "../../game/engine";
import type { SquadAnimationApi } from "../../render/figures/squadAnimation";
import { figureCount } from "../../render/squadLayout";
import {
  applyStep,
  comeIntoView,
  fadeIntoFog,
  PACE_SCALE,
  routDirection,
  type Known,
  type Pace,
  type Step,
  type Timeline,
} from "./timeline";

/** Moves a squad on the display to `hex` (the end of a stretch it was seen walking). */
function placeAt(view: VisibleState, id: string, hex: HexCoord): VisibleState {
  return { ...view, squads: view.squads.map((squad) => (squad.id === id ? { ...squad, hex: { ...hex } } : squad)) };
}

export type SfxName = "clash" | "horn" | "card" | "seal" | "rout" | "dread" | "reveal";

export type CalloutKind = "rule" | "surge" | "waver" | "dread" | "rout" | "rally" | "gate" | "sighted" | "weather";

export interface CalloutSpec {
  kind: CalloutKind;
  /** Board anchor; null for a screen-level callout (weather). */
  hex: HexCoord | null;
  faction: FactionId | null;
  /** Small heading (the squad's name, "Heroic stand!", …). */
  title: string;
  /** The line itself (the rule, the dread title, the integrity change). */
  text: string;
  /** A rule the squad already showed this phase: drawn smaller. */
  repeat: boolean;
  linger: number;
}

export interface DirectorHooks {
  board: BoardLayout;
  playerFaction: FactionId;
  maxFigures: number;
  animator: () => SquadAnimationApi | null;
  pace: () => Pace;
  display: () => VisibleState;
  setDisplay: (view: VisibleState) => void;
  /** A squad that comes into view mid-phase, as it was at that step (snapshotBefore). */
  known: Known;
  setBeat: (beat: number) => void;
  callout: (spec: CalloutSpec) => void;
  focus: (hex: HexCoord | null) => void;
  shake: () => void;
  sfx: (name: SfxName) => void;
  /** Captions for screen readers and the playback bar. */
  caption: (text: string) => void;
  sleep: (ms: number) => Promise<void>;
}

/** Whether a fired rule's action is a hold (brace). */
function isHold(event: Extract<EngineEvent, { kind: "ruleFired" }>): boolean {
  return doctrineLibrary[event.doctrineId]?.rules.find((rule) => rule.id === event.ruleId)?.then.kind === "hold";
}

const capitalize = (text: string) => (text ? text[0].toUpperCase() + text.slice(1) : text);

const splitLabel = (label: string) => {
  const [when, then] = label.split(/\s*→\s*/);
  return then === undefined ? { when: "", then: capitalize(when) } : { when, then: capitalize(then) };
};

/** Waits re-read the pace this often (timeline ms), so a pace switch applies within a slice. */
export const WAIT_SLICE_MS = 120;

export class PlaybackDirector {
  private cancelled = false;
  private held = false;
  private paused = false;
  private resumers = new Set<() => void>();
  private animationScale = 1;
  private wakers = new Set<() => void>();

  constructor(
    private readonly timeline: Timeline,
    private readonly hooks: DirectorHooks,
  ) {}

  get skipped() {
    return this.cancelled;
  }

  /** Stop now; `run()` resolves "skipped" at once and the caller shows the final state. */
  skip() {
    this.cancelled = true;
    this.wakers.forEach((wake) => wake());
    this.wakers.clear();
    this.resumers.forEach((resume) => resume());
    this.resumers.clear();
  }

  /** Hold playback at the next slice boundary (the first-battle guide reads a callout). */
  pause() {
    this.paused = true;
  }

  resume() {
    this.paused = false;
    this.resumers.forEach((resume) => resume());
    this.resumers.clear();
  }

  /** Freeze on the current step until skip() (dev capture stills). */
  hold() {
    this.held = true;
  }

  /** Real time per timeline millisecond at the current pace (steps were built at the timeline's pace). */
  private scale(): number {
    return PACE_SCALE[this.hooks.pace()] / PACE_SCALE[this.timeline.pace];
  }

  /**
   * Keeps running animations in step with the pace: they were started with timeline-pace
   * durations, so they play at 1/scale speed.
   */
  private syncAnimations(scale: number) {
    if (scale === this.animationScale) return;
    this.animationScale = scale;
    this.hooks.animator()?.setTimeScale(1 / scale);
  }

  private sleepOnce(ms: number): Promise<void> {
    return new Promise((resolve) => {
      const done = () => {
        this.wakers.delete(done);
        resolve();
      };
      this.wakers.add(done);
      void this.hooks.sleep(ms).then(done);
    });
  }

  /**
   * A pace-aware, cancellable wait of `ms` timeline milliseconds. It runs in short
   * slices and re-reads the pace for each, so switching pace mid-step rescales the
   * rest of the current step, not just the next one.
   */
  private async wait(ms: number): Promise<void> {
    let remaining = ms;
    while (remaining > 0 && !this.cancelled && !this.held) {
      while (this.paused && !this.cancelled) {
        await new Promise<void>((resolve) => this.resumers.add(resolve));
      }
      const slice = Math.min(remaining, WAIT_SLICE_MS);
      const scale = this.scale();
      this.syncAnimations(scale);
      await this.sleepOnce(slice * scale);
      remaining -= slice;
    }
    if (this.held && !this.cancelled) {
      await new Promise<void>((resolve) => this.wakers.add(resolve));
    }
  }

  /** Waits for an animation, but never longer than `cap` ms (a lost promise cannot stall playback). */
  private settle(animation: Promise<unknown> | undefined, cap: number) {
    return animation ? Promise.race([animation.then(() => undefined), this.wait(cap)]) : Promise.resolve();
  }

  private squad(id: string | null) {
    return id ? this.hooks.display().squads.find((squad) => squad.id === id) : undefined;
  }

  private land(step: Step) {
    this.hooks.setDisplay(applyStep(this.hooks.display(), step, this.hooks.known));
  }

  async run(): Promise<"done" | "skipped"> {
    this.hooks.animator()?.reset();
    for (const step of this.timeline.steps) {
      if (this.cancelled) {
        break;
      }
      await this.play(step);
    }
    this.hooks.focus(null);
    this.syncAnimations(1);
    return this.cancelled ? "skipped" : "done";
  }

  private async play(step: Step) {
    const { hooks } = this;
    const anim = hooks.animator();
    const d = step.duration;
    const event = step.event;
    if (!event) {
      hooks.setBeat(step.beat);
      hooks.caption(`Beat ${step.beat} of 3`);
      await this.wait(d);
      return;
    }

    switch (event.kind) {
      case "ruleFired": {
        const squad = this.squad(event.squadId);
        if (squad?.hex && step.quiet) {
          hooks.caption(`${squad.name}: ${event.label}`);
        } else if (squad?.hex) {
          const { when, then } = splitLabel(event.label);
          hooks.callout({
            kind: "rule",
            hex: squad.hex,
            faction: squad.faction,
            title: squad.name,
            text: when ? `${when} → ${then}` : then,
            repeat: step.repeat,
            linger: step.linger,
          });
          hooks.caption(`${squad.name}: ${event.label}`);
          if (!step.repeat) hooks.focus(squad.hex);
          if (isHold(event)) void anim?.brace(event.squadId, { hold: Math.max(0.3, d / 1000) });
        }
        await this.wait(d);
        return;
      }

      case "move": {
        // Each run is a stretch the player saw; between runs the squad was out of sight.
        const legs = step.runs.reduce((sum, run) => sum + Math.max(0, run.length - 1), 0);
        const gaps = step.runs.length - 1;
        const gapMs = gaps > 0 ? Math.min(350, (d * 0.3) / gaps) : 0;
        const perHexMs = legs > 0 ? (d - gaps * gapMs) / legs : 0;
        for (const [runIndex, run] of step.runs.entries()) {
          const shown = this.squad(event.squadId);
          if (runIndex > 0) {
            const before = step.runs[runIndex - 1];
            hooks.setDisplay(fadeIntoFog(hooks.display(), event.squadId, before[before.length - 1]));
            await this.wait(gapMs);
            hooks.setDisplay(comeIntoView(hooks.display(), event.squadId, run[0], step, hooks.known));
            hooks.sfx("reveal");
          } else if (!shown || shown.lastKnown || shown.hex === null) {
            // Step out of the fog at the first seen hex; the Diorama plays its reveal.
            hooks.setDisplay(comeIntoView(hooks.display(), event.squadId, run[0], step, hooks.known));
            hooks.sfx("reveal");
            if (step.emerges) await this.wait(Math.min(300, d / 3));
          }
          const march = run.slice(1);
          hooks.focus(run[run.length - 1]);
          if (march.length > 0) {
            const walk = anim?.march(event.squadId, march, { secondsPerHex: Math.max(0.15, perHexMs / 1000) });
            await Promise.all([this.wait(perHexMs * march.length), this.settle(walk, perHexMs * march.length * 1.5)]);
            // Land each stretch so the next one starts from its end.
            hooks.setDisplay(placeAt(hooks.display(), event.squadId, run[run.length - 1]));
          } else if (legs === 0) {
            await this.wait(d);
          }
        }
        this.land(step);
        return;
      }

      case "engagement": {
        const attacker = this.squad(event.attackerId);
        const defender = this.squad(event.defenderId);
        hooks.focus(event.defenderHex);
        hooks.sfx("clash");
        hooks.caption(`${attacker?.name ?? "An unseen company"} ${event.charge ? "charged" : "struck"} ${defender?.name ?? "an unseen company"}`);
        void anim?.lunge(event.attackerId, event.defenderHex, { duration: (d * 0.7) / 1000 });
        await this.wait(d * 0.35);
        const topple = (squad: VisibleSquad | undefined) => {
          const lost = squad ? event.strengthChanges[squad.id] ?? 0 : 0;
          if (!squad || lost >= 0) return undefined;
          const count = figureCount(squad.strength, hooks.maxFigures) - figureCount(Math.max(0, squad.strength + lost), hooks.maxFigures);
          return count > 0 ? anim?.fall(squad.id, count, { duration: (d * 0.55) / 1000 }) : undefined;
        };
        const falls = Promise.all([topple(defender), topple(attacker)]);
        await Promise.all([this.wait(d * 0.65), this.settle(falls, d)]);
        this.land(step);
        return;
      }

      case "rally": {
        const target = this.squad(event.targetId);
        hooks.sfx("horn");
        if (target?.hex) {
          hooks.focus(target.hex);
          hooks.callout({ kind: "rally", hex: target.hex, faction: target.faction, title: "Rallied", text: `+${event.restored} cohesion`, repeat: false, linger: step.linger });
          hooks.caption(`${this.squad(event.sourceId)?.name ?? "An unseen company"} rallied ${target.name}`);
        }
        void anim?.rally(event.targetId ?? "");
        if (event.sourceId) void anim?.rally(event.sourceId);
        await this.wait(d);
        this.land(step);
        return;
      }

      case "rout":
      case "exit": {
        const squad = this.squad(event.squadId);
        hooks.focus(event.hex);
        if (event.kind === "rout") {
          hooks.sfx("rout");
          hooks.callout({
            kind: "rout",
            hex: event.hex,
            faction: squad?.faction ?? null,
            title: squad?.name ?? "A company",
            text: event.cause === "strength" ? "Destroyed" : "Broken! They flee",
            repeat: false,
            linger: step.linger,
          });
        }
        hooks.caption(`${squad?.name ?? "A company"} ${event.kind === "exit" ? "escaped the field" : event.cause === "strength" ? "was destroyed" : "broke and fled"}`);
        const faction = squad?.faction ?? hooks.playerFaction;
        const direction = routDirection(hooks.board, event.hex, faction);
        // Hemmed in on every side: no line of flight, so the company breaks where it stands.
        const run = direction
          ? anim?.rout(event.squadId, { direction, duration: d / 1000 })
          : anim?.fall(event.squadId, figureCount(squad?.strength ?? 100, hooks.maxFigures), { duration: d / 1000 });
        await Promise.all([this.wait(d), this.settle(run, d * 1.5)]);
        this.land(step);
        anim?.reset(event.squadId);
        return;
      }

      case "fortune": {
        const squad = this.squad(event.squadId);
        if (squad?.hex) {
          const surge = event.outcome === "surge";
          hooks.focus(squad.hex);
          hooks.callout({
            kind: surge ? "surge" : "waver",
            hex: squad.hex,
            faction: squad.faction,
            title: surge ? "Heroic stand!" : "Wavering…",
            text: surge ? `${squad.name} holds and strikes harder` : `${squad.name} hesitates; its order fails`,
            repeat: false,
            linger: step.linger,
          });
          hooks.caption(surge ? `Heroic stand! ${squad.name} surges` : `Wavering… ${squad.name}'s order fails`);
          if (surge) void anim?.rally(squad.id);
        }
        await this.wait(d);
        this.land(step);
        return;
      }

      case "dread": {
        const squad = this.squad(event.squadId);
        hooks.sfx("dread");
        if (squad?.hex) {
          hooks.focus(squad.hex);
          hooks.callout({ kind: "dread", hex: squad.hex, faction: squad.faction, title: "They know that banner…", text: `“${event.title}” · −${event.shock} cohesion`, repeat: false, linger: step.linger });
          hooks.caption(`They know that banner… ${squad.name} falters before “${event.title}”`);
        }
        await this.wait(d);
        this.land(step);
        return;
      }

      case "objectiveDamage": {
        const objective = hooks.display().objectives.find((item) => item.id === event.objectiveId);
        hooks.focus(event.hex);
        hooks.sfx("clash");
        // The gate itself jolts (with dust and stones) in 3D; the flat board shake is only
        // the fallback when there is no animator (headless or not yet mounted).
        if (anim) {
          void anim.shakeObjective(event.hex, Math.max(0.4, Math.min(1.2, (event.oldIntegrity - event.newIntegrity) / 30)));
        } else {
          hooks.shake();
        }
        hooks.callout({ kind: "gate", hex: event.hex, faction: null, title: objective?.name ?? "The gate", text: `${event.oldIntegrity} → ${event.newIntegrity}`, repeat: false, linger: step.linger });
        hooks.caption(`${objective?.name ?? "The gate"} battered: ${event.oldIntegrity} to ${event.newIntegrity}`);
        if (event.attackerId) void anim?.lunge(event.attackerId, event.hex, { duration: (d * 0.6) / 1000 });
        await this.wait(d);
        this.land(step);
        return;
      }

      case "weatherShift":
        hooks.callout({ kind: "weather", hex: null, faction: null, title: "The weather turns", text: event.to === "ashWind" ? "Ash-wind" : event.to[0].toUpperCase() + event.to.slice(1), repeat: false, linger: step.linger });
        hooks.caption(`The weather turns: ${event.to}`);
        await this.wait(d);
        this.land(step);
        return;

      case "sighted": {
        const before = this.squad(event.squadId);
        this.land(step);
        if (!before || before.lastKnown) {
          const seen = this.squad(event.squadId);
          hooks.sfx("reveal");
          hooks.callout({ kind: "sighted", hex: event.hex, faction: seen?.faction ?? null, title: "Sighted", text: seen?.name ?? "An enemy company", repeat: false, linger: step.linger });
        }
        await this.wait(d);
        return;
      }

      case "outcome":
        this.land(step);
        await this.wait(d);
        return;

      case "blocked":
        return;
    }
  }
}
