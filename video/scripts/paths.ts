// Where things live. Media and renders stay outside git, in DOW_VIDEO_DIR
// (default ~/DoctrineOfWar-video); video/public/ (gitignored) links to its folders.
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const home = (dir: string) => (dir.startsWith("~") ? path.join(os.homedir(), dir.slice(1)) : dir);

export const VIDEO_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const REPO_DIR = path.resolve(VIDEO_DIR, "..");
export const MEDIA_DIR = path.resolve(home(process.env.DOW_VIDEO_DIR ?? "~/DoctrineOfWar-video"));
/** The art-spike worktree's captures (stand-in stills only). */
export const ART_SPIKE_DIR = path.resolve(home(process.env.DOW_ART_SPIKE ?? path.join(REPO_DIR, "..", "hack-t02-art-spike")));
export const PUBLIC_DIR = path.join(VIDEO_DIR, "public");
/** Renders and captions (DOW_OUT_DIR to send a test render elsewhere). */
export const OUT_DIR = path.resolve(home(process.env.DOW_OUT_DIR ?? path.join(MEDIA_DIR, "out")));
export const GENERATED = path.join(VIDEO_DIR, "src", "generated", "media.json");
/** The media folders the compositions read (out/ is not one: renders never go into a bundle). */
export const LINKED = ["footage", "music", "vo", "vo-temp", "stills", "intro", "work"] as const;
