# Credits

Every third-party asset is CC0 (public domain). Each licence was verified from the pack's own
`License.txt` / `LICENSE.txt` on 2026-09-28. Crediting the authors is optional under CC0, but we do it anyway.

## Audio (`public/assets/audio/`, about 120 KB total)

| File(s) | Source file | Pack | Author | Licence | URL |
| --- | --- | --- | --- | --- | --- |
| `clash-1.ogg`, `clash-2.ogg` | `impactMetal_heavy_000.ogg`, `impactMetal_heavy_002.ogg` | Impact Sounds 1.0 | Kenney | CC0 1.0 | https://kenney.nl/assets/impact-sounds |
| `clash-3.ogg` | `impactPlate_heavy_001.ogg` | Impact Sounds 1.0 | Kenney | CC0 1.0 | https://kenney.nl/assets/impact-sounds |
| `seal.ogg` | `impactWood_heavy_001.ogg` | Impact Sounds 1.0 | Kenney | CC0 1.0 | https://kenney.nl/assets/impact-sounds |
| `card-1.ogg`, `card-2.ogg` | `card-slide-2.ogg`, `card-place-1.ogg` | Casino Audio | Kenney | CC0 1.0 | https://kenney.nl/assets/casino-audio |
| `step-0/3/5/7.ogg` | `footstep00/03/05/07.ogg` | RPG Audio | Kenney | CC0 1.0 | https://kenney.nl/assets/rpg-audio |
| `cloth.ogg` | `cloth2.ogg` | RPG Audio | Kenney | CC0 1.0 | https://kenney.nl/assets/rpg-audio |

Licence text: http://creativecommons.org/publicdomain/zero/1.0/

**Synthesized in code (no third-party audio):** the ambient beds (wind, rain, river, distant
Host drums, fire crackle) and the `horn`, `dread` and `reveal` SFX are generated with Web Audio in
`src/audio/engine.ts`. `rout` layers the RPG Audio footsteps and cloth over a synthesized falling tone.

**Orchestral samples (T20b), `public/assets/audio/orch/`, 128 files, about 3.5 MB:** Versilian
Studios Chamber Orchestra 2, Community Edition (VSCO 2 CE), **CC0 1.0**. The licence was checked
on the source page, <https://versilian-studios.com/vsco-community/> ("Licensed under CC0 (Creative
Commons Zero) you can do whatever you want with these samples"), and on the repository, whose
LICENSE is CC0-1.0: <https://github.com/sgossner/VSCO-2-CE>. Used: the violin, cello and
contrabass sections (sustain), F horn, tenor trombone and tuba (sustain), trumpet (sustain and
staccato), F horn and trombone (staccato), harp, timpani hits and
rolls, and from the VSCO 1 percussion set a large ethnic drum (mallet), a low tenor drum, a
marching snare, a bass drum and a clash cymbal. Sparse notes, one velocity layer, trimmed with a release fade and
re-encoded as mono Opus by `npm run build:orchestra` (scripts/build-orchestra.mjs). No attribution
is required; this note is for provenance.

**Background score (T20): generated in code, no recordings.** One mood per time of day (keys,
progressions and a random-walk melody in `src/audio/music.ts`, voices in `src/audio/voices.ts`), so
there are no music licences to verify. Since T20b it plays on the CC0 orchestral samples above
(the synth voices remain as the fallback). The war drums' ostinato (`src/audio/drums.ts`) plays
on the sampled taiko, tenor drum and snare over a faint synth tom, with timpani.

## 3D figures (dev-only Look Lab fallback, not committed and never shipped; `npm run fetch:cc0`)

| Asset | Author | Licence | URL |
| --- | --- | --- | --- |
| KayKit Adventurers 1.0 (`Knight.glb`) | Kay Lousberg | CC0 1.0 | https://github.com/KayKit-Game-Assets/KayKit-Character-Pack-Adventures-1.0 |
| KayKit Skeletons 1.0 (`Skeleton_Warrior.glb`) | Kay Lousberg | CC0 1.0 | https://github.com/KayKit-Game-Assets/KayKit-Character-Pack-Skeletons-1.0 |

Everything else (terrain, figures, effects, textures) is built in code.
