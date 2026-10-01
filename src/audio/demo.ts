import { drumBar, DrumIntensity, drumTempo, DRUM_BASE, DRUM_SWELLS } from "./drums";
import { MOODS, midiToHz, musicBar, type MusicMood } from "./music";
import { droneVoice, drumVoice, makeImpulse, makeNoise, padVoice, pluckVoice } from "./voices";

/**
 * Dev-only audio demos (T20): render the war drums and the score offline with
 * the same pattern logic and voices as the live engine, as WAV files, so they
 * can be auditioned without playing a battle (`npm run audio:demo`).
 */

const SR = 44100;

/** Drums over `seconds`, with intensity from a base plus timed swells. */
export async function renderDrums(seconds: number, base: number, swells: Array<[at: number, moment: string]> = []) {
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
    }
    for (const h of hits) if (h.step === step) drumVoice(ctx, bus, noise, h.voice, t, h.velocity);
    t += 60 / drumTempo(level) / 4;
    step = (step + 1) % 16;
    if (step === 0) bar += 1;
  }
  return ctx.startRendering();
}

/** `bars` bars of the score in `mood` (seeded). */
export async function renderMusic(mood: MusicMood, bars: number, seed = 1) {
  const m = MOODS[mood];
  const beat = 60 / m.bpm;
  const seconds = bars * beat * 4 + 3;
  const ctx = new OfflineAudioContext(2, Math.ceil(SR * seconds), SR);
  const bus = ctx.createGain();
  bus.gain.value = 1.6;
  const room = ctx.createConvolver();
  room.buffer = makeImpulse(ctx);
  const wet = ctx.createGain();
  wet.gain.value = 0.45;
  bus.connect(ctx.destination);
  bus.connect(room).connect(wet).connect(ctx.destination);
  let rand = seed;
  const next = () => {
    rand = (rand * 16807) % 2147483647;
    return rand / 2147483647;
  };
  let last = 4;
  for (let i = 0; i < bars; i += 1) {
    const t = 0.1 + i * beat * 4;
    const { bar, lastDegree } = musicBar(m, i, next, last);
    last = lastDegree;
    padVoice(ctx, bus, bar.chord.map(midiToHz), t, beat * 4, m.brightness);
    droneVoice(ctx, bus, midiToHz(bar.drone), t, beat * 4);
    for (const n of bar.melody) pluckVoice(ctx, bus, midiToHz(n.midi), t + n.beat * beat, n.velocity);
  }
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

/** Every demo, as name → WAV bytes (base64) plus levels. */
export async function renderAllDemos() {
  const jobs: Array<[string, Promise<AudioBuffer>]> = [
    ["drums-command", renderDrums(12, DRUM_BASE.command)],
    ["drums-playback", renderDrums(12, DRUM_BASE.playback)],
    ["drums-engagement-swell", renderDrums(16, DRUM_BASE.command, [[3, "clash"], [9, "dread"]])],
    ...(Object.keys(MOODS) as MusicMood[]).map((mood): [string, Promise<AudioBuffer>] => [`music-${mood}`, renderMusic(mood, 6)]),
  ];
  const out: Record<string, { wav: string; peakDb: number; rmsDb: number; seconds: number }> = {};
  for (const [name, job] of jobs) {
    const buffer = await job;
    const bytes = new Uint8Array(toWav(buffer));
    let bin = "";
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    out[name] = { wav: btoa(bin), seconds: Math.round(buffer.duration * 10) / 10, ...levels(buffer) };
  }
  return out;
}
