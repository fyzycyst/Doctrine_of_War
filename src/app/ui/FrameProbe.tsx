import { useFrame } from "@react-three/fiber";
import { useRef } from "react";

declare global {
  interface Window {
    /** Read by scripts/capture-app.mjs to know when a scene has settled. */
    __battleBoard?: { ready: boolean; frames: number };
  }
}

/** Counts frames inside a <Canvas> so captures wait for a settled scene. */
export function FrameProbe({ ready = true }: { ready?: boolean }) {
  const frames = useRef(0);
  useFrame(() => {
    frames.current += 1;
    window.__battleBoard = { ready: ready && frames.current > 90, frames: frames.current };
  });
  return null;
}
