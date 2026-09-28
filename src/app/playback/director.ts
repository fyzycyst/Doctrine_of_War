// The playback director (T06): runs a phase timeline against the diorama's squad
// animator, advancing the displayed board state as each step lands. Every effect
// goes through injected hooks, so it runs headless in tests (no animator, fake timers).
import type { BoardLayout, HexCoord } from "../../game/board";
import { doctrineLibrary, type EngineEvent, type FactionId, type VisibleSquad, type VisibleState } from "../../game/engine";
import type { SquadAnimationApi } from "../../render/figures/squadAnimation";
import { figureCount } from "../../render/squadLayout";
import { applyStep, PACE_SCALE, routDirection, type Pace, type Step, type Timeline } from "./timeline";

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
  /** The phase's final view: where squads that emerge mid-phase come from. */
  known: (id: string) => VisibleSquad | undefined;
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

export class PlaybackDirector {
  private cancelled = false;
  private held = false;
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
  }

  /** Freeze on the current step until skip() (dev capture stills). */
  hold() {
    this.held = true;
  }

  /** A pace-aware, cancellable wait. Step times were built at the timeline's pace. */
  private wait(ms: number): Promise<void> {
    if (this.cancelled || (ms <= 0 && !this.held)) {
      return Promise.resolve();
    }
    if (this.held) {
      return new Promise((resolve) => this.wakers.add(resolve));
    }
    const scaled = ms * (PACE_SCALE[this.hooks.pace()] / PACE_SCALE[this.timeline.pace]);
    return new Promise((resolve) => {
      const done = () => {
        this.wakers.delete(done);
        resolve();
      };
      this.wakers.add(done);
      void this.hooks.sleep(scaled).then(done);
    });
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
        const known = this.squad(event.squadId);
        if (step.emerges && (!known || known.lastKnown || known.hex === null)) {
          // Step out of the fog at the first seen hex; the Diorama plays its reveal.
          this.hooks.setDisplay(applyStep(hooks.display(), { ...step, path: [step.path[0]], vanishes: false }, hooks.known));
          hooks.sfx("reveal");
          await this.wait(Math.min(300, d / 3));
        }
        const from = this.squad(event.squadId)?.hex;
        const path = from && step.path.length > 1 ? step.path.slice(1) : [];
        hooks.focus(step.path[step.path.length - 1]);
        if (path.length > 0) {
          const march = anim?.march(event.squadId, path, { secondsPerHex: Math.max(0.15, d / 1000 / Math.max(1, path.length)) });
          await Promise.all([this.wait(d), this.settle(march, d * 1.5)]);
        } else {
          await this.wait(d);
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
        const run = anim?.rout(event.squadId, { direction: routDirection(hooks.board, event.hex, faction), duration: d / 1000 });
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
        hooks.shake();
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
