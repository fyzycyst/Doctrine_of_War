// The edit's camera moves (script.ts `Move`): slow, eased, and small. Pans and tilts travel
// ±PAN% of the frame inside OVERSCAN, which hides the edges; zooms stay within ZOOM over the
// whole move; drift turns ±DRIFT° inside the same overscan.
import type { ReactNode } from "react";
import { AbsoluteFill, Easing, interpolate, useCurrentFrame } from "remotion";
import type { Move } from "./script";

export const ZOOM = 0.045;
export const PAN = 1.8;
export const DRIFT = 1.2;
export const OVERSCAN = 1.05;

/** The CSS transform for `move` at progress `t` (0–1). */
export function moveTransform(move: Move, t: number): string {
  const sweep = -1 + 2 * t; // -1 → 1
  switch (move) {
    case "push-in":
      return `scale(${1 + ZOOM * t})`;
    case "pull-out":
      return `scale(${1 + ZOOM * (1 - t)})`;
    // The camera pans left, so the picture slides right (and so on).
    case "pan-left":
      return `scale(${OVERSCAN}) translateX(${sweep * PAN}%)`;
    case "pan-right":
      return `scale(${OVERSCAN}) translateX(${-sweep * PAN}%)`;
    case "tilt-up":
      return `scale(${OVERSCAN}) translateY(${sweep * PAN}%)`;
    case "tilt-down":
      return `scale(${OVERSCAN}) translateY(${-sweep * PAN}%)`;
    case "drift":
      return `scale(${OVERSCAN}) rotate(${sweep * DRIFT}deg)`;
    case "none":
      return "none";
  }
}

export function Motion({ move, frames, origin = [0.5, 0.5], children }: { move: Move; frames: number; origin?: [number, number]; children: ReactNode }) {
  const frame = useCurrentFrame();
  const t = interpolate(frame, [0, Math.max(1, frames - 1)], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.bezier(0.33, 0, 0.67, 1) });
  return <AbsoluteFill style={{ transform: moveTransform(move, t), transformOrigin: `${origin[0] * 100}% ${origin[1] * 100}%` }}>{children}</AbsoluteFill>;
}
