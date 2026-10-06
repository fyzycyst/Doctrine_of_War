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
  - **Playback controls:** `setTimeScale(n)` sets tween speed (1 is normal, 0.5 is half, 0 is
    frozen), and `pause()` / `resume()` freeze every tween and restore the previous speed. There
    are no casts needed; they are on `SquadAnimationApi`.
  - `shakeObjective(hex, intensity = 1)`: an objective takes a hit. The walls and gatehouse (their
    own mesh, `island.wallGeometry`) jolt with a damped shudder, which is skipped under reduced
    motion. A dust cloud billows from the gate's outer face and a few stones fall. It resolves when
    the effect ends, and it follows the animator clock, so pause and time scale apply to it.
    On an open-ground prop (M2) the hit is a smaller jolt plus splinters and a puff of steam and
    smoke (Host props), or stone chips and spray (the sluice).
- **Objective props (M2):** `BoardHex.objectiveKind?: "gatehouse" | "barricade" | "wagons" | "sluice"`
  is render-only and set per objective hex. When it is absent, a wall objective gets the gatehouse
  and open ground gets nothing. `terrain/objectiveProps.ts` builds the barricade, the wagon park and
  the sluice-house in three stages. `<Diorama objectiveStates={objectiveStagesFor(view.objectives,
  scenario.objectives)}>` swaps each objective to "battered" (at or below 70% of its starting
  integrity) or "broken" (0), independently, with any number per board. A battered or broken Host
  prop has staved barrels, overturned carts, and doused fire-pots that steam; the pots go out in
  `Fires`. The sluice cracks and jets water when battered, and is breached and running when broken.
  Under reduced motion the stages are static and the only particles are light, slow steam or spray.
  Roads lead each road hex to its nearest objective, with ties going to the Host's (`roadGoals`,
  `nearestRoadGoal`), whatever the order of the hex list. In a channel the sluice turns with the
  water through its own hex (`localFlow`), and its house stands on the dry bank. `closeShotOn(board,
  hexes)` (shots.ts) is a close beat on a few hexes, e.g. Cinder Road 2's Sluice Walk and sluice.
- **Gatehouse (CR6):** the gate's holder is read from the deployment (`objectiveHolder`; First Breach
  and Hold for Dawn: the Banners, Cinder Road 6: the Host), and the gate banner hangs in the holder's
  colours (`island.gateHolder`). The wall line is built per stage of its gatehouse objective
  (`island.wallStages`, keyed by `island.gateKey`). Battered: cracked masonry, merlons knocked off,
  rubble, the doors bowed and split. Breached: a tower top down, the lintel cracked, the doors burst
  in, the banner torn down onto the rubble, and the gate's torches out. Nothing burns. The intact
  walls are byte-identical to before (the stages replay the same random draws). The walls are still
  drawn north to south with the gate facing west, which is right for every board so far.
  `disposeIsland(island)` frees every geometry an island build owns.
  `BoardHex.gatehouse?: true` (render-only, accepted by the pack manifest) draws a wall hex as the
  gatehouse though it is no objective, e.g. the pursuit's Greyford Gate. It gets the holder's banner
  and torches, and stays intact: no stages, and its torches aren't tied to an objective.
- **Sides (CR6):** `sides(board)` gives each faction's default facing and the way it flees. The
  convention (the Host from the west) holds unless the Banners deploy clearly west of the Host, and
  then both turn round. The Diorama applies it to squads still on the mapper's default facing, to
  ghosts and to routs. On a turned-round board the key and fill lights, and the sky's sun glow, mirror east to west
  (`lightAzimuth`, the `mirror` prop on `LightRig` and `SkyDome`). That keeps the rig's rule of a warm
  key from the Banners' side, and lights the gate face they attack in Cinder Road 6.
- **River dressing (M2):** Ember Ford's burning bridge wrecks and the Host's bank braziers appear
  only under `nightFires` (`atmosphere/fireRules.ts`; braziers are `island.brazierGeometry`). By day
  the wrecks are cold, charred stumps trailing a thin smoke. `BoardLayout.fordDressing?:
  "bridgeWrecks" | "none"` (render-only, accepted by the pack manifest) drops the wrecks and
  braziers on a board whose fords were never burned bridges, e.g. Cinder Road 2. A ford hex's own
  `BoardHex.fordDressing` overrides the board's for that ford's stumps (e.g. "none" on Open a Road's
  Tollhouse Shallows, beside Ember Ford's burned bridges); the braziers follow the board.
- **Weather (T08):** `<LookProvider weather="clear|rain|mist|ashWind">` (use `weatherFor(view.weather)`).
  Each skin owns `weather: Record<WeatherKind, WeatherPreset>` overlays that are layered on the
  time-of-day preset: mist, particles (rain streaks, ash flurries blowing east), wetness (darker,
  glossier terrain and water ripples), light, sky tint and grading. A change cross-fades over 2.5 s
  (`atmosphere/atmosphereRuntime.ts`; the pure `mixWeather` is tested).
- **Fog of war (T08):** `<Diorama visibility={visibilityFromView(view, scenario)}>` (in
  `fromEngine.ts`; it approximates the seen hexes until the engine exports `visibleHexes()`, so
  swapping is one line). Unseen board hexes fill with drifting, lit battlefield mist (uneven
  top, low veil, crests lit by the key light and nearby fires) and the terrain under them
  desaturates. Squads with `lastKnown: true` (mapped from `VisibleSquad.lastKnown` by
  `dioramaSquads`) draw as dark translucent silhouettes with a soft rim, a slow breathing fade, a
  colourless tattered banner and a dashed ring.
  **Reveal hook:** when a squad that was hidden or a ghost becomes visible, the Diorama plays
  `reveal(id)` (1.2 s: figures resolve from silhouette to colour over ~0.8 s, the furled banner
  snaps open with its colour at 0.55 s, the ring draws on) and `atmosphere.swirl(x, z)` (the mist
  twists and parts around the squad) while its hex clears, then calls `onReveal(squadIds)`; the
  `reveal` sfx is timed to the same beats. Playback can also call
  `animationRef.current.reveal(id)` directly.
- **Audio (T08), stable path `src/audio`:** `playSfx(name)` with `clash | horn | card | seal |
  rout | dread | reveal`; `useAmbience({ timeOfDay, weather, water, hostDrums })` (or
  `setAmbience`) cross-fades the synthesized beds (wind, rain, river, drums, fire); call
  `unlockAudio()` from a user gesture (`useAmbience` does it on the first pointerdown). Mute and
  volume live in `useAudioStore` (`src/app/audioStore.ts`, persisted to localStorage). Sources and
  licences are in `/CREDITS.md`.
  - **War drums (T20):** a martial 16-step ostinato whose density, force, tempo and closeness
    follow battle intensity: `setDrumIntensity(DRUM_BASE.command | DRUM_BASE.playback)` sets the
    resting level; clash/rout/horn/dread/reveal SFX and predawn → sunrise swell it by themselves
    (`swellDrums(moment)` for anything else).
  - **Score (T20):** a generative score per time of day (`music.ts`), following the ambience by
    itself (`setMusic(mood | null)` pins a mood for menus). It ducks under every SFX and has its own
    volume, `useAudioStore.musicVolume`.
  - **From the first screen (T24):** the app unlocks audio itself (`installAudioUnlock` in
    `src/app/audioCues.ts`): at start-up in the Mac app (its window sets
    `autoplayPolicy: "no-user-gesture-required"`, `electron/windowOptions.ts`), otherwise on the
    first click or key anywhere. The first sound fades in over 2 s at the player's volume and mute.
    Menus pin the dusk score and call `clearAmbience()` (no battle beds, no war drums); a battle's
    `useAmbience` brings them back. With no pin and no battle ambience yet, the score keeps its
    last mood, so there's no gap between screens. `useAmbience` no longer unlocks (the lab passes
    `{ unlock: true }`).
  - **Orchestra (T20b):** the score, motifs and drum ostinato play on CC0 VSCO 2 CE samples
    (`sampler.ts`, `score.ts`; about 2.9 MB in `public/assets/audio/orch/`, built by
    `npm run build:orchestra`). They load lazily after the first interaction, and each voice falls
    back to its synth twin until it decodes or if loading fails. Motifs: a Banners horn call on
    `horn`, Host low brass and drums on `dread`, a strings-and-horns swell on predawn → sunrise,
    and `playSting("victory" | "defeat")` for outcomes.
  - **Demos:** `npm run audio:demo` renders the drums (command, playback, an engagement swell),
    each mood, the motifs and the victory/defeat stingers offline to `captures/audio/*.wav`, with
    a levels report.
- **Render scale:** `canvasDpr(quality, ultra?)` in `quality.ts`: high caps at DPR 1.5, low is 1,
  and ultra (opt-in) is full device DPR.
- **Showcase (T13), `src/render/showcase/`:**
  - `<TitleScene title? subtitle? board? squads? startAt?>{menu}</TitleScene>`: a full-screen
    title scene. A looping crane (`titleFlyover`) runs over First Breach at dusk with the squads at
    the gate. The title is an HTML overlay in Cinzel; `children` is the menu slot (hidden in capture
    mode). It holds still under prefers-reduced-motion and follows the quality setting.
  - `<CampaignMap battles={[{ id, title, timeOfDay, status, board?, placeholder? }]} onSelect>`:
    the war as an archipelago, one miniature island per battle (`buildIsland` at a small scale;
    a battle without a board gets `placeholderBoard("saltmarsh" | "holdForDawn")`; the real
    campaign passes every scenario's board, and the placeholders remain for unbuilt battles).
    - Status `locked`: misty and dim. `current`: glows, flies the banner, lit braziers. `won`:
      Banner flag. `stalemate`: half-lit, flag at half height. `lost`: ashen, Host flag.
    - A dotted march path runs between the islands, gold up to the current battle.
    - Hover shows a DOM label projected from 3D (the current battle is always labelled).
    - Clicking a non-locked island calls `onSelect(id)` and dollies in on it (click-to-zoom).
      Focus is controlled with `focusedId` / `onFocusChange(id | null)`, or left uncontrolled. The
      built-in "← Back to the map" button and Escape return to the overview; hide them with
      `showBackButton={false}` to use your own. The overview fits the whole archipelago and pans
      gently.
    - The march route is a dotted ink trail with small glowing pips only up to the current battle.
  - **Campaign map for up to 11 battles (M1):** `islandPlacement(i, n)` (`showcase/archipelagoLayout.ts`,
    pure and tested) keeps the four-battle S-curve for up to 5; from 6 it lays a winding road in
    rows that recede into the distance (6 = 3+3, 8 = 4+4, 11 = 4+4+3), turning at each row's end.
    The overview camera fits width and depth (`overviewFrame`, steeper for several rows), and the
    scene fog, shadows and embers scale with the layout.
  - `<CampaignSelectBackdrop chains={[{ id, boards }]} highlightedId?>{overlay}</CampaignSelectBackdrop>`:
    a calm "choose a campaign" establishing shot, composed for a campaign list on the left third.
    Each campaign is a cluster of up to three miniature islands (rock undersides kept) joined by a
    faint ink trail under a Banners pennant; clusters sit centre and right with clear sky between.
    `highlightedId` moves that cluster to the nearest, largest slot and dims the rest (they ease
    between slots). Cinderreach smoulders on the horizon: layered broken ash ridges fading into an
    ember haze, kiln glows as soft smudges at different depths and sizes, two thin smoke columns;
    never a single peak. Low, slowly drifting camera (still under reduced motion).
    `framing="right"` (T25) nudges the picture right and steps the camera back so every cluster
    sits in the right ~60%, beside a panel docked on the left. The highlighted cluster also lifts,
    gains a warm rim light and a small title label (`chains[].title`), and the camera eases toward
    it; under reduced motion it's rim light, dim and label only. Lab: `&framing=right&panel=1`,
    `&skirmish=1`, `&motion=reduce`.
    Lab: `?lab=1&view=campaignSelect&highlight=<id>`.
  - **Capture mode:** `useCaptureStore` (`src/app/captureStore.ts`), on with `?capture=1`.
  - **Cinematic paths:** `camera/cameraPath.ts` has keyframed `CameraPath`s with a pure
    `sampleCameraPath`, and `cinematicPaths(board)` returns `craneInGate`, `bannerDolly`,
    `riverPush` (river boards) and `titleFlyover`. `<CinematicCamera path>` drives the camera from
    the R3F clock, so it is deterministic under `advance(t)`.
- **Saltmarsh and Hold for Dawn:**
  - Both skins style every `TerrainType`, including `marsh` and `reeds`.
  - Marsh is dark wet peat, set low, with dark pools (small water patches), sedge tussocks and
    stumps. Reeds are dense clumps taller than the figures (they screen what's behind), in their
    own mesh (`island.reedGeometry`) with a wind-sway shader.
  - `DioramaSquad.kind = "column"` is the noncombatant refugee Column: hooded walkers with lanterns
    or staffs (no weapons), two covered carts and a small pale lantern banner. `dioramaSquads()`
    maps it from the engine's `noncombatant: true`.
  - `DioramaSquad.kind = "siege"` (engine `role: "siege"`, e.g. the Cinderram): a wheeled ram
    shed under wet hides with a smouldering ridge and an ember-hot ram head, crew on the flank
    files. When the time of day switches to `sunrise` the hides burn away on screen (~1 s: steam
    puffs, the hides slump and fade, bare rafters left; instant under reduced motion); arriving
    at sunrise they are already gone.
  - The Column's cart lanterns carry a soft additive glow: the warm accent of the rain.
  - Renowned squads (the champion, "The Last Cinder") carry a larger crest and a thin gold outer
    ring that reads at the wide shot.
  - Boards bigger than Ember Ford push the scene fog back (`LightRig fogOffset`), so their wider
    wide shot isn't buried in fog.
  - **Time of day cross-fades:** when `<LookProvider timeOfDay>` changes (e.g. predawn → sunrise
    on Hold for Dawn's last phase), the lighting blends over `timeOfDayFade` seconds (default 3;
    pass ~2 for a staged turn) on the R3F clock (`look/blendPresets.ts`, pure and tested). The
    Cinderram's hide burn runs over the first half of it. Under reduced motion it cuts.
  - **March zone (T21 muster):** `<Diorama deploymentHexes={hexes} zoneStyle="march">` draws the
    hexes the selected company can march to: a faint cool fill, a silver-blue edge with a thin dark
    outline (legible on bright dusk and at night), and chevrons pointing away from the selected
    squad (`useAppStore.selectedSquadId`) that drift outward (static under reduced motion).
    `zoneStyle="deploy"` (default) keeps the gold deployment pulse. Lab: `&march=1&select=<id>`
    (`&march=gold` draws the same hexes the old way).
  - **Exit edge:** `<Diorama exitHexes={edgeHexes}>` marks an escape edge (Saltmarsh's southern
    row): a faint pale glow brightest toward the off-board side and chevrons drifting off the
    board (`terrain/ExitMarkers.tsx`; static under reduced motion, not pickable). Exit hexes are
    known ground: the fog of war never covers them (`knownHexes`), and the markers draw after the
    mist.
  - Lab: `&scenario=saltmarsh` and `&scenario=holdForDawn` load the real scenarios
    (`&fadeTo=sunrise&fadeAt=0.8` shows the fade).
- `terrain/buildIsland.ts`: a pure builder from a `BoardLayout` to one merged vertex-coloured
  geometry: tiles, a continuous jagged rock underside, props, roads, walls/gate, town, and sunken
  `river` channels that run off the board into a waterfall. It also returns anchors (water, flow,
  fires, gate banner).
- `atmosphere/`: backdrop and cloud sea, ground mist (per-hex `densityByHex` = fog of war),
  embers/ash/rain, fires.
- `figures/`: (a) instanced toy soldiers (with ember glints, a dithered `aFade` and a reveal `aSilhouette`), (b) KayKit
  CC0 figures (fallback only), and shared banners, cohesion rings, renown crests and contact
  shadows (`SquadMarkers`).
- `camera/`, `post/`, `lighting/`: clamped orbit + idle drift (`wideShotFor(board)`: boards bigger
  than Ember Ford get a tighter frame biased toward the Banners' deployment and objectives; plain
  `wideShot(boardRadius)` for the rest,
  `closeShot(target)`), the post stack (bloom, separable tilt-shift, tone mapping, grade), and the
  light rig.
- `lab/`: the dev-only Look Lab at `?lab=1` (`&scenario=firstBreach|emberFord`, `&board=stress`,
  `&preset= &skin= &figures=a|b &quality= &cam=wide|close &az= &polar= &dist= &fog=1 &deploy=1
  &select=<id> &hover=q,r &anim=<name>&animSquad=<id>&animFreeze=<s> &ui=0 &still=1`).
  `npm run capture [-- filter]` saves PNGs to `captures/`.
