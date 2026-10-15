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
    expect(saved.state).toEqual({ muted: true, volume: 1, musicVolume: 0.6 });
    useAudioStore.getState().setMusicVolume(-1);
    expect(useAudioStore.getState().musicVolume).toBe(0);
    useAudioStore.getState().setMusicVolume(0.6);
  });

  it("silences every bed (drums included) when the ambience is cleared for the menus", async () => {
    const { ambienceTargets } = await import("./ambience");
    const battle = ambienceTargets({ timeOfDay: "nightFires", weather: "ashWind", water: true, hostDrums: true });
    expect(battle.drums).toBeGreaterThan(0);
    const menu = ambienceTargets(null);
    for (const bed of AMBIENT_BEDS) expect(menu[bed]).toBe(0);
  });

  it("keeps the score playing between screens: no pin and no battle yet keeps the last mood", async () => {
    const { resolveMood } = await import("./engine");
    expect(resolveMood("dusk", null, null)).toBe("dusk");
    expect(resolveMood(undefined, { timeOfDay: "predawn", weather: "clear", water: false, hostDrums: true }, "dusk")).toBe("predawn");
    // Released for a battle whose ambience hasn't arrived yet: keep playing the menu's mood.
    expect(resolveMood(undefined, null, "dusk")).toBe("dusk");
    expect(resolveMood(null, null, "dusk")).toBeNull();
  });
});
