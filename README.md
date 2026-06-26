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

## Checks

```bash
npm test
npm run build
```

## Project Shape

- `src/game/` contains pure TypeScript game types, scenario data, doctrines, and phase resolution.
- `src/game/board.ts` contains axial hex helpers, terrain definitions, lookup, pixel projection, and defense bonuses.
- `src/ui/` contains React UI components for the briefing, doctrine panel, hex battlefield, battle report, objective summary, and action controls.
- `src/App.tsx` coordinates tutorial state, doctrine assignments, deployment, phase commits, phase playback, and composition of the extracted UI panels.
- `PRD.md` and `Stakeholder_Needs.md` capture the product intent and MVP constraints.

## IP Guardrails

This project should not use Tolkien-specific names, quoted lines, places, species-specific lore, hobbit analogues, or recognizable story structures. Common fantasy ingredients may be used only through original naming, worldbuilding, and mechanics.
