import { useEffect } from "react";
import type { AmbienceSpec } from "./ambience";
import { AudioEngine, type SfxName } from "./engine";
import type { MusicMood } from "./music";

export type { AmbienceSpec, AmbientBed } from "./ambience";
export { ambienceMix, AMBIENT_BEDS } from "./ambience";
export { SFX_NAMES, type SfxName } from "./engine";

/**
 * Audio public API (T08). One engine for the app:
 * - `unlockAudio()` from a user gesture (browsers block audio until then);
 * - `setAmbience(spec)` / `useAmbience(spec)` cross-fade the ambient beds;
 * - `playSfx(name)`: clash, horn, card, seal, rout, dread, reveal;
 * - war drums follow battle intensity: `setDrumIntensity(base)`, `swellDrums(moment)`.
 * Mute and volume live in `useAudioStore` (src/app/audioStore.ts), persisted.
 */
export const audio = new AudioEngine();

export const unlockAudio = () => audio.unlock();
export const playSfx = (name: SfxName) => audio.playSfx(name);
export const setAmbience = (spec: AmbienceSpec) => audio.setAmbience(spec);
/** War-drum resting level, 0..1 (T20): `DRUM_BASE.command` in command windows, `DRUM_BASE.playback` during playback. */
export const setDrumIntensity = (base: number) => audio.setDrumIntensity(base);
/** Swell the drums for a moment: clash, rout, horn, dread and reveal SFX do it themselves; "dawn" fires on predawn → sunrise. */
export const swellDrums = (moment: "clash" | "rout" | "horn" | "dread" | "reveal" | "dawn") => audio.swellDrums(moment);
export { DRUM_BASE } from "./drums";
/**
 * The background score (T20): follows the battle's time of day by itself;
 * menus can pin a mood ("dusk", "sunrise", ...) or pass null for silence, and
 * undefined releases the pin so the score follows the battle again (T19).
 * Volume: `useAudioStore.musicVolume`; it ducks under every SFX.
 */
export const setMusic = (mood: MusicMood | null | undefined) => audio.setMusic(mood);
/** End-of-battle stinger (T20b): a horn fanfare for "victory", a low cello line for "defeat". */
export const playSting = (kind: "victory" | "defeat") => audio.playSting(kind);
export { MOODS, type MusicMood } from "./music";

/** Keeps the ambience in sync with a spec and unlocks on the first gesture. */
export function useAmbience(spec: AmbienceSpec) {
  const { timeOfDay, weather, water, hostDrums } = spec;
  useEffect(() => {
    setAmbience({ timeOfDay, weather, water, hostDrums });
  }, [timeOfDay, weather, water, hostDrums]);
  useEffect(() => {
    const unlock = () => void unlockAudio();
    window.addEventListener("pointerdown", unlock, { once: true });
    window.addEventListener("keydown", unlock, { once: true });
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
  }, []);
}
