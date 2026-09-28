import { useEffect } from "react";
import type { AmbienceSpec } from "./ambience";
import { AudioEngine, type SfxName } from "./engine";

export type { AmbienceSpec, AmbientBed } from "./ambience";
export { ambienceMix, AMBIENT_BEDS } from "./ambience";
export { SFX_NAMES, type SfxName } from "./engine";

/**
 * Audio public API (T08). One engine for the app:
 * - `unlockAudio()` from a user gesture (browsers block audio until then);
 * - `setAmbience(spec)` / `useAmbience(spec)` cross-fade the ambient beds;
 * - `playSfx(name)`: clash, horn, card, seal, rout, dread, reveal.
 * Mute and volume live in `useAudioStore` (src/app/audioStore.ts), persisted.
 */
export const audio = new AudioEngine();

export const unlockAudio = () => audio.unlock();
export const playSfx = (name: SfxName) => audio.playSfx(name);
export const setAmbience = (spec: AmbienceSpec) => audio.setAmbience(spec);

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
