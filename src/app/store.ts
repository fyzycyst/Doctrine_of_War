import { create } from "zustand";

export type RenderQuality = "high" | "low";

type UiState = {
  quality: RenderQuality;
  setQuality: (quality: RenderQuality) => void;
};

export const useAppStore = create<UiState>((set) => ({
  quality: "high",
  setQuality: (quality) => set({ quality }),
}));
