// `npm run prepare-media` (run by studio, render and srt): links the media folder into
// public/, copies the stand-in stills, makes any missing temporary VO, and writes
// src/generated/media.json: what exists and how long it runs, for the timeline.
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { SHOTS, type ShotId, type Stem } from "../src/script";
import { FALLBACK_STILL, STILLS, type StillSource } from "../src/stills";
import type { Media } from "../src/timeline";
import { ART_SPIKE_DIR, GENERATED, LINKED, MEDIA_DIR, OUT_DIR, PUBLIC_DIR, REPO_DIR, VIDEO_DIR } from "./paths";

const STEMS: Stem[] = ["dusk", "battle", "dawn", "victory"];
const AUDIO = /\.(wav|mp3|m4a|aac|ogg)$/i;

const seconds = (file: string) =>
  Number(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file], { encoding: "utf8" }).trim());
/** Integrated loudness (EBU R128), in LUFS. */
const lufs = (file: string) => {
  const log = spawnSync("ffmpeg", ["-hide_banner", "-nostats", "-i", file, "-af", "ebur128", "-f", "null", "-"], { encoding: "utf8" }).stderr;
  return Number(/I:\s+(-?[\d.]+) LUFS/.exec(log.slice(log.lastIndexOf("Summary:")))?.[1] ?? NaN);
};
const rel = (file: string) => path.relative(MEDIA_DIR, file).split(path.sep).join("/");

// 1. Folders, and public/ linking to them.
for (const dir of [...LINKED, "out"]) fs.mkdirSync(path.join(MEDIA_DIR, dir), { recursive: true });
fs.mkdirSync(PUBLIC_DIR, { recursive: true });
for (const dir of LINKED) {
  const link = path.join(PUBLIC_DIR, dir);
  const target = path.join(MEDIA_DIR, dir);
  const current = fs.lstatSync(link, { throwIfNoEntry: false });
  if (current?.isSymbolicLink() && fs.readlinkSync(link) === target) continue;
  if (current) fs.rmSync(link, { recursive: true, force: true });
  fs.symlinkSync(target, link);
}

// 2. Stand-in stills (a copy made once is kept: captures/ is not in git).
const sourceOf = (still: StillSource) => path.join(still.from === "repo" ? REPO_DIR : ART_SPIKE_DIR, still.path);
const stills: Media["stills"] = {};
for (const shot of SHOTS) {
  stills[shot.id] = STILLS[shot.id].map((still, index) => {
    const dest = path.join(MEDIA_DIR, "stills", `${shot.id}-${index + 1}.png`);
    const source = sourceOf(still);
    if (fs.existsSync(source)) fs.copyFileSync(source, dest);
    else if (!fs.existsSync(dest)) {
      console.warn(`stills: ${still.path} not found; using ${FALLBACK_STILL.path} for ${shot.id}`);
      fs.copyFileSync(sourceOf(FALLBACK_STILL), dest);
    }
    return { file: rel(dest), focalX: still.focalX, focalY: still.focalY };
  });
}

// 3. VO: the user's takes (vo/vo-NN.mp3 or .wav); otherwise the temporary voice.
execFileSync("bash", [path.join(VIDEO_DIR, "scripts", "temp-vo.sh")], { stdio: "inherit" });
const vo: Media["vo"] = {};
for (const line of SHOTS.flatMap((shot) => (shot.vo ? [shot.vo] : []))) {
  const final = ["mp3", "wav"].map((ext) => path.join(MEDIA_DIR, "vo", `${line.id}.${ext}`)).find((file) => fs.existsSync(file));
  const temp = path.join(MEDIA_DIR, "vo-temp", `${line.id}.wav`);
  const file = final ?? (fs.existsSync(temp) ? temp : null);
  if (file) vo[line.id] = { file: rel(file), seconds: seconds(file), lufs: lufs(file), source: final ? "final" : "temp" };
  else console.warn(`vo: no take for ${line.id}; its shot runs silent at its target length`);
}

// 4. Footage clips from the render agent's manifest.
const clips: Media["clips"] = {};
const manifestFile = path.join(MEDIA_DIR, "footage", "manifest.json");
if (fs.existsSync(manifestFile)) {
  const manifest = JSON.parse(fs.readFileSync(manifestFile, "utf8")) as { shots?: Array<{ id: string; file: string; seconds?: number; focalX?: number }> };
  const ids = new Set<string>(SHOTS.map((shot) => shot.id));
  // A montage's parts are named for its shot's number plus a letter (s08a-…, s08b-…).
  const partOf = (id: string) => SHOTS.find((shot) => new RegExp(`^${shot.id.slice(0, 3)}[a-z]-`).test(id))?.id;
  const parts: Partial<Record<ShotId, Array<{ id: string; file: string; seconds: number; focalX: number }>>> = {};
  for (const entry of manifest.shots ?? []) {
    const file = path.join(MEDIA_DIR, "footage", entry.file);
    const focalX = Math.min(1, Math.max(0, entry.focalX ?? 0.5));
    const part = partOf(entry.id);
    if (!fs.existsSync(file)) console.warn(`footage: ${entry.file} (for ${entry.id}) is missing; ignored`);
    else if (ids.has(entry.id)) clips[entry.id as ShotId] = { file: rel(file), seconds: seconds(file), focalX };
    else if (part) (parts[part] ??= []).push({ id: entry.id, file: rel(file), seconds: seconds(file), focalX });
    else console.warn(`footage: manifest id ${entry.id} is not a shot in script.ts; ignored`);
  }
  for (const [id, list] of Object.entries(parts) as Array<[ShotId, NonNullable<(typeof parts)[ShotId]>]>) {
    const sorted = list.sort((a, b) => a.id.localeCompare(b.id)).map(({ file, seconds: length, focalX }) => ({ file, seconds: length, focalX }));
    const whole = clips[id];
    if (whole) whole.parts = sorted;
  }
}

// 5. Music stems, by file-name prefix.
const music: Media["music"] = {};
const musicFiles = fs.readdirSync(path.join(MEDIA_DIR, "music")).filter((name) => AUDIO.test(name)).sort();
for (const stem of STEMS) {
  const name = musicFiles.find((file) => file.toLowerCase().startsWith(stem));
  if (name) music[stem] = { file: `music/${name}`, seconds: seconds(path.join(MEDIA_DIR, "music", name)), lufs: lufs(path.join(MEDIA_DIR, "music", name)) };
}

const media: Media = { vo, clips, stills, music };
fs.mkdirSync(path.dirname(GENERATED), { recursive: true });
const json = `${JSON.stringify(media, null, 2)}\n`;
if (!fs.existsSync(GENERATED) || fs.readFileSync(GENERATED, "utf8") !== json) fs.writeFileSync(GENERATED, json);

const count = (record: object) => Object.keys(record).length;
const montages = Object.entries(clips).filter(([, clip]) => clip.parts).map(([id, clip]) => `${id} (${clip.parts!.length} parts)`);
if (montages.length) console.log(`footage: cut from parts: ${montages.join(", ")}`);
const finals = Object.values(vo).filter((take) => take.source === "final").length;
console.log(
  `media: ${MEDIA_DIR} · VO ${count(vo)}/10 (${finals} final, ${count(vo) - finals} temp) · clips ${count(clips)}/${SHOTS.length} · stems ${Object.keys(music).join(", ") || "none"} · out ${OUT_DIR}`,
);
