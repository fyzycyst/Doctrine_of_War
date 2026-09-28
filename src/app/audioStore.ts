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
  setMuted: (muted: boolean) => void;
  toggleMuted: () => void;
  setVolume: (volume: number) => void;
}

export const AUDIO_STORAGE_KEY = "doctrine-of-war.audio";

export const useAudioStore = create<AudioSettings>()(
  persist(
    (set) => ({
      muted: false,
      volume: 0.7,
      setMuted: (muted) => set({ muted }),
      toggleMuted: () => set((s) => ({ muted: !s.muted })),
      setVolume: (volume) => set({ volume: Math.max(0, Math.min(1, volume)) }),
    }),
    {
      name: AUDIO_STORAGE_KEY,
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({ muted: s.muted, volume: s.volume }),
    },
  ),
);
