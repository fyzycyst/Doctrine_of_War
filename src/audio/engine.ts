import { useAudioStore } from "../app/audioStore";
import { AMBIENT_BEDS, ambienceMix, type AmbienceSpec, type AmbientBed } from "./ambience";
import { DRUM_SWELLS, drumBar, DrumIntensity, drumTempo } from "./drums";
import { DUCK, MOODS, MUSIC_LEVEL, musicBar, type MotifKind, type MusicMood } from "./music";
import { Orchestra } from "./sampler";
import { playDrumBarExtras, playDrumHit, playMotif, playScoreBar } from "./score";
import { makeImpulse } from "./voices";

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
  /** Battle intensity driving the war drums (T20): a base plus SFX swells. */
  readonly drums = new DrumIntensity();
  /** The score (T20): its bus (music volume), the duck under SFX, and the mood. */
  private musicBus: GainNode | null = null;
  private duck: GainNode | null = null;
  private musicOverride: MusicMood | null | undefined = undefined;
  /** Phrase dynamics: the score swells with battle intensity (hush in command windows). */
  private dyn: GainNode | null = null;
  /** Motifs and stingers: same music volume, not ducked (they answer the SFX). */
  private motifBus: GainNode | null = null;
  private drumBus: GainNode | null = null;
  /** The sampled orchestra (T20b): lazy-loaded on unlock; synth voices until it decodes. */
  readonly orchestra = new Orchestra();

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
      // Score: dry + a soft room, ducked under SFX, at the player's music volume.
      this.duck = this.ctx.createGain();
      this.duck.connect(this.master);
      this.musicBus = this.ctx.createGain();
      this.dyn = this.ctx.createGain();
      const room = this.ctx.createConvolver();
      room.buffer = makeImpulse(this.ctx);
      const wet = this.ctx.createGain();
      wet.gain.value = 0.45;
      this.musicBus.connect(this.dyn);
      this.dyn.connect(this.duck);
      this.dyn.connect(room).connect(wet).connect(this.duck);
      this.motifBus = this.ctx.createGain();
      this.motifBus.connect(this.master);
      this.motifBus.connect(room);
      wet.connect(this.master);
      this.noise = this.makeNoise();
      this.applyVolume();
      this.buildBeds();
      this.buildScore();
      void this.loadSamples();
      // The orchestra is ~3 MB: fetched only now, after the first interaction.
      void this.orchestra.load(this.ctx, `${import.meta.env.BASE_URL}`);
    }
    if (this.ctx.state !== "running") await this.ctx.resume();
    if (this.spec) this.setAmbience(this.spec);
  }

  setAmbience(spec: AmbienceSpec) {
    // The dawn turn (predawn → sunrise) is a drum moment by itself.
    if (this.spec?.timeOfDay === "predawn" && spec.timeOfDay === "sunrise") {
      this.swellDrums("dawn");
      this.motif("dawn");
    }
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

  /** The drums' resting level (0..1): e.g. DRUM_BASE.command or DRUM_BASE.playback. */
  setDrumIntensity(base: number) {
    this.drums.setBase(base);
  }

  /** Swell the drums for a battle moment (clash, rout, horn, dread, reveal, dawn). */
  swellDrums(moment: string) {
    const s = DRUM_SWELLS[moment];
    if (s) this.drums.swell(s[0], this.clock(), s[1], s[2]);
  }

  private clock() {
    return this.ctx ? this.ctx.currentTime : performance.now() / 1000;
  }

  /**
   * The score's mood: a time of day, or null for silence. Until set, the
   * score follows the ambience's time of day (battles); menus can pin one.
   */
  setMusic(mood: MusicMood | null) {
    this.musicOverride = mood;
  }

  private get mood(): MusicMood | null {
    return this.musicOverride !== undefined ? this.musicOverride : (this.spec?.timeOfDay ?? null);
  }

  playSfx(name: SfxName) {
    // Battle moments push the drums (harmless before audio is unlocked).
    this.swellDrums(name);
    const ctx = this.ctx;
    if (!ctx || !this.sfxBus || ctx.state !== "running") return;
    const t = ctx.currentTime + 0.01;
    // Duck the score under the effect, then let it back up.
    if (this.duck) {
      const g = this.duck.gain;
      g.cancelScheduledValues(ctx.currentTime);
      g.setTargetAtTime(DUCK.depth, ctx.currentTime, DUCK.attack / 3);
      g.setTargetAtTime(1, ctx.currentTime + 0.35, DUCK.release / 3);
    }
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
        this.motif("banners", 0.15);
        break;
      case "dread":
        this.dread(t);
        this.motif("host", 0.1);
        break;
      case "reveal":
        this.reveal(t);
        break;
    }
  }

  /** End-of-battle stinger on the score: "victory" (horn fanfare over strings) or "defeat" (a low cello line). */
  playSting(kind: "victory" | "defeat") {
    this.motif(kind);
  }

  private motif(kind: MotifKind, delay = 0.05) {
    const ctx = this.ctx;
    if (!ctx || !this.motifBus || !this.drumBus || ctx.state !== "running") return;
    playMotif(ctx, this.motifBus, this.drumBus, this.orchestra, kind, this.mood, ctx.currentTime + delay, this.noise);
  }

  // --- internals ---------------------------------------------------------------

  private applyVolume() {
    if (!this.master || !this.ctx) return;
    const { muted, volume, musicVolume } = useAudioStore.getState();
    const now = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(now);
    this.master.gain.setTargetAtTime(muted ? 0 : volume, now, 0.05);
    this.musicBus?.gain.setTargetAtTime(musicVolume * MUSIC_LEVEL, now, 0.1);
    this.motifBus?.gain.setTargetAtTime(musicVolume * MUSIC_LEVEL * 1.1, now, 0.1);
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
    // Drums and fire crackle are scheduled hits. The drums sit a little
    // distant (low-passed, a faint long echo off the hills; a short slap made
    // every hit a "lub-dub") and come closer, brighter and faster as the
    // battle's intensity rises (drums.ts).
    const drums = this.bed("drums");
    const drumBus = ctx.createGain();
    this.drumBus = drumBus;
    const delay = ctx.createDelay(1);
    delay.delayTime.value = 0.42;
    const fb = ctx.createGain();
    fb.gain.value = 0.12;
    const send = ctx.createGain();
    send.gain.value = 0.22;
    const far = ctx.createBiquadFilter();
    far.type = "lowpass";
    far.frequency.value = 1100;
    drumBus.connect(far);
    far.connect(drums);
    far.connect(send).connect(delay);
    delay.connect(fb).connect(delay);
    delay.connect(drums);
    const fire = this.bed("fire");

    let bar = 0;
    let step = 0;
    let nextStep = ctx.currentTime + 0.1;
    let hits = drumBar(this.drums.value(nextStep), bar);
    let nextCrackle = ctx.currentTime + 0.1;
    const tick = () => {
      const c = this.ctx;
      if (!c) return;
      const horizon = c.currentTime + 0.25;
      while (nextStep < horizon) {
        const k = this.drums.value(nextStep);
        if (step === 0) {
          hits = drumBar(k, bar);
          far.frequency.setTargetAtTime(900 + 1700 * k, nextStep, 0.4);
          drumBus.gain.setTargetAtTime(0.55 + 0.6 * k, nextStep, 0.3);
          playDrumBarExtras(c, drumBus, this.orchestra, nextStep, (60 / drumTempo(k)) * 4, k, bar);
        }
        for (const h of hits) if (h.step === step) playDrumHit(c, drumBus, this.orchestra, this.noise, h.voice, nextStep, h.velocity);
        nextStep += 60 / drumTempo(k) / 4;
        step = (step + 1) % 16;
        if (step === 0) bar += 1;
      }
      while (nextCrackle < horizon) {
        this.crackle(fire, nextCrackle);
        nextCrackle += 0.03 + Math.random() * 0.14;
      }
    };
    this.schedulers.push(window.setInterval(tick, 80));
  }

  /** Bar scheduler for the generative score (music.ts): pad, drone and a plucked melody. */
  private buildScore() {
    const ctx = this.ctx!;
    let nextBar = ctx.currentTime + 0.5;
    let index = 0;
    let last = 4;
    let playing: MusicMood | null = null;
    const tick = () => {
      const c = this.ctx;
      const bus = this.musicBus;
      if (!c || !bus) return;
      while (nextBar < c.currentTime + 0.3) {
        const mood = this.mood;
        if (!mood) {
          nextBar = c.currentTime + 0.5;
          playing = null;
          break;
        }
        if (mood !== playing) {
          playing = mood;
          index = 0;
        }
        const m = MOODS[mood];
        const barLen = (60 / m.bpm) * 4;
        const { bar, lastDegree } = musicBar(m, index, Math.random, last);
        last = lastDegree;
        const k = this.drums.value(nextBar);
        // Phrase dynamics: hush in command windows, crescendo into engagements.
        this.dyn?.gain.setTargetAtTime(0.7 + 0.55 * k, nextBar, barLen / 3);
        playScoreBar(c, bus, this.orchestra, m, bar, nextBar, k);
        nextBar += barLen;
        index += 1;
      }
    };
    this.schedulers.push(window.setInterval(tick, 100));
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
  /**
   * Reveal: timed to the emergence on the board (squadAnimation's reveal).
   * The mist parts (a breathy noise swell that opens upward) over a low swell,
   * then at the banner snap (~0.55 s) a double cloth flap and a soft minor
   * chord that lets the threat settle.
   */
  private reveal(t: number) {
    const ctx = this.ctx!;
    const bus = this.sfxBus!;
    const env = (g: GainNode, at: number, peak: number, attack: number, release: number) => {
      g.gain.setValueAtTime(0.0001, at);
      g.gain.exponentialRampToValueAtTime(peak, at + attack);
      g.gain.exponentialRampToValueAtTime(0.0001, at + attack + release);
    };

    // Mist parting: two noise bands, a low breath and an airy top that opens.
    const breath = this.noiseSource();
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.Q.value = 0.9;
    bp.frequency.setValueAtTime(420, t);
    bp.frequency.exponentialRampToValueAtTime(1300, t + 0.9);
    const bg = ctx.createGain();
    env(bg, t, 0.3, 0.4, 0.9);
    breath.connect(bp).connect(bg).connect(bus);
    breath.start(t);
    breath.stop(t + 1.4);
    const air = this.noiseSource();
    const hp = ctx.createBiquadFilter();
    hp.type = "bandpass";
    hp.Q.value = 2.2;
    hp.frequency.setValueAtTime(1800, t);
    hp.frequency.exponentialRampToValueAtTime(5200, t + 0.7);
    const ag = ctx.createGain();
    env(ag, t + 0.05, 0.12, 0.35, 0.6);
    air.connect(hp).connect(ag).connect(bus);
    air.start(t);
    air.stop(t + 1.1);

    // Low swell under it (D2) for weight.
    const low = ctx.createOscillator();
    low.frequency.value = 73.4;
    const lg = ctx.createGain();
    env(lg, t, 0.16, 0.5, 1.1);
    low.connect(lg).connect(bus);
    low.start(t);
    low.stop(t + 1.7);

    // Banner snap: a double cloth flap.
    const snap = t + 0.55;
    [0, 0.07].forEach((dt, i) => {
      const flap = this.noiseSource();
      const fb = ctx.createBiquadFilter();
      fb.type = "bandpass";
      fb.Q.value = 0.8;
      fb.frequency.value = 900 + i * 350;
      const fg = ctx.createGain();
      env(fg, snap + dt, i === 0 ? 0.5 : 0.3, 0.006, 0.12);
      flap.connect(fb).connect(fg).connect(bus);
      flap.start(snap + dt);
      flap.stop(snap + dt + 0.2);
    });

    // Resolution: D minor (D4 F4 A4), slightly detuned pairs for a soft chorus.
    for (const f of [293.7, 349.2, 440]) {
      for (const detune of [-6, 6]) {
        const osc = ctx.createOscillator();
        osc.type = "triangle";
        osc.frequency.value = f;
        osc.detune.value = detune;
        const og = ctx.createGain();
        env(og, snap, 0.028, 0.06, 1.7);
        osc.connect(og).connect(bus);
        osc.start(snap);
        osc.stop(snap + 1.9);
      }
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
