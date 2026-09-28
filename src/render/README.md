# src/render: the living diorama

Draws engine state and never decides outcomes (tech plan §2 invariant). Engine *types* may be
imported (see `fromEngine.ts`); engine logic may not.

- `skins/`: **the look as data.** A `Skin` owns terrain and faction palettes, material style
  (standard/toon, outline flag), figure style, island colours and a `lighting` map keyed by
  semantic `TimeOfDay` (`dusk | nightFires | rainGrey | predawn | sunrise`). Scenarios name a
  time of day; the active skin decides how it looks. `emberDusk` is the full skin;
  `illuminatedChronicle` is a rough stub that proves swapping.
- `look/LookContext.tsx`: `LookProvider` + `useLook()` give every component `{ skin, preset, quality }`.
- `fromEngine.ts`: `dioramaSquads(scenario.squads)` and `lightingFor(scenario.timeOfDay)`, mapping
  the engine scenario format to what `Diorama` takes.
- `Diorama.tsx`: composes the island, water, fires, mist, particles, squads, highlights and light
  rig from a `BoardLayout` + `DioramaSquad[]`. Render it inside `<Canvas><LookProvider>`. Props:
  `figures`, `mistDensity` (fog of war), `deploymentHexes` (pulsing zone), `animationRef`.
- **Picking:** raycasts on the island and figures go through the pure helpers in `picking.ts`
  (`worldToHex`, `pickBoardHex`, `resolveClick`) into the app store: `hoveredHex`,
  `hoveredSquadId`, `selectedHex`, `selectedSquadId` (`setHoveredHex`, `selectHex`, `selectSquad`,
  `clearSelection`). `terrain/BoardHighlights.tsx` draws the hover/selection outlines; the squad
  selection halo lives in `figures/SquadMarkers.tsx`.
- **Squad animations** (`figures/squadAnimation.ts`): `animationRef.current` is a
  `SquadAnimationApi`. Every call returns a Promise that resolves when the animation ends:
  - `march(id, path: HexCoord[], { secondsPerHex })`: walks hex to hex (hops height changes),
    turns to face the move, and stays at the last hex until the squad's `hex` prop catches up.
  - `lunge(id, targetHex)`: the front ranks surge half a hex toward the target, jab, fall back.
  - `fall(id, n)`: the next `n` figures in survival order topple and dither out; lowering
    `strength` afterwards removes the same slots, so there is no pop.
  - `rout(id, { direction? })`: figures scatter toward the faction's home edge and fade; the
    banner drops and the ring goes out. Hidden until `reset(id)`.
  - `rally(id)`: an upright snap and hop, a banner lift and flare, and a ring flash.
  - `brace(id, { hold })`: crouch, tighten ranks and lean into the shields, then release.
  - `reveal(id)`: fog of war. The squad resolves out of the mist (see Fog of war below).
  - `reset(id?)` clears persistent animation state.
- **Weather (T08):** `<LookProvider weather="clear|rain|mist|ashWind">` (use `weatherFor(view.weather)`).
  Each skin owns `weather: Record<WeatherKind, WeatherPreset>` overlays that are layered on the
  time-of-day preset: mist, particles (rain streaks, ash flurries blowing east), wetness (darker,
  glossier terrain and water ripples), light, sky tint and grading. A change cross-fades over 2.5 s
  (`atmosphere/atmosphereRuntime.ts`; the pure `mixWeather` is tested).
- **Fog of war (T08):** `<Diorama visibility={visibilityFromView(view, scenario)}>` (in
  `fromEngine.ts`; it approximates the seen hexes until the engine exports `visibleHexes()`, so
  swapping is one line). Unseen board hexes fill with a tall, dim mist and the terrain under them
  desaturates. Squads with `lastKnown: true` (mapped from `VisibleSquad.lastKnown` by
  `dioramaSquads`) draw as dark dithered silhouettes with a colourless rag banner and a dashed ring.
  **Reveal hook:** when a squad that was hidden or a ghost becomes visible, the Diorama plays
  `reveal(id)` (figures rise and resolve, the banner unfurls, the ring draws on) while the mist over
  its hex tears open, then calls `onReveal(squadIds)`. Playback can also call
  `animationRef.current.reveal(id)` directly.
- **Audio (T08), stable path `src/audio`:** `playSfx(name)` with `clash | horn | card | seal |
  rout | dread | reveal`; `useAmbience({ timeOfDay, weather, water, hostDrums })` (or
  `setAmbience`) cross-fades the synthesized beds (wind, rain, river, drums, fire); call
  `unlockAudio()` from a user gesture (`useAmbience` does it on the first pointerdown). Mute and
  volume live in `useAudioStore` (`src/app/audioStore.ts`, persisted to localStorage). Sources and
  licences are in `/CREDITS.md`.
- **Render scale:** `canvasDpr(quality, ultra?)` in `quality.ts`: high caps at DPR 1.5, low is 1,
  and ultra (opt-in) is full device DPR.
- `terrain/buildIsland.ts`: a pure builder from a `BoardLayout` to one merged vertex-coloured
  geometry: tiles, a continuous jagged rock underside, props, roads, walls/gate, town, and sunken
  `river` channels that run off the board into a waterfall. It also returns anchors (water, flow,
  fires, gate banner).
- `atmosphere/`: backdrop and cloud sea, ground mist (per-hex `densityByHex` = fog of war),
  embers/ash/rain, fires.
- `figures/`: (a) instanced toy soldiers (with ember glints and a dithered `aFade`), (b) KayKit
  CC0 figures (fallback only), and shared banners, cohesion rings, renown crests and contact
  shadows (`SquadMarkers`).
- `camera/`, `post/`, `lighting/`: clamped orbit + idle drift (`wideShot(boardRadius)`,
  `closeShot(target)`), the post stack (bloom, separable tilt-shift, tone mapping, grade), and the
  light rig.
- `lab/`: the dev-only Look Lab at `?lab=1` (`&scenario=firstBreach|emberFord`, `&board=stress`,
  `&preset= &skin= &figures=a|b &quality= &cam=wide|close &az= &polar= &dist= &fog=1 &deploy=1
  &select=<id> &hover=q,r &anim=<name>&animSquad=<id>&animFreeze=<s> &ui=0 &still=1`).
  `npm run capture [-- filter]` saves PNGs to `captures/`.
