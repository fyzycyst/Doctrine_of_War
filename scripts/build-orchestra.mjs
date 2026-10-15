// `npm run build:orchestra` (T20b): builds the score's sampled orchestra from
// Versilian Studios Chamber Orchestra 2 Community Edition (VSCO 2 CE), CC0 1.0:
//   https://versilian-studios.com/vsco-community/  ("Licensed under CC0")
//   https://github.com/sgossner/VSCO-2-CE           (LICENSE: CC0-1.0)
// It downloads a sparse subset of the WAVs to ~/.cache/vsco2ce (not committed), trims them
// with a release fade, peak-normalizes the tonal instruments (drums keep their dynamics),
// encodes mono Opus in Ogg to public/assets/audio/orch/ and writes src/audio/orchestraManifest.ts.
// The outputs are committed, so builds never need the network. Needs ffmpeg with libopus.
import { execFileSync, spawnSync } from "node:child_process";
import { access, mkdir, readdir, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const RAW = "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/";
const CACHE = path.join(os.homedir(), ".cache", "vsco2ce");
const OUT = path.resolve("public/assets/audio/orch");
const MANIFEST = path.resolve("src/audio/orchestraManifest.ts");

const NOTE = { C: 0, "C#": 1, D: 2, "D#": 3, E: 4, F: 5, "F#": 6, G: 7, "G#": 8, A: 9, "A#": 10, B: 11 };
/**
 * MIDI of a VSCO note name. VSCO 2's strings and brass name notes an octave below
 * scientific pitch (measured: the violin section's "A3" sounds 440 Hz); the harp
 * (KSHarp) uses scientific names, so `octaveShift` is 1 or 0 per instrument.
 */
const midiOf = (name, octaveShift) => {
  const m = /^([A-G]#?)(-?\d)$/.exec(name);
  if (!m) throw new Error(`bad note ${name}`);
  return (Number(m[2]) + 1 + octaveShift) * 12 + NOTE[m[1]];
};

/** Tonal instruments: directory, file pattern (NOTE is replaced), notes, octave shift, trim. */
const TONAL = {
  strings: { dir: "Strings/Violin Section/susVib", file: "VlnEns_susVib_NOTE_v1.wav", notes: ["G2", "B2", "D3", "F#3", "A3", "C4", "E4", "G4", "B4", "D5"], shift: 1, dur: 6, fade: 1.4 },
  celli: { dir: "Strings/Cello Section/susvib", file: "susvib_NOTE_v1_1.wav", notes: ["C1", "E1", "G1", "B1", "D2", "F2", "A2", "C3", "E3", "G3", "B3", "D4"], shift: 1, dur: 6, fade: 1.4 },
  basses: { dir: "Strings/Solo Contrabass/SusNV", file: "BKCtbss_SusNV_NOTE_v1_rr1.wav", notes: ["E0", "G0", "A#0", "C1", "D1", "E1", "F#1", "G#1", "A1"], shift: 1, dur: 6, fade: 1.4 },
  horns: { dir: "Brass/F Horn/sus", file: "MOHorn_sus_NOTE_v2_1.wav", notes: ["G1", "A#1", "C1", "D#1", "D2", "F2", "A2", "C3"], shift: 1, dur: 4.5, fade: 1.1 },
  trombones: { dir: "Brass/Tenor Trombone/sus", file: "tenortbn_sus_NOTE_v2_1.wav", notes: ["A#0", "C#1", "F1", "A#1", "D2", "F2"], shift: 1, dur: 4.5, fade: 1.1 },
  tuba: { dir: "Brass/Tuba/sus", file: "Tuba3_sus_NOTE_v2_rr1_Mid.wav", notes: ["A#0", "D#1", "F1", "A#1", "D2", "F2"], shift: 1, dur: 4.5, fade: 1.1 },
  harp: { dir: "Strings/Harp", file: "KSHarp_NOTE_mf.wav", notes: ["B1", "D2", "F2", "A2", "C3", "E3", "G3", "B3", "D4", "F4", "A4", "C5", "E5", "G5"], shift: 0, dur: 4, fade: 1.5 },
  // T20c, the victory fanfare: bright trumpets (loud layer), and short (staccato) brass for the pickups.
  trumpets: { dir: "Brass/Trumpet/sus", file: "Sum_SHTrumpet_sus_NOTE_v3_rr1.wav", notes: ["F2", "A2", "C3", "D#3", "G3", "A#3", "D4", "F4", "A4", "C5"], shift: 1, dur: 4, fade: 1 },
  trumpetsStac: { dir: "Brass/Trumpet/stac", file: "Sum_SHTrumpet_stac_NOTE_v3_rr1.wav", notes: ["F2", "A2", "C3", "D#3", "F3", "G3", "A#3", "D4", "F4", "A4", "C5"], shift: 1, dur: 1.2, fade: 0.45 },
  // The horn's staccato has no samples between C4 and D5 (sounding), so only its lower range is used.
  hornsStac: { dir: "Brass/F Horn/stac", file: (note) => `MOHorn_stac_${note}_v${["C1", "D#1", "G1"].includes(note) ? 2 : 3}_rr1.wav`, notes: ["C1", "D#1", "G1", "A#1", "D2", "F2", "A2", "C3"], shift: 1, dur: 1.2, fade: 0.45 },
  tromboneStac: { dir: "Brass/Tenor Trombone/stac", file: "tenortbn_stac_NOTE_v3_rr1.wav", notes: ["F1", "A#1", "F2", "A#2", "D3", "F3"], shift: 1, dur: 1.2, fade: 0.45 },
};

/** Percussion: plain files grouped by voice, from soft to loud (round-robin within a level). */
const PERC = {
  timpani: { dir: "Percussion/Timpani", files: ["Timpani4_Hit_v3_rr1_Sum.wav", "Timpani4_Hit_v4_rr1_Sum.wav", "Timpani2_Hit_v3_rr1_Sum.wav", "Timpani2_Hit_v4_rr1_Sum.wav", "Timpani3_Hit_v4_rr2_Sum.wav"], dur: 3.5, fade: 1.6 },
  timpaniRoll: { dir: "Percussion/Timpani/Rolls", files: ["Timpani2_Roll_v3_rr1_Sum.wav", "Timpani2_Roll_v5_rr1_Sum.wav"], dur: 6, fade: 1.6 },
  taiko: { dir: "VSCO 1 Percussion/drums/other/ethnic/giant/mallet", files: ["EthnicLargeMallet_hit_pp_1.wav", "EthnicLargeMallet_hit_mf_1.wav", "EthnicLargeMallet_hit_f_1.wav", "EthnicLargeMallet_hit_ff_1.wav", "EthnicLargeMallet_hit_ff_2.wav"], dur: 2.2, fade: 0.8 },
  tenor: { dir: "VSCO 1 Percussion/drums/tenor/tenor_lower", files: ["tenor_pp_1.wav", "tenor_mp_1.wav", "tenor_mf_1.wav", "tenor_f_1.wav", "tenor_ff_1.wav", "tenor_ff_2.wav"], dur: 1.4, fade: 0.5 },
  snare: { dir: "VSCO 1 Percussion/drums/snare/drum3_marching", files: ["snare3_p_1.wav", "snare3_mp_1.wav", "snare3_f_1.wav", "snare3_f_2.wav", "snare3_rimshot_f_1.wav"], dur: 0.8, fade: 0.3 },
  bassDrum: { dir: "VSCO 1 Percussion/drums/bass", files: ["bdrum_mp_1.wav", "bdrum_f_1.wav", "bdrum_ff_1.wav"], dur: 2.5, fade: 1 },
  cymbal: { dir: "VSCO 1 Percussion/varMetal/Cymbals/clash", files: ["crash_hit_ff_loose.wav", "crash_hit_fff_loose.wav"], dur: 3.2, fade: 1.6 },
};

const exists = (p) => access(p).then(() => true, () => false);

async function fetchWav(dir, file) {
  const local = path.join(CACHE, dir, file);
  if (await exists(local)) return local;
  await mkdir(path.dirname(local), { recursive: true });
  const url = RAW + [...dir.split("/"), file].map(encodeURIComponent).join("/");
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  await writeFile(local, Buffer.from(await res.arrayBuffer()));
  return local;
}

function peakDb(file) {
  const out = spawnSync("ffmpeg", ["-hide_banner", "-i", file, "-af", "volumedetect", "-f", "null", "-"], { encoding: "utf8" }).stderr;
  return Number(/max_volume: (-?[\d.]+) dB/.exec(out)?.[1] ?? 0);
}

/** Trim leading silence, cut to `dur` with a release fade, mono Opus. */
function encode(src, dst, { dur, fade, gainDb = 0 }) {
  const af = [
    "silenceremove=start_periods=1:start_threshold=-48dB:start_silence=0.01",
    `atrim=0:${dur}`,
    `afade=t=out:st=${Math.max(0, dur - fade)}:d=${fade}`,
    `volume=${gainDb}dB`,
  ].join(",");
  execFileSync("ffmpeg", ["-y", "-hide_banner", "-loglevel", "error", "-i", src, "-af", af, "-ac", "1", "-ar", "48000", "-c:a", "libopus", "-b:a", "56k", "-vbr", "on", dst]);
}

// Incremental: Opus output isn't byte-identical between runs, so existing files are kept
// (no churn in git) unless `--force` rebuilds everything.
const FORCE = process.argv.includes("--force");
if (FORCE) await rm(OUT, { recursive: true, force: true });
await mkdir(OUT, { recursive: true });
const manifest = { tonal: {}, perc: {} };

for (const [name, inst] of Object.entries(TONAL)) {
  manifest.tonal[name] = [];
  for (const note of inst.notes) {
    const src = await fetchWav(inst.dir, typeof inst.file === "function" ? inst.file(note) : inst.file.replace("NOTE", note));
    const midi = midiOf(note, inst.shift);
    const out = `${name}-${midi}.ogg`;
    if (FORCE || !(await exists(path.join(OUT, out)))) encode(src, path.join(OUT, out), { ...inst, gainDb: -1 - peakDb(src) });
    manifest.tonal[name].push({ midi, file: out });
    process.stdout.write(".");
  }
  manifest.tonal[name].sort((a, b) => a.midi - b.midi);
}
for (const [name, group] of Object.entries(PERC)) {
  manifest.perc[name] = [];
  // One gain for the whole group (from its loudest file) keeps the dynamics between layers.
  const sources = [];
  for (const file of group.files) sources.push(await fetchWav(group.dir, file));
  const gainDb = -1 - Math.max(...sources.map(peakDb));
  for (const [i, src] of sources.entries()) {
    const out = `${name}-${i}.ogg`;
    if (FORCE || !(await exists(path.join(OUT, out)))) encode(src, path.join(OUT, out), { ...group, gainDb });
    manifest.perc[name].push(out);
    process.stdout.write(".");
  }
}

let bytes = 0;
for (const f of await readdir(OUT)) bytes += (await stat(path.join(OUT, f))).size;
const ts = `// Generated by scripts/build-orchestra.mjs from VSCO 2 CE (CC0 1.0). Do not edit.
// ${Object.values(manifest.tonal).flat().length + Object.values(manifest.perc).flat().length} files, ${(bytes / 1e6).toFixed(2)} MB in public/assets/audio/orch/.

/** Tonal instruments: sparse sampled notes (MIDI, sounding pitch), sorted by pitch. */
export const ORCH_TONAL = ${JSON.stringify(manifest.tonal, null, 2)} as const;

/** Percussion voices: files from soft to loud. */
export const ORCH_PERC = ${JSON.stringify(manifest.perc, null, 2)} as const;

export const ORCH_BYTES = ${bytes};
`;
await writeFile(MANIFEST, ts);
console.log(`\nwrote ${MANIFEST} (${(bytes / 1e6).toFixed(2)} MB of samples)`);
