import { drumBar, DrumIntensity, drumTempo, DRUM_BASE, DRUM_SWELLS } from "./drums";
import { MOODS, musicBar, type MotifKind, type MusicMood } from "./music";
import { Orchestra } from "./sampler";
import { playDrumBarExtras, playDrumHit, playMotif, playScoreBar } from "./score";
import { makeImpulse, makeNoise } from "./voices";

/**
 * Dev-only audio demos (T20, T20b): render the war drums, the score and the
 * motifs/stingers offline with the same arrangement code as the live engine
 * (score.ts), on the sampled orchestra (or the synth fallback), as WAV files,
 * so they can be auditioned without playing a battle (`npm run audio:demo`).
 */

const SR = 44100;

/** The orchestra decoded once (AudioBuffers are shared across contexts). */
let orchestra: Orchestra | null = null;
async function loadOrchestra(): Promise<Orchestra> {
  if (!orchestra) {
    orchestra = new Orchestra();
    await orchestra.load(new OfflineAudioContext(1, SR, SR), import.meta.env.BASE_URL);
  }
  return orchestra;
}

/** A hall: the score and drums go through the same soft room as live. */
function hall(ctx: OfflineAudioContext, level: number) {
  const bus = ctx.createGain();
  bus.gain.value = level;
  const room = ctx.createConvolver();
  room.buffer = makeImpulse(ctx);
  const wet = ctx.createGain();
  wet.gain.value = 0.45;
  bus.connect(ctx.destination);
  bus.connect(room).connect(wet).connect(ctx.destination);
  return bus;
}

/** Drums over `seconds`, with intensity from a base plus timed swells. */
export async function renderDrums(seconds: number, base: number, swells: Array<[at: number, moment: string]> = [], orch: Orchestra | null = null) {
  const ctx = new OfflineAudioContext(2, Math.ceil(SR * seconds), SR);
  const noise = makeNoise(ctx);
  const k = new DrumIntensity(base);
  for (const [at, moment] of swells) {
    const s = DRUM_SWELLS[moment];
    if (s) k.swell(s[0], at, s[1], s[2]);
  }
  const bus = ctx.createGain();
  const far = ctx.createBiquadFilter();
  far.type = "lowpass";
  const delay = ctx.createDelay(1);
  delay.delayTime.value = 0.42;
  const fb = ctx.createGain();
  fb.gain.value = 0.12;
  const send = ctx.createGain();
  send.gain.value = 0.22;
  const out = ctx.createGain();
  out.gain.value = 0.42;
  bus.connect(far).connect(out).connect(ctx.destination);
  far.connect(send).connect(delay);
  delay.connect(fb).connect(delay);
  delay.connect(out);
  let t = 0.05;
  let step = 0;
  let bar = 0;
  let hits = drumBar(k.value(t), bar);
  while (t < seconds - 0.7) {
    const level = k.value(t);
    if (step === 0) {
      hits = drumBar(level, bar);
      far.frequency.setValueAtTime(900 + 1700 * level, t);
      bus.gain.setValueAtTime(0.55 + 0.6 * level, t);
      playDrumBarExtras(ctx, bus, orch, t, (60 / drumTempo(level)) * 4, level, bar);
    }
    for (const h of hits) if (h.step === step) playDrumHit(ctx, bus, orch, noise, h.voice, t, h.velocity);
    t += 60 / drumTempo(level) / 4;
    step = (step + 1) % 16;
    if (step === 0) bar += 1;
  }
  return ctx.startRendering();
}

/** `bars` bars of the score in `mood` (seeded) at a battle intensity. */
export async function renderMusic(mood: MusicMood, bars: number, orch: Orchestra | null, intensity: number = DRUM_BASE.playback, seed = 1) {
  const m = MOODS[mood];
  const barLen = (60 / m.bpm) * 4;
  const ctx = new OfflineAudioContext(2, Math.ceil(SR * (bars * barLen + 4)), SR);
  const bus = hall(ctx, orch ? 1.3 : 1.6);
  let rand = seed;
  const next = () => {
    rand = (rand * 16807) % 2147483647;
    return rand / 2147483647;
  };
  let last = 4;
  for (let i = 0; i < bars; i += 1) {
    const { bar, lastDegree } = musicBar(m, i, next, last);
    last = lastDegree;
    playScoreBar(ctx, bus, orch, m, bar, 0.1 + i * barLen, intensity);
  }
  return ctx.startRendering();
}

/** A motif or stinger on its own (banners, host, dawn, victory, defeat). */
export async function renderMotif(kind: MotifKind, mood: MusicMood, orch: Orchestra | null) {
  const ctx = new OfflineAudioContext(2, Math.ceil(SR * 8), SR);
  const noise = makeNoise(ctx);
  const bus = hall(ctx, 1.0);
  const drums = ctx.createGain();
  drums.gain.value = 0.5;
  drums.connect(ctx.destination);
  playMotif(ctx, bus, drums, orch, kind, mood, 0.1, noise);
  return ctx.startRendering();
}

/** 16-bit PCM WAV. */
export function toWav(buffer: AudioBuffer): ArrayBuffer {
  const channels = buffer.numberOfChannels;
  const frames = buffer.length;
  const data = new DataView(new ArrayBuffer(44 + frames * channels * 2));
  const write = (o: number, s: string) => [...s].forEach((c, i) => data.setUint8(o + i, c.charCodeAt(0)));
  write(0, "RIFF");
  data.setUint32(4, 36 + frames * channels * 2, true);
  write(8, "WAVEfmt ");
  data.setUint32(16, 16, true);
  data.setUint16(20, 1, true);
  data.setUint16(22, channels, true);
  data.setUint32(24, buffer.sampleRate, true);
  data.setUint32(28, buffer.sampleRate * channels * 2, true);
  data.setUint16(32, channels * 2, true);
  data.setUint16(34, 16, true);
  write(36, "data");
  data.setUint32(40, frames * channels * 2, true);
  const chans = Array.from({ length: channels }, (_, c) => buffer.getChannelData(c));
  let o = 44;
  for (let i = 0; i < frames; i += 1) {
    for (const ch of chans) {
      data.setInt16(o, Math.max(-1, Math.min(1, ch[i])) * 0x7fff, true);
      o += 2;
    }
  }
  return data.buffer;
}

/** Peak and RMS (dBFS) of a rendered buffer, for the demo report. */
export function levels(buffer: AudioBuffer) {
  let peak = 0;
  let sum = 0;
  let n = 0;
  for (let c = 0; c < buffer.numberOfChannels; c += 1) {
    for (const v of buffer.getChannelData(c)) {
      peak = Math.max(peak, Math.abs(v));
      sum += v * v;
      n += 1;
    }
  }
  const db = (x: number) => Math.round(20 * Math.log10(Math.max(1e-9, x)) * 10) / 10;
  return { peakDb: db(peak), rmsDb: db(Math.sqrt(sum / n)) };
}

/** Sums buffers (each at an offset in seconds, with a gain) into one stereo buffer. */
export function mixBuffers(parts: Array<{ buffer: AudioBuffer; at?: number; gain?: number }>): AudioBuffer {
  const length = Math.max(...parts.map((p) => Math.ceil((p.at ?? 0) * SR) + p.buffer.length));
  const out = new AudioBuffer({ length, numberOfChannels: 2, sampleRate: SR });
  for (const { buffer, at = 0, gain = 1 } of parts) {
    const offset = Math.ceil(at * SR);
    for (let c = 0; c < 2; c += 1) {
      const src = buffer.getChannelData(Math.min(c, buffer.numberOfChannels - 1));
      const dst = out.getChannelData(c);
      for (let i = 0; i < src.length; i += 1) dst[offset + i] += src[i] * gain;
    }
  }
  return out;
}

/**
 * The product video's music stems (T34, `npm run audio:demo -- --set video`), from the
 * same score as the game: a dusk/menu bed (the command hush, no drums), a ~60 s battle
 * bed (the dusk score at playback intensity over the war drums), the dawn swell (the
 * dawn motif into the sunrise score) and the victory fanfare.
 */
export async function renderVideoStems(): Promise<Array<[string, AudioBuffer]>> {
  const orch = await loadOrchestra();
  const duskBar = (60 / MOODS.dusk.bpm) * 4;
  return [
    ["dusk-bed", await renderMusic("dusk", 12, orch, DRUM_BASE.command)],
    // 18 bars of score over 70 s of drums: loop any 16 bars (60 s) away from both ends.
    ["battle-bed", mixBuffers([{ buffer: await renderMusic("dusk", 18, orch, DRUM_BASE.playback, 7) }, { buffer: await renderDrums(18 * duskBar + 2, DRUM_BASE.playback, [], orch), gain: 0.9 }])],
    ["dawn-swell", mixBuffers([{ buffer: await renderMotif("dawn", "predawn", orch) }, { buffer: await renderMusic("sunrise", 6, orch, DRUM_BASE.playback, 3), at: 3 }])],
    ["victory-fanfare", await renderMotif("victory", "sunrise", orch)],
    ["victory-fanfare-alt", await renderMotif("victoryAlt", "sunrise", orch)],
    ["engagement-swell", await renderDrums(16, DRUM_BASE.command, [[3, "clash"], [9, "dread"]], orch)],
  ];
}

/** Every demo, as name → WAV bytes (base64) plus levels. */
export async function renderAllDemos(set: "demos" | "video" = "demos") {
  if (set === "video") return encodeAll(await renderVideoStems());
  const orch = await loadOrchestra();
  const jobs: Array<[string, () => Promise<AudioBuffer>]> = [
    ["drums-command", () => renderDrums(12, DRUM_BASE.command, [], orch)],
    ["drums-playback", () => renderDrums(12, DRUM_BASE.playback, [], orch)],
    ["drums-engagement-swell", () => renderDrums(16, DRUM_BASE.command, [[3, "clash"], [9, "dread"]], orch)],
    ...(Object.keys(MOODS) as MusicMood[]).map((mood): [string, () => Promise<AudioBuffer>] => [`music-${mood}`, () => renderMusic(mood, 6, orch)]),
    ["music-dusk-command-hush", () => renderMusic("dusk", 4, orch, DRUM_BASE.command)],
    ["music-dusk-synth-fallback", () => renderMusic("dusk", 4, null)],
    ["motif-banners-horn-call", () => renderMotif("banners", "dusk", orch)],
    ["motif-host-dread", () => renderMotif("host", "nightFires", orch)],
    ["motif-dawn-turn", () => renderMotif("dawn", "predawn", orch)],
    ["victory", () => renderMotif("victory", "sunrise", orch)],
    ["victory-alt", () => renderMotif("victoryAlt", "sunrise", orch)],
    ["defeat", () => renderMotif("defeat", "nightFires", orch)],
  ];
  const rendered: Array<[string, AudioBuffer]> = [];
  for (const [name, job] of jobs) rendered.push([name, await job()]);
  return encodeAll(rendered);
}

async function encodeAll(rendered: Array<[string, AudioBuffer]>) {
  const orch = await loadOrchestra();
  const out: Record<string, { wav: string; peakDb: number; rmsDb: number; seconds: number }> = {};
  for (const [name, buffer] of rendered) {
    const bytes = new Uint8Array(toWav(buffer));
    let bin = "";
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    out[name] = { wav: btoa(bin), seconds: Math.round(buffer.duration * 10) / 10, ...levels(buffer) };
  }
  return { demos: out, orchestra: orch.state };
}
