import type { HexCoord } from "../../game/board";

/**
 * Dev-only capture framing for the real app (the video, `npm run capture:app`):
 * `?captureShot=q,r;q,r` (`&captureAz=<deg>`, `&captureDist=<world units>`, `&capturePolar=<deg>`)
 * holds the camera on `closeShotOn` of those hexes, e.g. Cinder Road's finale beat
 * `captureShot=7,3;8,3&captureAz=-55`; a distance or polar angle overrides the beat's own.
 * Parsed here (pure); applied by `CaptureShot` inside the Diorama in dev builds only.
 */
export function parseCaptureShot(
  search: string,
): { hexes: HexCoord[]; azimuth: number | undefined; distance?: number; polar?: number } | null {
  const params = new URLSearchParams(search);
  const hexes = (params.get("captureShot") ?? "")
    .split(";")
    .map((part) => part.split(",").map(Number))
    .filter((p) => p.length === 2 && p.every(Number.isFinite))
    .map(([q, r]) => ({ q, r }));
  if (hexes.length === 0) return null;
  const num = (name: string) => {
    const v = Number(params.get(name));
    return params.get(name) !== null && Number.isFinite(v) ? v : undefined;
  };
  const distance = num("captureDist");
  const polar = num("capturePolar");
  return { hexes, azimuth: num("captureAz"), ...(distance && distance > 0 ? { distance } : {}), ...(polar !== undefined ? { polar } : {}) };
}
