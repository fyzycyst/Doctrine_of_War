import { describe, expect, it } from "vitest";
import { AUDIO_STORAGE_KEY, useAudioStore } from "../app/audioStore";
import { ambienceMix, AMBIENT_BEDS, playSfx, SFX_NAMES } from "./index";

describe("audio", () => {
  it("mixes ambient beds from time of day and weather", () => {
    const calm = ambienceMix({ timeOfDay: "dusk", weather: "clear", water: false, hostDrums: true });
    expect(calm.rain).toBe(0);
    expect(calm.river).toBe(0);
    expect(calm.drums).toBeGreaterThan(0);
    const storm = ambienceMix({ timeOfDay: "dusk", weather: "rain", water: true, hostDrums: false });
    expect(storm.rain).toBeGreaterThan(0.5);
    expect(storm.drums).toBe(0);
    const ember = ambienceMix({ timeOfDay: "nightFires", weather: "ashWind", water: true, hostDrums: true });
    expect(ember.fire).toBeGreaterThan(0);
    expect(ember.wind).toBeGreaterThan(calm.wind);
    for (const bed of AMBIENT_BEDS) expect(ember[bed]).toBeGreaterThanOrEqual(0);
  });

  it("is a silent no-op before unlock / without Web Audio", () => {
    for (const name of SFX_NAMES) expect(() => playSfx(name)).not.toThrow();
  });

  it("persists mute and volume", () => {
    useAudioStore.getState().setVolume(1.4);
    expect(useAudioStore.getState().volume).toBe(1);
    useAudioStore.getState().toggleMuted();
    const saved = JSON.parse(localStorage.getItem(AUDIO_STORAGE_KEY) ?? "{}");
    expect(saved.state).toEqual({ muted: true, volume: 1 });
  });
});
