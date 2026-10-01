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
