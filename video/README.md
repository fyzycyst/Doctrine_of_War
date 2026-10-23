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

- Each shot runs for its target length, or longer when its VO line needs it (0.5 s before the line, 0.8 s after).
- A real take (`vo/vo-NN.mp3`) replaces the temporary one automatically. Drop it in and re-render.
- **The user's intro** goes after the cold open. Until it's spliced, a 2 s `[intro]` card holds its place. `INTRO=0 npm run render:main` (or `intro: false` in the Studio) drops the card.

## Commands

```sh
npm install
npm run studio           # preview and scrub, both compositions
npm run render:main      # out/doctrine-of-war-1080p.mp4      (1920×1080, 30 fps, H.264 CRF 16, AAC 320k)
npm run render:vertical  # out/doctrine-of-war-vertical.mp4   (1080×1920)
npm run render:all       # both, plus the captions
npm run srt              # out/doctrine-of-war.srt (+ -vertical.srt if its line breaks differ)
npm test                 # timeline and caption tests
npm run typecheck
```

## Look

- **Type:** Cinzel for titles and on-screen text, Alegreya Sans for small print. Both come from Fontsource, as in the game (SIL OFL 1.1).
- **Colour:** the game's palette (ash, ember, banner gold).
- **On-screen text:** sits on a plate between gold hairlines, a nod to the rule banners.
- **Sound:** the score is ducked under the voice, swells on the title, and the victory sting plays under the end card.
- **Licensing:** Remotion is free for individuals and teams of up to three ([licence FAQ](https://www.remotion.dev/docs/license/faq)).
