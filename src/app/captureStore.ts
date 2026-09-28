import { create } from "zustand";

/**
 * Capture mode (T13): when on, every UI layer hides so the diorama can be
 * recorded clean. Starts on with `?capture=1`; UI components should render
 * nothing (or only the scene) while `captureMode` is true.
 */
export interface CaptureState {
  captureMode: boolean;
  setCaptureMode: (on: boolean) => void;
}

function fromUrl(): boolean {
  if (typeof window === "undefined") return false;
  return new URLSearchParams(window.location.search).get("capture") === "1";
}

export const useCaptureStore = create<CaptureState>((set) => ({
  captureMode: fromUrl(),
  setCaptureMode: (captureMode) => set({ captureMode }),
}));
