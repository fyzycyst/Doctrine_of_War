// Loudness for delivery: two-pass ffmpeg loudnorm to -14 LUFS integrated, true peak ≤ -1 dBTP
// (measure, then a linear gain from the measurement). Only the audio is re-encoded; the
// picture is copied. render.ts runs it after every render; `npm run loudnorm -- <file> …` for any file.
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const TARGET = { lufs: -14, truePeak: -1, lra: 11 };
const BASE = `loudnorm=I=${TARGET.lufs}:TP=${TARGET.truePeak}:LRA=${TARGET.lra}`;

/** Runs ffmpeg and returns loudnorm's JSON report (ffmpeg writes it to stderr). */
function ffmpeg(args: string[]): Record<string, string> {
  const result = spawnSync("ffmpeg", ["-hide_banner", "-nostats", ...args], { encoding: "utf8" });
  if (result.status !== 0) throw new Error(`ffmpeg failed (${result.status}): ${result.stderr.slice(-800)}`);
  return JSON.parse(result.stderr.slice(result.stderr.lastIndexOf("{"), result.stderr.lastIndexOf("}") + 1)) as Record<string, string>;
}

export function loudnorm(file: string) {
  const m = ffmpeg(["-i", file, "-af", `${BASE}:print_format=json`, "-f", "null", "-"]);
  const apply = `${BASE}:measured_I=${m.input_i}:measured_TP=${m.input_tp}:measured_LRA=${m.input_lra}:measured_thresh=${m.input_thresh}:offset=${m.target_offset}:linear=true:print_format=json`;
  const temp = path.join(path.dirname(file), `.loudnorm-${path.basename(file)}`);
  const out = ffmpeg(["-y", "-i", file, "-map", "0:v", "-map", "0:a", "-c:v", "copy", "-af", apply, "-ar", "48000", "-c:a", "aac", "-b:a", "320k", "-movflags", "+faststart", temp]);
  fs.renameSync(temp, file);
  return { before: `${m.input_i} LUFS, ${m.input_tp} dBTP`, after: `${out.output_i} LUFS, ${out.output_tp} dBTP`, mode: out.normalization_type };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  for (const file of process.argv.slice(2)) console.log(`loudnorm ${file}: ${JSON.stringify(loudnorm(file))}`);
}
