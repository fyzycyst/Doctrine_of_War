import { create } from "zustand";
import { pressed } from "./shortcuts";

/**
 * Capture mode (T13): when on, every UI layer hides so the diorama can be
 * recorded clean. Starts on with `?capture=1`; UI components should render
 * nothing (or only the scene) while `captureMode` is true.
 */
export interface CaptureState {
  captureMode: boolean;
  /** Keep the in-world playback callouts in capture mode (default: they are the pitch; `&callouts=0` hides them). */
  keepCallouts: boolean;
  setCaptureMode: (on: boolean) => void;
}

function urlParam(name: string): string | null {
  if (typeof window === "undefined") return null;
  return new URLSearchParams(window.location.search).get(name);
}

const fromUrl = (name: string) => urlParam(name) === "1";

export const useCaptureStore = create<CaptureState>((set) => ({
  captureMode: fromUrl("capture"),
  keepCallouts: urlParam("callouts") !== "0",
  setCaptureMode: (captureMode) => set({ captureMode }),
}));

/** Ctrl/⌘ + Shift + H toggles capture mode, so footage can start mid-battle. */
export function isCaptureToggle(event: Pick<KeyboardEvent, "key" | "shiftKey" | "ctrlKey" | "metaKey">): boolean {
  return pressed("capture", event);
}
