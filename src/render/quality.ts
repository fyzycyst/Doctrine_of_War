import { useAppStore, type RenderQuality } from "../app/store";

/**
 * Render-scale policy (T05 perf finding: pixel fill is the whole cost). High is
 * capped at DPR 1.5 by default; full device DPR is the opt-in "ultra".
 */
export function canvasDpr(quality: RenderQuality, ultra = false): number | [number, number] {
  if (quality === "low") return 1;
  return ultra ? [1, 2] : [1, 1.5];
}

/** The canvas DPR for the current quality setting, including the opt-in ultra. */
export function useCanvasDpr(): number | [number, number] {
  const quality = useAppStore((s) => s.quality);
  const ultra = useAppStore((s) => s.ultra);
  return canvasDpr(quality, ultra);
}
