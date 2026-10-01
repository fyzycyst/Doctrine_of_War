import type { DrumVoice } from "./drums";

/**
 * Synth voices shared by the live engine and the offline demo renderer
 * (scripts/audio-demo.mjs): plain functions of a context, so they render the
 * same into an AudioContext or an OfflineAudioContext.
 */

export function noiseSource(ctx: BaseAudioContext, noise: AudioBuffer) {
  const src = ctx.createBufferSource();
  src.buffer = noise;
  src.loop = true;
  src.loopStart = Math.random();
  return src;
}

export function makeNoise(ctx: BaseAudioContext) {
  const buffer = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
  return buffer;
}

/** War-drum voices: a deep low tom with a skin slap, a higher answering tom, a rim crack. */
export function drumVoice(ctx: BaseAudioContext, dest: AudioNode, noise: AudioBuffer, voice: DrumVoice, t: number, velocity: number) {
  const v = velocity * (0.92 + Math.random() * 0.16);
  if (voice === "rim") {
    const src = noiseSource(ctx, noise);
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 1900;
    bp.Q.value = 1.2;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.55 * v, t + 0.002);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);
    src.connect(bp).connect(g).connect(dest);
    src.start(t);
    src.stop(t + 0.12);
    return;
  }
  const low = voice === "low";
  const osc = ctx.createOscillator();
  osc.frequency.setValueAtTime(low ? 118 : 196, t);
  osc.frequency.exponentialRampToValueAtTime(low ? 52 : 128, t + (low ? 0.28 : 0.16));
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime((low ? 1.25 : 0.75) * v, t + 0.006);
  g.gain.exponentialRampToValueAtTime(0.0001, t + (low ? 0.6 : 0.32));
  osc.connect(g).connect(dest);
  osc.start(t);
  osc.stop(t + 0.65);
  // The skin: a short band of noise on the attack, so it reads as a struck drum.
  const src = noiseSource(ctx, noise);
  const bp = ctx.createBiquadFilter();
  bp.type = "bandpass";
  bp.frequency.value = low ? 420 : 760;
  bp.Q.value = 0.9;
  const ng = ctx.createGain();
  ng.gain.setValueAtTime(0.0001, t);
  ng.gain.exponentialRampToValueAtTime((low ? 0.5 : 0.35) * v, t + 0.003);
  ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
  src.connect(bp).connect(ng).connect(dest);
  src.start(t);
  src.stop(t + 0.08);
}

// --- Score voices (music.ts) ------------------------------------------------

/** A soft room: a decaying stereo noise impulse for a ConvolverNode. */
export function makeImpulse(ctx: BaseAudioContext, seconds = 2.8) {
  const length = Math.floor(ctx.sampleRate * seconds);
  const buffer = ctx.createBuffer(2, length, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch += 1) {
    const data = buffer.getChannelData(ch);
    for (let i = 0; i < length; i += 1) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, 3);
  }
  return buffer;
}

/**
 * A string-ish pad chord: two detuned saws per note through a low-pass, slow
 * swell in and out over the bar (overlapping the next bar's chord).
 */
export function padVoice(ctx: BaseAudioContext, dest: AudioNode, freqs: number[], t: number, duration: number, brightness: number, level = 0.07) {
  const lp = ctx.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = brightness;
  lp.Q.value = 0.4;
  const g = ctx.createGain();
  const attack = Math.min(1.6, duration * 0.4);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(level, t + attack);
  g.gain.setValueAtTime(level, t + duration);
  g.gain.linearRampToValueAtTime(0.0001, t + duration + attack);
  lp.connect(g).connect(dest);
  for (const f of freqs) {
    for (const detune of [-7, 7]) {
      const osc = ctx.createOscillator();
      osc.type = "sawtooth";
      osc.frequency.value = f;
      osc.detune.value = detune;
      osc.connect(lp);
      osc.start(t);
      osc.stop(t + duration + attack + 0.1);
    }
  }
}

/** A low drone (sine + soft fifth) held for the bar. */
export function droneVoice(ctx: BaseAudioContext, dest: AudioNode, freq: number, t: number, duration: number, level = 0.08) {
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(level, t + 1.2);
  g.gain.setValueAtTime(level, t + duration);
  g.gain.linearRampToValueAtTime(0.0001, t + duration + 1.2);
  g.connect(dest);
  for (const [mult, amp] of [
    [1, 1],
    [1.5, 0.35],
  ] as const) {
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.value = freq * mult;
    const og = ctx.createGain();
    og.gain.value = amp;
    osc.connect(og).connect(g);
    osc.start(t);
    osc.stop(t + duration + 1.3);
  }
}

/** A plucked, harp-like note: triangle + octave sine with a quick decay. */
export function pluckVoice(ctx: BaseAudioContext, dest: AudioNode, freq: number, t: number, velocity: number, level = 0.16) {
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(level * velocity, t + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 1.8);
  const lp = ctx.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.setValueAtTime(3200, t);
  lp.frequency.exponentialRampToValueAtTime(700, t + 0.9);
  lp.connect(g).connect(dest);
  for (const [type, mult, amp] of [
    ["triangle", 1, 1],
    ["sine", 2, 0.25],
  ] as const) {
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = freq * mult;
    const og = ctx.createGain();
    og.gain.value = amp;
    osc.connect(og).connect(lp);
    osc.start(t);
    osc.stop(t + 1.9);
  }
}
