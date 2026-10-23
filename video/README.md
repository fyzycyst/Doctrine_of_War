# The product video

The edit of the Doctrine of War product video, built with [Remotion](https://www.remotion.dev) (React → video). It is a separate project: its own `package.json`, kept out of the game's build, typecheck, tests and deploy (`vite.config.ts` excludes `video/**`; `.vercelignore` skips it).

The script is the launch kit's video annex, §0.2 (script v3, "the Chronicler"). `src/script.ts` mirrors it: shot order, on-screen text, the VO line at each shot and the target lengths. It drives the whole timeline.

## Media (outside git)

Everything large lives in `$DOW_VIDEO_DIR` (default `~/DoctrineOfWar-video`):

| Folder | What | From |
| --- | --- | --- |
| `footage/` | One clip per shot, plus `manifest.json` | The render agent |
| `music/` | Score stems, named `dusk*`, `battle*`, `dawn*`, `victory*` (see its `README.txt`) | The render agent |
| `vo/` | The Chronicler's takes, `vo-01.mp3` … `vo-10.mp3` | The user (ElevenLabs) |
| `vo-temp/` | A temporary macOS voice, for timing until the takes arrive | `npm run temp-vo` |
| `stills/` | Stand-in stills, used until a shot's clip arrives | `npm run prepare-media` |
| `out/` | Renders and captions | `npm run render:*`, `npm run srt` |

`npm run prepare-media` (run by every script below) does four things:

- links those folders into `video/public/` (gitignored);
- copies the stills;
- makes any missing temporary VO;
- writes `src/generated/media.json`: what exists and how long it runs.

The footage manifest:

```json
{ "shots": [{ "id": "s01-cold-open", "file": "s01-cold-open.mp4", "seconds": 6.0, "focalX": 0.5 }] }
```

- Ids follow `src/script.ts` (`s01-cold-open` … `s11-end-card`).
- `focalX` (0–1) centres the 9:16 crop.
- A clip shorter than its shot holds its last frame.

## Timing

- **With a take:** each shot runs as long as its line needs: 0.5 s before it, 0.8 s after. That never goes below the shot's `min` in `src/script.ts` (default 5 s), which keeps a clip's own beat on screen (a cut inside the clip, the seal pressed, a result shown).
- **Without a take:** the shot runs its §0.2 target.
- `clipStart` trims a clip's dead head.
- A real take (`vo/vo-NN.mp3`) replaces the temporary one automatically.
- **The user's intro** goes after the cold open. Until it's spliced, a 2 s `[intro]` card holds its place. `INTRO=0 npm run render:main` (or `intro: false` in the Studio) drops the card.

## Motion and framing

- **Moves:** each shot has one camera move in `src/script.ts`: push-in, pull-out, pan, tilt, drift, or none. A montage has one move per part.
  - Moves are slow and eased (`src/Motion.tsx`): zooms stay within 4.5%, and pans, tilts and drift stay inside a 5% overscan.
  - A shot's move runs continuously across any cuts inside its clip, so a cut never reads as a zoom resetting.
- **9:16 framing:** a shot is cropped around its focal x (the manifest's, or `vertical.crop`).
  - `vertical.fit` instead fills the width with one range of the frame, over a blurred copy of itself. This is for UI-heavy shots.

## Commands

```sh
npm install
npm run studio           # preview and scrub, both compositions
npm run render:main      # out/doctrine-of-war-1080p.mp4      (1920×1080, 30 fps, H.264 CRF 16, AAC 320k)
npm run render:vertical  # out/doctrine-of-war-vertical.mp4   (1080×1920)
npm run render:all       # both, plus the captions
npm run srt              # out/doctrine-of-war.srt (+ -vertical.srt if its line breaks differ)
npm run loudnorm -- <file.mp4>  # -14 LUFS, ≤ -1 dBTP (every render already runs it)
npm test                 # timeline and caption tests
npm run typecheck
```

## Look

- **Type:** Cinzel for titles and on-screen text, Alegreya Sans for small print. Both come from Fontsource, as in the game (SIL OFL 1.1).
- **Colour:** the game's palette (ash, ember, banner gold).
- **On-screen text:** sits on a plate between gold hairlines, a nod to the rule banners.
- **Sound:** the mix is set as loudness targets, not gains, from each take's and stem's measured LUFS (`src/Soundtrack.tsx`). Every line sits at the same level; the music runs about 14 dB under the voice, swells on the title, and the victory sting plays under the end card.
- **Loudness:** every render is normalised to -14 LUFS integrated, true peak ≤ -1 dBTP. This is a two-pass ffmpeg `loudnorm` (`scripts/loudnorm.ts`); only the audio is re-encoded.
- **Licensing:** Remotion is free for individuals and teams of up to three ([licence FAQ](https://www.remotion.dev/docs/license/faq)).
