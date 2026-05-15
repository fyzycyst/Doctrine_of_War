# Doctrine of War: Ash & Banner

Doctrine of War: Ash & Banner is a web-first fantasy command game prototype. Players lead the Free Banners in the tutorial scenario, assign doctrines to squads during command windows, and watch deterministic battle phases resolve against the Ashen Host.

## MVP Status

This repository currently implements the first playable MVP slice:

- Vite + React + TypeScript web app.
- One tutorial scenario: `The First Breach`.
- Player controls the Free Banners.
- Ashen Host acts first through scripted phase pressure.
- 2D lane-field hybrid battlefield.
- Preset doctrine assignment from pick lists.
- Squad-level strength, cohesion, and Resolve.
- Deterministic phase resolution with battle reports.

Deferred until later:

- Doctrine editing.
- Multi-scenario campaign progression.
- Resolve persistence between scenarios.
- Campaign editor.
- Utility AI skirmish mode.
- Save/load.
- Mac packaging or native app.

## Post-MVP Direction

The first MVP proved the core loop is promising, and the first post-MVP UI slices have started reducing the wall-of-words interface: squad/gate stats now use compact meters with exact values still available through accessible labels, battle reports can collapse, doctrine summaries are no longer always visible, and the desktop layout gives the battlefield more priority. Next slices should explore full-window terrain, a move toward hex-based 2D positioning, player unit placement, terrain effects, shared-effect indicators, and animated combat/state changes during phase resolution.

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
- `src/ui/` contains extracted React UI components for the briefing, doctrine panel, battlefield, battle report, objective summary, and action controls.
- `src/App.tsx` coordinates tutorial state, doctrine assignments, phase commits, and composition of the extracted UI panels.
- `PRD.md` and `Stakeholder_Needs.md` capture the product intent and MVP constraints.

## IP Guardrails

This project should not use Tolkien-specific names, quoted lines, places, species-specific lore, hobbit analogues, or recognizable story structures. Common fantasy ingredients may be used only through original naming, worldbuilding, and mechanics.
