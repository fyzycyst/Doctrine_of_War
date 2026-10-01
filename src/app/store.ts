import { create } from "zustand";
import type { HexCoord } from "../game/board";

export type RenderQuality = "high" | "low";
/** "system" follows prefers-reduced-motion; the others override it (Settings). */
export type MotionPreference = "system" | "reduce" | "full";
/** Depth of field (tilt-shift) strength (Settings, T20): "subtle" by default. */
export type DofMode = "on" | "subtle" | "off";

type UiState = {
  quality: RenderQuality;
  setQuality: (quality: RenderQuality) => void;
  /** Full device DPR on high quality (Settings: "Ultra"). */
  ultra: boolean;
  motion: MotionPreference;
  /** Depth-of-field mode (T20); the renderer's tilt-shift reads it. */
  dofMode: DofMode;
  setDisplay: (patch: { ultra?: boolean; motion?: MotionPreference; dofMode?: DofMode }) => void;
  /**
   * The company the depth of field should hold in focus during playback (the
   * active one); null falls back to the selected squad, then the board centre.
   */
  focusSquadId: string | null;
  setFocusSquad: (squadId: string | null) => void;
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
  ultra: false,
  motion: "system",
  dofMode: "subtle",
  setDisplay: (patch) => set(patch),
  focusSquadId: null,
  setFocusSquad: (squadId) => set((s) => (s.focusSquadId === squadId ? s : { focusSquadId: squadId })),
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
