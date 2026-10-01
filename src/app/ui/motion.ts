// The app and the renderer share one reduced-motion hook: the OS preference, unless
// Settings override it (src/render/motion.ts reads the override from the app store).
import type { HexCoord } from "../../game/board";

export { usePrefersReducedMotion } from "../../render/motion";

/**
 * How the board camera behaves (T19 playtest: "the map shifts around" during playback).
 * While a phase plays the camera stays where the player put it: no idle drift and no lean
 * toward the action, though the player may still orbit. The acting company is emphasised
 * on the board instead (a pulsing hex outline).
 */
export function boardCamera({ stage, still, reducedMotion, focus }: { stage: string; still: boolean; reducedMotion: boolean; focus: HexCoord | null }) {
  const playing = stage === "resolving";
  return { drift: !still && !reducedMotion && !playing, emphasisHex: playing ? focus : null };
}
