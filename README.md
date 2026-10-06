# Doctrine of War: Ash & Banner

Doctrine of War: Ash & Banner is a web-first fantasy command game prototype. Players lead the Free Banners in the tutorial scenario, assign doctrines to squads during command windows, and watch deterministic battle phases resolve against the Ashen Host.

## Current Status

This repository implements the first playable tutorial scenario plus the first board-first post-MVP pass:

- Vite + React + TypeScript web app.
- One tutorial scenario: `The First Breach`.
- Player controls the Free Banners.
- Ashen Host acts first through scripted phase pressure.
- Hex-based 2D battlefield with terrain, deployment hexes, and objective hexes.
- Preset doctrine assignment from pick lists.
- Squad-level strength, cohesion, and Resolve.
- Deterministic hex-based phase resolution with terrain defense, support radius, objective pressure, structured phase events, readable/fast visual playback, and battle reports.

Deferred until later:

- Doctrine editing.
- Multi-scenario campaign progression.
- Resolve persistence between scenarios.
- Campaign editor.
- Larger maps, scrolling, art assets, and richer unit tokens.
- Playback off switch.
- Deliberate in-phase unit movement.
- Utility AI skirmish mode.
- Save/load.
- Mac packaging or native app.

## Board-First Evaluation

The first post-MVP board pass moved the tutorial from a lane-field prototype to a small hex battlefield. The result supports player deployment before phase one, terrain effects during resolution, structured support/engagement/objective events, and readable phase playback that resolves each engagement at human-perceptible speed.

This is enough to keep exploring the board-first direction. The next product decision should focus on whether larger scenarios remain legible before adding campaign breadth, a doctrine editor, or a utility AI opponent.

## Run Locally

```bash
npm install
npm run dev
```

Then open the local URL printed by Vite.

**npm 11 gotcha:** npm 11's install-scripts policy skips Electron's postinstall, so the
Electron binary is never downloaded and `npm run dev:mac` / `npm run capture` fail. After
`npm install`, run once:

```bash
node node_modules/electron/install.js
```

**Benign Electron log lines on macOS.** `npm run dev:mac` may print these to the terminal. They are
Chromium's, not the game's, and nothing in the game depends on them:

- `ERROR:sandbox/mac/system_services.cc:35] SetApplicationIsDaemon: … paramErr (-50)`: Chromium's
  macOS sandbox calls `SetApplicationIsDaemon()` in every sandboxed helper process as it starts
  (GPU, network, audio service, …), and recent macOS (seen on 26.x) rejects the call. It shows up
  when a helper process launches, e.g. the audio service on the first click.
- `ERROR:gpu/…/shared_image_manager.cc:254] SharedImageManager::ProduceSkia: Trying to Produce a
  Skia representation from a non-existent mailbox`: Chromium's GPU process asked to draw a shared
  image (e.g. a WebGL canvas frame) that was already released, which can happen when a canvas is
  destroyed or its context is lost between compositor frames. It's reported across Chromium apps.
  Each screen (title, campaign map, battle) mounts its own WebGL canvas, but T20 couldn't
  reproduce the message on Electron 44.4.5 / macOS 26.5.1 through title → campaign → battle,
  resizes, hide/minimize/restore or the first audio click. If it ever comes with a visible
  glitch, the fix is one persistent `<Canvas>` shared across screens; until then it's log noise.

### Look Lab and screenshots

- `npm run dev`, then open `/?lab=1` for the dev-only diorama lab (`&scenario=firstBreach|emberFord`,
  `&board=stress`, `&preset=`, `&skin=`, `&quality=low`; see `src/render/README.md`).
- `npm run capture [-- <filter>]` saves 1600×1000 PNGs of the lab into `captures/` (gitignored).
- `npm run fetch:cc0` downloads the optional CC0 KayKit figures (figure approach b) into
  `lab-assets/`. They are lab-only: served by the dev server, never bundled or shipped.

### Capture mode and video frames

- `?capture=1` turns on capture mode (`useCaptureStore` in `src/app/captureStore.ts`): UI layers
  hide so the diorama records clean.
- `npm run capture -- --sequence <path> [--scenario firstBreach|emberFord] [--seconds 8] [--fps 30]`
  steps the scene deterministically along a cinematic camera path and writes
  `captures/seq-<path>/frame_0000.png …`. Paths: `craneInGate`, `bannerDolly`, `riverPush`
  (Ember Ford) and `titleFlyover`.
- Turn a sequence into a clip with ffmpeg (optional, not needed by the project):

```bash
ffmpeg -framerate 30 -i captures/seq-craneInGate/frame_%04d.png -c:v libx264 -pix_fmt yuv420p -crf 16 crane-in.mp4
```


## Checks

```bash
npm test              # fast: unit, UI and engine tests
npm run test:balance  # simulation-heavy: balance smokes, role sweeps, ablations
npm run test:finale   # the finale's (Cinder Road battle 6) sweeps
npm run build
```

A test file runs under `npm run test:balance` when it is named `balance.<battle>.test.ts` or
`*.sim.test.ts`, and under `npm run test:finale` when it is the finale's
(`cinderRoad6[.*].sim.test.ts`, `balance.cinderRoad6.test.ts`; `src/test/suites.ts`); see
"Test suites" in docs/CAMPAIGN.md.

## Project Shape

- `src/game/` contains pure TypeScript game types, scenario data, doctrines, and phase resolution.
- `src/game/board.ts` contains axial hex helpers, terrain definitions, lookup, pixel projection, and defense bonuses.
- `src/ui/` contains React UI components for the briefing, doctrine panel, hex battlefield, battle report, objective summary, and action controls.
- `src/App.tsx` coordinates tutorial state, doctrine assignments, deployment, phase commits, phase playback, and composition of the extracted UI panels.
- `PRD.md` and `Stakeholder_Needs.md` capture the product intent and MVP constraints.

## IP Guardrails

This project should not use Tolkien-specific names, quoted lines, places, species-specific lore, hobbit analogues, or recognizable story structures. Common fantasy ingredients may be used only through original naming, worldbuilding, and mechanics.
