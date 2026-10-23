// Loudness for delivery: -16 LUFS integrated, true peak ≤ -1.5 dBTP. Platforms only turn loud
// files down, so -16 costs nothing there and plays at a sane level in a desktop player.
// Measure, then one linear gain to the target. If that gain would push the peaks past the
// ceiling, a short peak limiter after the gain catches only those transients (loudnorm's own
// fallback, "dynamic" mode, rides the level over seconds instead). The result is measured
// again, so what's reported is the encoded file. Only the audio is re-encoded; the picture is
// copied. render.ts runs it after every render; `npm run loudnorm -- <file> …` for any file.
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const TARGET = { lufs: -16, truePeak: -1.5 };
/** The limiter's sample-peak ceiling: under the true-peak target, with room for inter-sample peaks and the AAC encode. */
const LIMIT_DB = TARGET.truePeak - 1.5;

function ffmpeg(args: string[]): string {
  const result = spawnSync("ffmpeg", ["-hide_banner", "-nostats", ...args], { encoding: "utf8" });
  if (result.status !== 0) throw new Error(`ffmpeg failed (${result.status}): ${result.stderr.slice(-800)}`);
  return result.stderr;
}

/** Integrated loudness and true peak (EBU R128). */
export function measure(file: string) {
  const log = ffmpeg(["-i", file, "-af", "ebur128=peak=true", "-f", "null", "-"]);
  const summary = log.slice(log.lastIndexOf("Summary:"));
  const value = (pattern: RegExp) => Number(pattern.exec(summary)?.[1] ?? NaN);
  return { lufs: value(/I:\s+(-?[\d.]+) LUFS/), truePeak: value(/Peak:\s+(-?[\d.]+) dBFS/) };
}

export function loudnorm(file: string) {
  const before = measure(file);
  const gain = TARGET.lufs - before.lufs;
  const limited = before.truePeak + gain > TARGET.truePeak;
  const filter = limited ? `volume=${gain.toFixed(2)}dB,alimiter=limit=${10 ** (LIMIT_DB / 20)}:attack=1:release=50:level=0` : `volume=${gain.toFixed(2)}dB`;
  const temp = path.join(path.dirname(file), `.loudnorm-${path.basename(file)}`);
  ffmpeg(["-y", "-i", file, "-map", "0:v", "-map", "0:a", "-c:v", "copy", "-af", filter, "-ar", "48000", "-c:a", "aac", "-b:a", "320k", "-movflags", "+faststart", temp]);
  fs.renameSync(temp, file);
  const after = measure(file);
  return {
    before: `${before.lufs} LUFS, ${before.truePeak} dBTP`,
    after: `${after.lufs} LUFS, ${after.truePeak} dBTP`,
    mode: limited ? `linear gain ${gain.toFixed(1)} dB + peak limiter at ${LIMIT_DB} dBFS` : `linear gain ${gain.toFixed(1)} dB`,
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  for (const file of process.argv.slice(2)) console.log(`loudnorm ${file}: ${JSON.stringify(loudnorm(file))}`);
}
