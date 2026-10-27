// Stand-in stills for each shot until the render agent's clips arrive (footage/manifest.json).
// `npm run prepare-media` copies them into the media folder's stills/ (captures/ is not in
// git, so a copy made once on this machine is kept). Several stills in a shot cut evenly.
import type { ShotId } from "./script";

export interface StillSource {
  /** Where the PNG comes from: this repo, or the art-spike worktree's captures. */
  from: "repo" | "art-spike";
  path: string;
  /** The push-in's centre, 0–1 (also the 9:16 crop's centre). */
  focalX: number;
  focalY: number;
}

const repo = (path: string, focalX = 0.5, focalY = 0.5): StillSource => ({ from: "repo", path, focalX, focalY });
const spike = (path: string, focalX = 0.5, focalY = 0.5): StillSource => ({ from: "art-spike", path, focalX, focalY });

export const STILLS: Record<ShotId, StillSource[]> = {
  "s01-cold-open": [repo("captures/app/play-rule-1600.png", 0.6, 0.38)],
  "s02-title": [spike("captures/emberFord-dusk.png", 0.45, 0.5)],
  "s03-orders": [repo("captures/app/command-lift-1600.png", 0.62, 0.62), repo("captures/app/t32-04-seal-1600.png", 0.85, 0.82)],
  "s04-playback": [repo("captures/app/play-surge-1600.png", 0.6, 0.4), repo("captures/app/play-rout-1600.png", 0.55, 0.45)],
  "s05-ember-ford": [spike("captures/emberFord-nightFires.png", 0.5, 0.5), repo("captures/app/play-dread-1600.png", 0.6, 0.42)],
  "s06-hold-for-dawn": [spike("captures/holdForDawn-sunrise.png", 0.5, 0.5), repo("captures/app/qa-hfd-dawn-1600.png", 0.6, 0.55)],
  "s07-call-the-banners": [repo("docs/media/roll.png", 0.45, 0.45)],
  "s08-cinder-road": [
    spike("captures/m2-sluice-night.png", 0.45, 0.5),
    repo("docs/media/wagon-park.png", 0.55, 0.5),
    repo("docs/media/harrying.png", 0.65, 0.5),
  ],
  "s09-finale": [repo("docs/media/finale.png", 0.4, 0.5)],
  "s10-editor": [repo("captures/app/t19-editor-field-test-1600.png", 0.45, 0.62)],
  "s11-end-card": [spike("captures/holdForDawn-predawn.png", 0.5, 0.5)],
};

/** In git, so always there: used when a stand-in is missing on this machine. */
export const FALLBACK_STILL = repo("docs/media/title.png");
