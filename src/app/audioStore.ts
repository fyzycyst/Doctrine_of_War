import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

/**
 * Global audio settings (T08), persisted in localStorage. Kept in its own
 * store so it never collides with the game UI's store.
 */
export interface AudioSettings {
  muted: boolean;
  /** Master volume, 0..1. */
  volume: number;
  /** Background score volume, 0..1, under the master (T20). */
  musicVolume: number;
  setMuted: (muted: boolean) => void;
  toggleMuted: () => void;
  setVolume: (volume: number) => void;
  setMusicVolume: (volume: number) => void;
}

export const AUDIO_STORAGE_KEY = "doctrine-of-war.audio";

export const useAudioStore = create<AudioSettings>()(
  persist(
    (set) => ({
      muted: false,
      volume: 0.7,
      musicVolume: 0.6,
      setMuted: (muted) => set({ muted }),
      toggleMuted: () => set((s) => ({ muted: !s.muted })),
      setVolume: (volume) => set({ volume: Math.max(0, Math.min(1, volume)) }),
      setMusicVolume: (musicVolume) => set({ musicVolume: Math.max(0, Math.min(1, musicVolume)) }),
    }),
    {
      name: AUDIO_STORAGE_KEY,
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({ muted: s.muted, volume: s.volume, musicVolume: s.musicVolume }),
    },
  ),
);
