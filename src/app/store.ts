import { create } from "zustand";
import type { HexCoord } from "../game/board";

export type RenderQuality = "high" | "low";

type UiState = {
  quality: RenderQuality;
  setQuality: (quality: RenderQuality) => void;
  /** Diorama picking (T05): written by the renderer's raycasts, read by UI. */
  hoveredHex: HexCoord | null;
  hoveredSquadId: string | null;
  selectedHex: HexCoord | null;
  selectedSquadId: string | null;
  setHoveredHex: (hex: HexCoord | null) => void;
  setHoveredSquad: (squadId: string | null) => void;
  selectHex: (hex: HexCoord | null) => void;
  selectSquad: (squadId: string | null) => void;
  clearSelection: () => void;
};

const sameHex = (a: HexCoord | null, b: HexCoord | null) =>
  a === b || (!!a && !!b && a.q === b.q && a.r === b.r);

export const useAppStore = create<UiState>((set) => ({
  quality: "high",
  setQuality: (quality) => set({ quality }),
  hoveredHex: null,
  hoveredSquadId: null,
  selectedHex: null,
  selectedSquadId: null,
  // Skip no-op writes so pointer-move doesn't re-render subscribers every frame.
  setHoveredHex: (hex) => set((s) => (sameHex(s.hoveredHex, hex) ? s : { hoveredHex: hex })),
  setHoveredSquad: (squadId) => set((s) => (s.hoveredSquadId === squadId ? s : { hoveredSquadId: squadId })),
  selectHex: (hex) => set({ selectedHex: hex }),
  selectSquad: (squadId) => set({ selectedSquadId: squadId }),
  clearSelection: () => set({ selectedHex: null, selectedSquadId: null }),
}));
