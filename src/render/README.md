# src/render: the living diorama

Draws engine state and never decides outcomes (tech plan §2 invariant).

- `skins/`: **the look as data.** A `Skin` owns terrain and faction palettes, material style
  (standard/toon, outline flag), figure style, island colours and a `lighting` map keyed by
  semantic `TimeOfDay` (`dusk | nightFires | rainGrey | predawn | sunrise`). Scenarios name a
  time of day; the active skin decides how it looks. `emberDusk` is the full skin;
  `illuminatedChronicle` is a rough stub that proves swapping.
- `look/LookContext.tsx`: `LookProvider` + `useLook()` give every component `{ skin, preset, quality }`.
- `Diorama.tsx`: composes the island, water, fires, mist, particles, squads and light rig from a
  `BoardLayout` + `DioramaSquad[]`. Render it inside `<Canvas><LookProvider>`.
- `terrain/buildIsland.ts`: pure builder from a `BoardLayout` to one merged vertex-coloured geometry
  (tiles, cliffs, props, roads, walls/gate, town), plus anchors (water, waterfall, fires, gate banner).
- `atmosphere/`: backdrop and cloud sea, ground mist (per-hex `densityByHex` = future fog of war),
  embers/ash/rain, fires.
- `figures/`: (a) instanced toy soldiers, (b) KayKit CC0 figures, shared banners, cohesion rings and
  contact shadows (`SquadMarkers`).
- `camera/`, `post/`, `lighting/`: clamped orbit + idle drift, post stack (bloom, separable
  tilt-shift, tone mapping, grade), light rig.
- `lab/`: dev-only Look Lab at `?lab=1` (`&preset= &skin= &figures=a|b &quality= &cam=wide|close
  &fog=1 &ui=0 &still=1`). `npm run capture [-- filter]` saves PNGs to `captures/`.
