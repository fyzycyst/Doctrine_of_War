import { useAudioStore } from "../app/audioStore";
import { AMBIENT_BEDS, ambienceMix, type AmbienceSpec, type AmbientBed } from "./ambience";

/**
 * Small Web Audio engine (no dependencies):
 * - ambient beds, synthesized: wind, rain, river, distant Host drums, fire crackle;
 *   `setAmbience` cross-fades them;
 * - SFX via `playSfx(name)`: clash, card, seal and rout use CC0 Kenney samples
 *   (see CREDITS.md), and horn, dread and reveal are synthesized;
 * - master mute and volume follow the persisted audio store.
 *
 * Browsers only start audio after a user gesture: call `unlock()` from one (the
 * Look Lab does it on the first pointerdown). Before that, every call is a
 * silent no-op, and so is every call in environments without Web Audio (tests).
 */

export type SfxName = "clash" | "horn" | "card" | "seal" | "rout" | "dread" | "reveal";
export const SFX_NAMES: SfxName[] = ["clash", "horn", "card", "seal", "rout", "dread", "reveal"];

const SAMPLES = {
  clash: ["clash-1", "clash-2", "clash-3"],
  card: ["card-1", "card-2"],
  seal: ["seal"],
  step: ["step-0", "step-3", "step-5", "step-7"],
  cloth: ["cloth"],
} as const;

const BED_FADE = 2.5;
const AMBIENT_LEVEL = 0.55;

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private ambientBus: GainNode | null = null;
  private sfxBus: GainNode | null = null;
  private beds = new Map<AmbientBed, GainNode>();
  private noise: AudioBuffer | null = null;
  private buffers = new Map<string, AudioBuffer>();
  private schedulers: number[] = [];
  private spec: AmbienceSpec | null = null;

  constructor() {
    useAudioStore.subscribe(() => this.applyVolume());
  }

  get ready() {
    return !!this.ctx && this.ctx.state === "running";
  }

  /** Create/resume the context. Call from a user gesture. */
  async unlock() {
    const Ctx = typeof window !== "undefined" ? (window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext) : undefined;
    if (!Ctx) return;
    if (!this.ctx) {
      this.ctx = new Ctx();
      this.master = this.ctx.createGain();
      this.master.connect(this.ctx.destination);
      this.ambientBus = this.ctx.createGain();
      this.ambientBus.gain.value = AMBIENT_LEVEL;
      this.ambientBus.connect(this.master);
      this.sfxBus = this.ctx.createGain();
      this.sfxBus.connect(this.master);
      this.noise = this.makeNoise();
      this.applyVolume();
      this.buildBeds();
      void this.loadSamples();
    }
    if (this.ctx.state !== "running") await this.ctx.resume();
    if (this.spec) this.setAmbience(this.spec);
  }

  setAmbience(spec: AmbienceSpec) {
    this.spec = spec;
    if (!this.ctx) return;
    const mix = ambienceMix(spec);
    const now = this.ctx.currentTime;
    for (const bed of AMBIENT_BEDS) {
      const g = this.beds.get(bed);
      if (!g) continue;
      g.gain.cancelScheduledValues(now);
      g.gain.setValueAtTime(g.gain.value, now);
      g.gain.linearRampToValueAtTime(mix[bed], now + BED_FADE);
    }
  }

  playSfx(name: SfxName) {
    const ctx = this.ctx;
    if (!ctx || !this.sfxBus || ctx.state !== "running") return;
    const t = ctx.currentTime + 0.01;
    switch (name) {
      case "clash":
        this.sample(pick(SAMPLES.clash), t, 0.9, 0.9 + Math.random() * 0.2);
        this.sample(pick(SAMPLES.clash), t + 0.06 + Math.random() * 0.05, 0.5, 0.8 + Math.random() * 0.2);
        this.thump(t, 70, 0.5);
        break;
      case "card":
        this.sample(pick(SAMPLES.card), t, 0.8, 0.95 + Math.random() * 0.1);
        break;
      case "seal":
        this.sample("seal", t, 0.9, 0.85);
        this.thump(t + 0.01, 60, 0.7);
        break;
      case "rout":
        for (let i = 0; i < 7; i += 1) {
          this.sample(pick(SAMPLES.step), t + i * 0.11 + Math.random() * 0.05, 0.55 - i * 0.05, 1.1 + Math.random() * 0.3);
        }
        this.sample("cloth", t + 0.05, 0.5, 1.2);
        this.fallTone(t);
        break;
      case "horn":
        this.horn(t);
        break;
      case "dread":
        this.dread(t);
        break;
      case "reveal":
        this.reveal(t);
        break;
    }
  }

  // --- internals ---------------------------------------------------------------

  private applyVolume() {
    if (!this.master || !this.ctx) return;
    const { muted, volume } = useAudioStore.getState();
    const now = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(now);
    this.master.gain.setTargetAtTime(muted ? 0 : volume, now, 0.05);
  }

  private makeNoise() {
    const ctx = this.ctx!;
    const buffer = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
    return buffer;
  }

  private noiseSource() {
    const src = this.ctx!.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    src.loopStart = Math.random();
    return src;
  }

  private lfo(freq: number, depth: number, target: AudioParam) {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    osc.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.value = depth;
    osc.connect(g).connect(target);
    osc.start();
  }

  private bed(name: AmbientBed) {
    const g = this.ctx!.createGain();
    g.gain.value = 0;
    g.connect(this.ambientBus!);
    this.beds.set(name, g);
    return g;
  }

  private buildBeds() {
    const ctx = this.ctx!;
    // Wind: low-passed noise whose cutoff and level wander.
    {
      const out = this.bed("wind");
      const src = this.noiseSource();
      const lp = ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = 520;
      lp.Q.value = 0.8;
      const amp = ctx.createGain();
      amp.gain.value = 0.7;
      this.lfo(0.07, 280, lp.frequency);
      this.lfo(0.13, 0.3, amp.gain);
      src.connect(lp).connect(amp).connect(out);
      src.start();
    }
    // Rain: bright hiss.
    {
      const out = this.bed("rain");
      const src = this.noiseSource();
      const hp = ctx.createBiquadFilter();
      hp.type = "highpass";
      hp.frequency.value = 900;
      const lp = ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = 6500;
      const amp = ctx.createGain();
      amp.gain.value = 0.45;
      src.connect(hp).connect(lp).connect(amp).connect(out);
      src.start();
    }
    // River: a band of noise that ripples.
    {
      const out = this.bed("river");
      const src = this.noiseSource();
      const bp = ctx.createBiquadFilter();
      bp.type = "bandpass";
      bp.frequency.value = 650;
      bp.Q.value = 0.9;
      this.lfo(0.23, 180, bp.frequency);
      const amp = ctx.createGain();
      amp.gain.value = 0.9;
      src.connect(bp).connect(amp).connect(out);
      src.start();
    }
    // Drums and fire crackle are scheduled hits.
    const drums = this.bed("drums");
    const drumBus = ctx.createGain();
    const delay = ctx.createDelay(1);
    delay.delayTime.value = 0.23;
    const fb = ctx.createGain();
    fb.gain.value = 0.32;
    const far = ctx.createBiquadFilter();
    far.type = "lowpass";
    far.frequency.value = 650;
    drumBus.connect(far);
    far.connect(drums);
    far.connect(delay);
    delay.connect(fb).connect(delay);
    delay.connect(drums);
    const fire = this.bed("fire");

    const pattern = [0, 0.55, 1.1, 1.38];
    let nextBar = ctx.currentTime + 0.1;
    let nextCrackle = ctx.currentTime + 0.1;
    const tick = () => {
      const c = this.ctx;
      if (!c) return;
      const horizon = c.currentTime + 0.25;
      while (nextBar < horizon) {
        pattern.forEach((off, i) => this.tom(drumBus, nextBar + off, i === 2 ? 0.45 : 0.9));
        nextBar += 2.2;
      }
      while (nextCrackle < horizon) {
        this.crackle(fire, nextCrackle);
        nextCrackle += 0.03 + Math.random() * 0.14;
      }
    };
    this.schedulers.push(window.setInterval(tick, 80));
  }

  private tom(dest: AudioNode, t: number, level: number) {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    osc.frequency.setValueAtTime(95, t);
    osc.frequency.exponentialRampToValueAtTime(48, t + 0.35);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(level, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.7);
    osc.connect(g).connect(dest);
    osc.start(t);
    osc.stop(t + 0.75);
  }

  private crackle(dest: AudioNode, t: number) {
    const ctx = this.ctx!;
    const src = this.noiseSource();
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 1800 + Math.random() * 2600;
    bp.Q.value = 3;
    const g = ctx.createGain();
    const peak = 0.2 + Math.random() * 0.6;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + 0.003);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.02 + Math.random() * 0.05);
    src.connect(bp).connect(g).connect(dest);
    src.start(t);
    src.stop(t + 0.1);
  }

  private async loadSamples() {
    const ctx = this.ctx;
    if (!ctx) return;
    const names = [...new Set(Object.values(SAMPLES).flat())];
    const base = `${import.meta.env.BASE_URL}assets/audio/`;
    await Promise.all(
      names.map(async (name) => {
        try {
          const res = await fetch(`${base}${name}.ogg`);
          this.buffers.set(name, await ctx.decodeAudioData(await res.arrayBuffer()));
        } catch {
          // Missing or undecodable sample: that SFX simply stays silent.
        }
      }),
    );
  }

  private sample(name: string, t: number, gain: number, rate = 1) {
    const buffer = this.buffers.get(name);
    if (!buffer || !this.ctx) return;
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    src.playbackRate.value = rate;
    const g = this.ctx.createGain();
    g.gain.value = gain;
    src.connect(g).connect(this.sfxBus!);
    src.start(t);
  }

  private thump(t: number, freq: number, level: number) {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    osc.frequency.setValueAtTime(freq * 1.6, t);
    osc.frequency.exponentialRampToValueAtTime(freq, t + 0.12);
    const g = ctx.createGain();
    g.gain.setValueAtTime(level, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
    osc.connect(g).connect(this.sfxBus!);
    osc.start(t);
    osc.stop(t + 0.4);
  }

  /** Rally horn: two detuned saws through a warm filter, with a swell and vibrato. */
  private horn(t: number) {
    const ctx = this.ctx!;
    const out = ctx.createGain();
    out.gain.setValueAtTime(0.0001, t);
    out.gain.exponentialRampToValueAtTime(0.32, t + 0.28);
    out.gain.setValueAtTime(0.32, t + 1.2);
    out.gain.exponentialRampToValueAtTime(0.0001, t + 1.9);
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.setValueAtTime(500, t);
    lp.frequency.linearRampToValueAtTime(1300, t + 0.35);
    lp.Q.value = 2;
    lp.connect(out).connect(this.sfxBus!);
    for (const [f, detune] of [
      [146.8, -6],
      [220, 5],
      [293.6, 0],
    ] as const) {
      const osc = ctx.createOscillator();
      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(f * 0.94, t);
      osc.frequency.exponentialRampToValueAtTime(f, t + 0.18);
      osc.detune.value = detune;
      const vib = ctx.createOscillator();
      vib.frequency.value = 5.2;
      const vg = ctx.createGain();
      vg.gain.value = 6;
      vib.connect(vg).connect(osc.detune);
      osc.connect(lp);
      osc.start(t);
      vib.start(t);
      osc.stop(t + 2);
      vib.stop(t + 2);
    }
  }

  /** Dread: a low beating drone that swells and fades, with a rumble. */
  private dread(t: number) {
    const ctx = this.ctx!;
    const out = ctx.createGain();
    out.gain.setValueAtTime(0.0001, t);
    out.gain.exponentialRampToValueAtTime(0.5, t + 1.6);
    out.gain.exponentialRampToValueAtTime(0.0001, t + 3.4);
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.setValueAtTime(180, t);
    lp.frequency.linearRampToValueAtTime(420, t + 1.6);
    lp.connect(out).connect(this.sfxBus!);
    for (const [f, type] of [
      [55, "sine"],
      [56.6, "sine"],
      [110, "sawtooth"],
    ] as const) {
      const osc = ctx.createOscillator();
      osc.type = type;
      osc.frequency.value = f;
      osc.connect(lp);
      osc.start(t);
      osc.stop(t + 3.5);
    }
    const rumble = this.noiseSource();
    const rl = ctx.createBiquadFilter();
    rl.type = "lowpass";
    rl.frequency.value = 120;
    const rg = ctx.createGain();
    rg.gain.value = 0.6;
    rumble.connect(rl).connect(rg).connect(out);
    rumble.start(t);
    rumble.stop(t + 3.5);
  }

  /** Reveal: an airy whoosh (the mist parting) and a soft open fifth. */
  private reveal(t: number) {
    const ctx = this.ctx!;
    const src = this.noiseSource();
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.Q.value = 1.4;
    bp.frequency.setValueAtTime(350, t);
    bp.frequency.exponentialRampToValueAtTime(2600, t + 1.1);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.45, t + 0.45);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.4);
    src.connect(bp).connect(g).connect(this.sfxBus!);
    src.start(t);
    src.stop(t + 1.5);
    for (const f of [329.6, 493.9]) {
      const osc = ctx.createOscillator();
      osc.frequency.value = f;
      const og = ctx.createGain();
      og.gain.setValueAtTime(0.0001, t + 0.2);
      og.gain.exponentialRampToValueAtTime(0.08, t + 0.6);
      og.gain.exponentialRampToValueAtTime(0.0001, t + 1.9);
      osc.connect(og).connect(this.sfxBus!);
      osc.start(t + 0.2);
      osc.stop(t + 2);
    }
  }

  /** Rout: a falling, breaking tone under the running feet. */
  private fallTone(t: number) {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(220, t);
    osc.frequency.exponentialRampToValueAtTime(90, t + 0.9);
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 700;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.14, t + 0.08);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1);
    osc.connect(lp).connect(g).connect(this.sfxBus!);
    osc.start(t);
    osc.stop(t + 1.05);
  }
}

function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}
