import { describe, expect, it } from "vitest";
import { DRUM_BASE, drumBar, DrumIntensity, drumTempo } from "./drums";

describe("war drums", () => {
  it("thin to a slow low-tom pulse when calm and fill out in battle", () => {
    const calm = drumBar(0.1, 0);
    expect(calm.every((h) => h.voice === "low")).toBe(true);
    expect(calm.length).toBeGreaterThanOrEqual(2);
    const battle = drumBar(0.9, 0);
    expect(battle.length).toBeGreaterThan(calm.length * 2);
    expect(new Set(battle.map((h) => h.voice))).toEqual(new Set(["low", "high", "rim"]));
    // Harder hits in battle.
    const loudest = (hits: ReturnType<typeof drumBar>) => Math.max(...hits.map((h) => h.velocity));
    expect(loudest(battle)).toBeGreaterThan(loudest(calm));
  });

  it("is not a heartbeat: low-tom accents are irregularly spaced across the bar", () => {
    const steps = drumBar(0.5, 0).filter((h) => h.voice === "low").map((h) => h.step);
    const gaps = steps.slice(1).map((s, i) => s - steps[i]);
    expect(new Set(gaps).size).toBeGreaterThan(1);
    // Bars vary, and the turnaround only rolls in when the battle is hot.
    expect(drumBar(0.6, 1)).not.toEqual(drumBar(0.6, 0));
    expect(drumBar(0.9, 3).length).toBeGreaterThan(drumBar(0.4, 3).length);
  });

  it("quickens with intensity", () => {
    expect(drumTempo(1)).toBeGreaterThan(drumTempo(0));
  });

  it("swells over the base and falls back", () => {
    const k = new DrumIntensity(DRUM_BASE.command);
    expect(k.value(0)).toBeCloseTo(DRUM_BASE.command);
    k.swell(1, 10, 2, 4);
    expect(k.value(11)).toBe(1);
    expect(k.value(14)).toBeCloseTo(0.5);
    expect(k.value(20)).toBeCloseTo(DRUM_BASE.command);
    k.setBase(DRUM_BASE.playback);
    expect(k.value(30)).toBeCloseTo(DRUM_BASE.playback);
  });
});
