import type { HexCoord } from "../../game/board";
import { mulberry32 } from "../hexWorld";

/**
 * Procedural squad animations as instance tweens (T05 scope C).
 *
 * The animator is plain TS (no three.js), ticked once per frame by the diorama.
 * Renderers ask it for a per-squad pose (anchor offset, facing, banner/ring
 * effects) and per-figure poses (offset, lean/tilt, scale, fade), then compose
 * those on top of the squad's placement. T06 (playback) drives it through the
 * `SquadAnimationApi` methods; each returns a Promise that resolves when the
 * animation finishes. There is no timeline logic here.
 *
 * Figure index = survival rank from `formationOrder` (0 = last to fall), so
 * `fall(n)` topples exactly the figures that disappear when strength drops.
 */

export interface WorldPoint {
  x: number;
  y: number;
  z: number;
}

export interface FigurePose {
  /** World-space offset added after the squad transform. */
  dx: number;
  dy: number;
  dz: number;
  /** Extra yaw (radians) on top of the squad facing + slot jitter. */
  yaw: number;
  /** Forward lean (+ = toward facing) and sideways lean, radians. */
  lean: number;
  roll: number;
  /** Uniform scale and extra vertical squash. */
  scale: number;
  scaleY: number;
  /** Multiplier on the formation slot offset (brace tightens ranks). */
  spread: number;
  /** 0..1 dithered visibility. */
  fade: number;
  /** Suppress the idle bob while a tween is driving the figure. */
  still: boolean;
}

export interface SquadPose {
  /** Overrides the placement anchor (e.g. mid-march or after a march). */
  anchor: WorldPoint | null;
  /** Overrides the squad facing (radians) when set. */
  facing: number | null;
  bannerLift: number;
  bannerTilt: number;
  bannerFlare: number;
  bannerFade: number;
  ringFlash: number;
  ringFade: number;
}

export interface MarchOptions {
  secondsPerHex?: number;
}
export interface LungeOptions {
  duration?: number;
}
export interface FallOptions {
  duration?: number;
}
export interface RoutOptions {
  duration?: number;
  /** World (x, z) direction to flee; defaults to the faction's home edge. */
  direction?: [number, number];
}
export interface BraceOptions {
  hold?: number;
}

/** What T06 calls. Every method resolves when its animation completes. */
export interface SquadAnimationApi {
  march(squadId: string, path: HexCoord[], opts?: MarchOptions): Promise<void>;
  lunge(squadId: string, targetHex: HexCoord, opts?: LungeOptions): Promise<void>;
  fall(squadId: string, count: number, opts?: FallOptions): Promise<void>;
  rout(squadId: string, opts?: RoutOptions): Promise<void>;
  rally(squadId: string): Promise<void>;
  brace(squadId: string, opts?: BraceOptions): Promise<void>;
  /**
   * Fog of war: a newly sighted squad resolves out of the mist: figures rise
   * and dither in front rank first, the banner unfurls, the ring draws on.
   * The Diorama calls this itself when `visibility` reveals a squad.
   */
  reveal(squadId: string, opts?: { duration?: number }): Promise<void>;
  /** Clears all persistent animation state (one squad, or all). */
  reset(squadId?: string): void;
  /** Playback speed for every tween (1 = normal, 0.5 = half, 0 = frozen). */
  setTimeScale(scale: number): void;
  /** Freeze every tween where it is; `resume()` restores the previous speed. */
  pause(): void;
  resume(): void;
  /**
   * An objective takes a hit: the gate/wall jolts (scaled by `intensity`,
   * 0..1+), with a dust burst and a few falling stones at `hex`.
   */
  shakeObjective(hex: HexCoord, intensity?: number): Promise<void>;
}

/** An objective hit in progress (read by the renderer's ObjectiveFX). */
export interface ObjectiveShake {
  id: number;
  at: WorldPoint;
  intensity: number;
  /** Seconds since the hit. */
  t: number;
  duration: number;
}

/** What the animator needs from the scene (kept abstract for tests). */
export interface AnimatorScene {
  /** Current placement anchor and facing of a squad, from props. */
  squad(squadId: string): { anchor: WorldPoint; facing: number; alive: number; home: [number, number] } | undefined;
  /** World position of a hex centre on the board surface. */
  hexWorld(hex: HexCoord): WorldPoint | undefined;
}

export const MAX_FIGURES = 9;

interface Tween {
  squadId: string;
  start: number;
  duration: number;
  apply: (u: number, t: number, state: SquadAnimState) => void;
  commit?: (state: SquadAnimState) => void;
  resolve: () => void;
}

interface SquadAnimState {
  pose: SquadPose;
  figures: FigurePose[];
  /** Persistent: survives the end of the tween that set it. */
  anchor: WorldPoint | null;
  facing: number | null;
  /** Anchor at the moment the persistent override was set (to detect prop updates). */
  propAnchor: WorldPoint | null;
  fallen: Set<number>;
  routed: boolean;
}

const neutralFigure = (): FigurePose => ({
  dx: 0,
  dy: 0,
  dz: 0,
  yaw: 0,
  lean: 0,
  roll: 0,
  scale: 1,
  scaleY: 1,
  spread: 1,
  fade: 1,
  still: false,
});

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const easeOutCubic = (u: number) => 1 - Math.pow(1 - u, 3);
const easeInOut = (u: number) => (u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2);
const easeInQuad = (u: number) => u * u;
const lerp = (a: number, b: number, u: number) => a + (b - a) * u;
const lerpAngle = (a: number, b: number, u: number) => {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * u;
};
/** Yaw that turns local +x toward a world (dx, dz) direction (three's yaw convention). */
export const yawToward = (dx: number, dz: number) => Math.atan2(-dz, dx);

export class SquadAnimator implements SquadAnimationApi {
  private time = 0;
  private tweens: Tween[] = [];
  /** 1 = normal speed; 0 freezes every tween (used by the lab for stills). */
  timeScale = 1;
  private pausedScale: number | null = null;
  private shakes: Array<{ id: number; at: WorldPoint; intensity: number; start: number; duration: number; resolve: () => void }> = [];
  private shakeIds = 0;
  private states = new Map<string, SquadAnimState>();

  constructor(private scene: AnimatorScene) {}

  setScene(scene: AnimatorScene) {
    this.scene = scene;
  }

  get now() {
    return this.time;
  }

  get activeCount() {
    return this.tweens.length;
  }

  /** Advance all tweens by dt seconds and rebuild poses. */
  tick(dt: number) {
    this.time += dt * this.timeScale;
    // Fresh transient poses from persistent state.
    for (const [id, st] of this.states) {
      const info = this.scene.squad(id);
      // A prop update that moved the squad to (or away from) the override clears it.
      if (st.anchor && info && st.propAnchor && dist(info.anchor, st.propAnchor) > 1e-3) {
        st.anchor = null;
        st.facing = null;
        st.propAnchor = null;
      }
      st.pose = {
        anchor: st.anchor,
        facing: st.facing,
        bannerLift: 0,
        bannerTilt: 0,
        bannerFlare: 0,
        bannerFade: st.routed ? 0 : 1,
        ringFlash: 0,
        ringFade: st.routed ? 0 : 1,
      };
      st.figures = Array.from({ length: MAX_FIGURES }, (_, i) => {
        const f = neutralFigure();
        if (st.routed || st.fallen.has(i)) f.fade = 0;
        return f;
      });
    }
    if (this.shakes.length) {
      const done = this.shakes.filter((s) => this.time - s.start >= s.duration);
      if (done.length) {
        this.shakes = this.shakes.filter((s) => !done.includes(s));
        done.forEach((s) => s.resolve());
      }
    }
    const finished: Tween[] = [];
    for (const tw of this.tweens) {
      const st = this.state(tw.squadId);
      const t = this.time - tw.start;
      const u = clamp01(t / tw.duration);
      tw.apply(u, t, st);
      if (u >= 1) finished.push(tw);
    }
    if (finished.length) {
      this.tweens = this.tweens.filter((tw) => !finished.includes(tw));
      for (const tw of finished) {
        tw.commit?.(this.state(tw.squadId));
        tw.resolve();
      }
    }
  }

  squadPose(id: string): SquadPose | undefined {
    return this.states.get(id)?.pose;
  }

  figurePose(id: string, index: number): FigurePose | undefined {
    return this.states.get(id)?.figures[index];
  }

  /** True if the figure should be drawn at all (not fallen/routed and faded out). */
  isGone(id: string, index: number): boolean {
    const st = this.states.get(id);
    if (!st) return false;
    return st.routed || st.fallen.has(index) ? (st.figures[index]?.fade ?? 0) <= 0 : false;
  }

  setTimeScale(scale: number) {
    this.timeScale = Math.max(0, scale);
    this.pausedScale = null;
  }

  pause() {
    if (this.pausedScale === null) this.pausedScale = this.timeScale;
    this.timeScale = 0;
  }

  resume() {
    this.timeScale = this.pausedScale ?? (this.timeScale || 1);
    this.pausedScale = null;
  }

  shakeObjective(hex: HexCoord, intensity = 1): Promise<void> {
    const at = this.scene.hexWorld(hex);
    if (!at) return Promise.resolve();
    const duration = 1.4;
    return new Promise((resolve) => {
      this.shakes.push({ id: (this.shakeIds += 1), at, intensity: Math.max(0, intensity), start: this.time, duration, resolve });
    });
  }

  /** Objective hits still playing, with their local time. */
  activeShakes(): ObjectiveShake[] {
    return this.shakes.map((s) => ({ id: s.id, at: s.at, intensity: s.intensity, t: this.time - s.start, duration: s.duration }));
  }

  reset(squadId?: string) {
    const drop = (id: string) => {
      this.tweens.filter((tw) => tw.squadId === id).forEach((tw) => tw.resolve());
      this.tweens = this.tweens.filter((tw) => tw.squadId !== id);
      this.states.delete(id);
    };
    if (squadId) drop(squadId);
    else [...new Set([...this.states.keys(), ...this.tweens.map((t) => t.squadId)])].forEach(drop);
  }

  // --- API ------------------------------------------------------------------

  march(squadId: string, path: HexCoord[], opts: MarchOptions = {}): Promise<void> {
    const info = this.scene.squad(squadId);
    if (!info) return Promise.resolve();
    const st = this.state(squadId);
    const start = st.anchor ?? info.anchor;
    const points = [start, ...path.map((h) => this.scene.hexWorld(h)).filter((p): p is WorldPoint => !!p)].filter(
      (p, i, arr) => i === 0 || dist(p, arr[i - 1]) > 1e-3,
    );
    if (points.length < 2) return Promise.resolve();
    const perHex = opts.secondsPerHex ?? 0.8;
    const legs = points.length - 1;
    const startFacing = st.facing ?? info.facing;
    const rand = mulberry32(hashId(squadId) + 11);
    const lag = Array.from({ length: MAX_FIGURES }, () => rand() * 0.6);
    let lastYaw = startFacing;
    return this.add(squadId, perHex * legs, (u, t, s) => {
      const pos = u * legs;
      const leg = Math.min(legs - 1, Math.floor(pos));
      const lu = easeInOut(pos - leg);
      const a = points[leg];
      const b = points[leg + 1];
      const hop = Math.abs(b.y - a.y) > 0.05 ? Math.sin(Math.PI * lu) * 0.12 : 0;
      s.pose.anchor = { x: lerp(a.x, b.x, lu), y: lerp(a.y, b.y, lu) + hop, z: lerp(a.z, b.z, lu) };
      const dirYaw = yawToward(b.x - a.x, b.z - a.z);
      lastYaw = lerpAngle(lastYaw, dirYaw, Math.min(1, 0.25 + (u < 0.02 ? 0 : 0.2)));
      s.pose.facing = lastYaw;
      s.pose.bannerTilt = -0.12;
      s.figures.forEach((f, i) => {
        const step = t * 11 + lag[i] * 8;
        f.dy = Math.abs(Math.sin(step)) * 0.022;
        f.lean = 0.12;
        f.roll = Math.sin(step) * 0.05;
        f.still = true;
      });
    }, (s) => {
      const end = points[points.length - 1];
      s.anchor = end;
      s.facing = lastYaw;
      s.propAnchor = this.scene.squad(squadId)?.anchor ?? null;
    });
  }

  lunge(squadId: string, targetHex: HexCoord, opts: LungeOptions = {}): Promise<void> {
    const info = this.scene.squad(squadId);
    const target = this.scene.hexWorld(targetHex);
    if (!info || !target) return Promise.resolve();
    const st = this.state(squadId);
    const from = st.anchor ?? info.anchor;
    const dx = target.x - from.x;
    const dz = target.z - from.z;
    const len = Math.hypot(dx, dz) || 1;
    const reach = Math.min(0.42, len * 0.45);
    const nx = dx / len;
    const nz = dz / len;
    const faceTo = yawToward(dx, dz);
    const baseFacing = st.facing ?? info.facing;
    const rand = mulberry32(hashId(squadId) + 23);
    const delay = Array.from({ length: MAX_FIGURES }, () => rand() * 0.14);
    return this.add(squadId, opts.duration ?? 0.95, (u, _t, s) => {
      const turn = u < 0.2 ? easeOutCubic(u / 0.2) : u > 0.8 ? 1 - easeInOut((u - 0.8) / 0.2) : 1;
      s.pose.facing = lerpAngle(baseFacing, faceTo, turn);
      s.pose.bannerTilt = 0.25 * turn;
      s.figures.forEach((f, i) => {
        const v = clamp01((u - delay[i]) / (1 - delay[i]));
        let amt: number;
        if (v < 0.35) amt = easeOutCubic(v / 0.35);
        else if (v < 0.55) amt = 1;
        else amt = 1 - easeInOut((v - 0.55) / 0.45);
        const jab = v > 0.3 && v < 0.6 ? Math.sin(((v - 0.3) / 0.3) * Math.PI) : 0;
        f.dx = nx * reach * amt;
        f.dz = nz * reach * amt;
        f.dy = Math.sin(Math.PI * Math.min(1, v / 0.35)) * 0.03 * (v < 0.35 ? 1 : 0);
        f.lean = 0.25 * amt + 0.35 * jab;
        f.still = true;
      });
    });
  }

  fall(squadId: string, count: number, opts: FallOptions = {}): Promise<void> {
    const info = this.scene.squad(squadId);
    if (!info || count <= 0) return Promise.resolve();
    const st = this.state(squadId);
    // Topple the lowest-ranked standing figures: the ones strength loss removes next.
    const standing = Array.from({ length: info.alive }, (_, i) => i).filter((i) => !st.fallen.has(i));
    const victims = standing.slice(-Math.min(count, standing.length));
    if (victims.length === 0) return Promise.resolve();
    const rand = mulberry32(hashId(squadId) + 37 + st.fallen.size);
    const plan = victims.map((index, k) => ({
      index,
      delay: k * 0.09 + rand() * 0.08,
      dir: rand() * Math.PI * 2,
    }));
    const duration = opts.duration ?? 1.7;
    return this.add(
      squadId,
      duration,
      (_u, t, s) => {
        for (const p of plan) {
          const f = s.figures[p.index];
          const lt = Math.max(0, t - p.delay);
          // Topple under gravity with a small bounce, then dither away.
          const topple = Math.min(1, lt / 0.42);
          let angle = easeInQuad(topple) * (Math.PI / 2);
          if (topple >= 1) angle = Math.PI / 2 - Math.abs(Math.sin((lt - 0.42) * 18)) * Math.exp(-(lt - 0.42) * 9) * 0.25;
          f.lean = Math.cos(p.dir) * angle;
          f.roll = Math.sin(p.dir) * angle;
          f.dy = -0.012 * topple;
          f.fade = 1 - clamp01((lt - 0.75) / 0.7);
          f.still = true;
        }
        s.pose.ringFlash = Math.max(s.pose.ringFlash, -0.5 * Math.sin(Math.PI * clamp01(t / 0.6)));
      },
      (s) => victims.forEach((i) => s.fallen.add(i)),
    );
  }

  rout(squadId: string, opts: RoutOptions = {}): Promise<void> {
    const info = this.scene.squad(squadId);
    if (!info) return Promise.resolve();
    const [hx, hz] = opts.direction ?? info.home;
    const hl = Math.hypot(hx, hz) || 1;
    const baseYaw = yawToward(hx / hl, hz / hl);
    const rand = mulberry32(hashId(squadId) + 51);
    const runners = Array.from({ length: MAX_FIGURES }, () => {
      const yaw = baseYaw + (rand() - 0.5) * 1.2;
      return { yaw, dist: 3.2 + rand() * 1.8, delay: rand() * 0.35, cadence: 13 + rand() * 4 };
    });
    const duration = opts.duration ?? 2.6;
    return this.add(
      squadId,
      duration,
      (u, t, s) => {
        s.pose.bannerTilt = -1.2 * easeOutCubic(clamp01(t / 0.8));
        s.pose.bannerFade = 1 - clamp01((t - 0.5) / 0.8);
        s.pose.ringFade = 1 - clamp01(t / 0.6);
        runners.forEach((r, i) => {
          const f = s.figures[i];
          const lt = Math.max(0, t - r.delay);
          const run = easeInQuad(clamp01(lt / (duration - r.delay))) * r.dist;
          const dirX = Math.cos(r.yaw);
          const dirZ = -Math.sin(r.yaw);
          f.dx = dirX * run;
          f.dz = dirZ * run;
          f.dy = Math.abs(Math.sin(lt * r.cadence)) * 0.03;
          f.yaw = lerpAngle(0, r.yaw - (s.pose.facing ?? info.facing), clamp01(lt / 0.25));
          f.lean = 0.3;
          f.fade = Math.min(f.fade, 1 - clamp01((u - 0.6) / 0.4));
          f.still = true;
        });
      },
      (s) => {
        s.routed = true;
      },
    );
  }

  rally(squadId: string): Promise<void> {
    if (!this.scene.squad(squadId)) return Promise.resolve();
    const rand = mulberry32(hashId(squadId) + 67);
    const delay = Array.from({ length: MAX_FIGURES }, () => rand() * 0.12);
    return this.add(squadId, 0.8, (u, _t, s) => {
      const pulse = Math.sin(Math.PI * u);
      s.pose.bannerLift = 0.14 * pulse;
      s.pose.bannerFlare = 1.6 * pulse;
      s.pose.ringFlash = Math.max(s.pose.ringFlash, 1.5 * pulse);
      s.figures.forEach((f, i) => {
        const v = clamp01((u - delay[i]) / 0.7);
        const hop = Math.sin(Math.PI * v);
        f.dy += hop * 0.05;
        f.scale *= 1 + 0.1 * hop;
        f.lean = 0;
        f.roll = 0;
        f.still = true;
      });
    });
  }

  brace(squadId: string, opts: BraceOptions = {}): Promise<void> {
    if (!this.scene.squad(squadId)) return Promise.resolve();
    const hold = opts.hold ?? 1.2;
    const inT = 0.25;
    const outT = 0.35;
    const total = inT + hold + outT;
    return this.add(squadId, total, (_u, t, s) => {
      const k = t < inT ? easeOutCubic(t / inT) : t > inT + hold ? 1 - easeInOut((t - inT - hold) / outT) : 1;
      s.pose.bannerTilt = -0.05 * k;
      s.figures.forEach((f) => {
        f.scaleY *= 1 - 0.12 * k;
        f.spread *= 1 - 0.18 * k;
        f.lean = -0.1 * k;
        f.dy -= 0.004 * k;
        f.still = f.still || k > 0.01;
      });
    });
  }

  reveal(squadId: string, opts: { duration?: number } = {}): Promise<void> {
    if (!this.scene.squad(squadId)) return Promise.resolve();
    const st = this.state(squadId);
    st.routed = false;
    const rand = mulberry32(hashId(squadId) + 83);
    // Front rank (low survival index ≈ random here) first, with jitter.
    const delay = Array.from({ length: MAX_FIGURES }, (_, i) => i * 0.06 + rand() * 0.18);
    const duration = opts.duration ?? 1.5;
    return this.add(squadId, duration, (_u, t, s) => {
      s.pose.ringFade = clamp01((t - 0.2) / 0.6);
      s.pose.ringFlash = Math.max(s.pose.ringFlash, 1.2 * Math.sin(Math.PI * clamp01((t - 0.2) / 0.9)));
      const bt = clamp01((t - 0.35) / 0.7);
      s.pose.bannerFade = easeOutCubic(bt);
      s.pose.bannerLift = 0.08 * Math.sin(Math.PI * bt);
      s.pose.bannerFlare = 0.8 * Math.sin(Math.PI * bt);
      s.figures.forEach((f, i) => {
        const v = clamp01((t - delay[i]) / 0.75);
        const e = easeOutCubic(v);
        f.fade = Math.min(f.fade, v);
        f.dy += -0.09 * (1 - e);
        f.scaleY *= 0.7 + 0.3 * e;
        f.still = v < 1;
      });
    });
  }

  // --- internals -------------------------------------------------------------

  private add(
    squadId: string,
    duration: number,
    apply: Tween["apply"],
    commit?: Tween["commit"],
  ): Promise<void> {
    this.state(squadId);
    return new Promise((resolve) => {
      this.tweens.push({ squadId, start: this.time, duration: Math.max(0.001, duration), apply, commit, resolve });
    });
  }

  private state(id: string): SquadAnimState {
    let st = this.states.get(id);
    if (!st) {
      st = {
        pose: {
          anchor: null,
          facing: null,
          bannerLift: 0,
          bannerTilt: 0,
          bannerFlare: 0,
          bannerFade: 1,
          ringFlash: 0,
          ringFade: 1,
        },
        figures: Array.from({ length: MAX_FIGURES }, neutralFigure),
        anchor: null,
        facing: null,
        propAnchor: null,
        fallen: new Set(),
        routed: false,
      };
      this.states.set(id, st);
    }
    return st;
  }
}

function dist(a: WorldPoint, b: WorldPoint) {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

function hashId(id: string) {
  let h = 2166136261;
  for (let i = 0; i < id.length; i += 1) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  return h >>> 0;
}
