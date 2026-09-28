import { describe, expect, it } from "vitest";
import { emberDusk } from "../skins/emberDusk";
import { SKINS, WEATHER_KINDS } from "../skins";
import { AtmosphereRuntime, FOG_REVEAL_TIME, mixWeather, WEATHER_FADE, weightsFor } from "./atmosphereRuntime";

const presets = emberDusk.weather;

function run(rt: AtmosphereRuntime, seconds: number, step = 1 / 60) {
  for (let t = 0; t < seconds; t += step) rt.tick(step);
}

describe("weather mix", () => {
  it("clear is neutral", () => {
    const m = mixWeather(presets, weightsFor("clear"));
    expect(m.sunScale).toBe(1);
    expect(m.rain).toBe(0);
    expect(m.ash).toBe(0);
    expect(m.wetness).toBe(0);
    expect(m.mistDensityAdd).toBe(0);
  });

  it("blends linearly between presets", () => {
    const half = mixWeather(presets, { clear: 0.5, rain: 0.5, mist: 0, ashWind: 0 });
    expect(half.rain).toBeCloseTo(0.5);
    expect(half.wetness).toBeCloseTo(0.5);
    expect(half.sunScale).toBeCloseTo((1 + presets.rain.light.sunScale) / 2);
    expect(mixWeather(presets, weightsFor("ashWind")).ash).toBe(1);
  });

  it("every skin defines every weather", () => {
    for (const skin of Object.values(SKINS)) for (const w of WEATHER_KINDS) expect(skin.weather[w].id).toBe(w);
  });
});

describe("atmosphere runtime", () => {
  it("cross-fades weather over WEATHER_FADE seconds", () => {
    const rt = new AtmosphereRuntime(presets, "clear");
    rt.setWeather("rain");
    run(rt, WEATHER_FADE / 2);
    expect(rt.weights.rain).toBeGreaterThan(0.4);
    expect(rt.weights.rain).toBeLessThan(0.6);
    run(rt, WEATHER_FADE);
    expect(rt.weights.rain).toBeCloseTo(1);
    expect(rt.weights.clear).toBeCloseTo(0);
    expect(rt.mix.rain).toBeCloseTo(1);
  });

  it("fogs unseen hexes immediately on mount and reveals over FOG_REVEAL_TIME", () => {
    const rt = new AtmosphereRuntime(presets, "clear");
    const hexes = [
      { q: 0, r: 0 },
      { q: 1, r: 0 },
    ];
    rt.setFog(hexes, [{ q: 1, r: 0 }], true);
    expect(rt.fog.get("0,0")).toBe(1);
    expect(rt.fog.get("1,0")).toBe(0);
    const v = rt.fogVersion;
    rt.setFog(hexes, hexes);
    run(rt, FOG_REVEAL_TIME / 2);
    expect(rt.fog.get("0,0")).toBeGreaterThan(0.3);
    expect(rt.fog.get("0,0")).toBeLessThan(0.7);
    run(rt, FOG_REVEAL_TIME);
    expect(rt.fog.get("0,0")).toBeCloseTo(0);
    expect(rt.fogVersion).toBeGreaterThan(v);
  });

  it("no visibility means no fog, and timeScale 0 freezes", () => {
    const rt = new AtmosphereRuntime(presets, "mist");
    rt.setFog([{ q: 0, r: 0 }], null, true);
    expect(rt.fog.get("0,0")).toBe(0);
    rt.timeScale = 0;
    rt.setWeather("clear");
    run(rt, 5);
    expect(rt.weights.mist).toBe(1);
  });
});
