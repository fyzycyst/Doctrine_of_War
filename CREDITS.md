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

**Background score (T20): generated in code, no recordings.** One mood per time of day (keys,
progressions and a random-walk melody in `src/audio/music.ts`, voices in `src/audio/voices.ts`), so
there are no music licences to verify and it adds 0 bytes of assets. The war drums are synthesized
the same way (`src/audio/drums.ts`).

## 3D figures (dev-only Look Lab fallback, not committed and never shipped; `npm run fetch:cc0`)

| Asset | Author | Licence | URL |
| --- | --- | --- | --- |
| KayKit Adventurers 1.0 (`Knight.glb`) | Kay Lousberg | CC0 1.0 | https://github.com/KayKit-Game-Assets/KayKit-Character-Pack-Adventures-1.0 |
| KayKit Skeletons 1.0 (`Skeleton_Warrior.glb`) | Kay Lousberg | CC0 1.0 | https://github.com/KayKit-Game-Assets/KayKit-Character-Pack-Skeletons-1.0 |

Everything else (terrain, figures, effects, textures) is built in code.
